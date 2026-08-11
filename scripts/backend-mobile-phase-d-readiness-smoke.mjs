/** Authenticated Phase D backend readiness smoke. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { authenticateCustomer, unwrap, tokenOf } from './lib/customer-auth.mjs';

function loadDotEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index > 0 && !process.env[trimmed.slice(0, index).trim()])
      process.env[trimmed.slice(0, index).trim()] = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
  }
}
loadDotEnv();

const baseUrl = (
  process.env.API_BASE_URL ||
  process.env.BASE_URL ||
  'http://localhost:8080'
).replace(/\/+$/, '');
const adminEmail = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || 'owner@example.com';
const adminPassword =
  process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || 'change-me-strong';
const runId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const results = [];
const state = {};

const idOf = (value) => unwrap(value)?.id || unwrap(value)?.productId || unwrap(value)?.orderItemId;
const items = (body) => {
  const data = unwrap(body);
  return Array.isArray(data) ? data : data?.items || [];
};
const safe = (value) =>
  JSON.stringify(value ?? null).replace(
    /"(?:accessToken|refreshToken|password|otp|authorization)"\s*:\s*"[^"]*"/gi,
    '"[redacted]":"[redacted]"',
  );
const idem = (prefix) => `${prefix}-${runId}-${crypto.randomBytes(4).toString('hex')}`;

async function request(method, path, { token, body, expected = [200, 201], idempotencyKey } = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!expected.includes(response.status))
    throw new Error(`${method} ${path} -> ${response.status} ${safe(parsed)}`);
  return { status: response.status, body: parsed };
}
const admin = (method, path, options = {}) =>
  request(method, path, { ...options, token: state.adminToken });
const customer = (method, path, options = {}) =>
  request(method, path, { ...options, token: state.customerToken });

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'FAIL', reason: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

async function main() {
  console.log(`Phase D backend readiness smoke (${baseUrl})`);
  await step('health', async () => {
    if (unwrap((await request('GET', '/health')).body)?.status !== 'ok')
      throw new Error('health status was not ok');
  });
  await step('admin login', async () => {
    state.adminToken = tokenOf(
      (
        await request('POST', '/api/admin/auth/login', {
          body: { email: adminEmail, password: adminPassword },
        })
      ).body,
    );
    if (!state.adminToken) throw new Error('admin token missing');
  });
  await step('Phase D permission catalog', async () => {
    const text = JSON.stringify(items((await admin('GET', '/api/admin/permissions/catalog')).body));
    for (const key of [
      'auctions.set_vip',
      'notifications.send',
      'shipping.ship',
      'commissions.mark_paid',
      'reports.sales',
    ])
      if (!text.includes(key)) throw new Error(`missing ${key}`);
    if (text.includes('"live.')) throw new Error('deprecated Live permissions remain assignable');
  });
  await step('active category', async () => {
    state.category = items(
      (await admin('GET', '/api/admin/categories?isActive=true&limit=1')).body,
    )[0];
    if (!state.category?.id) throw new Error('no active seeded category');
  });
  await step('customer authentication is required', async () => {
    const requestedPhone =
      process.env.CUSTOMER_PHONE || `+964770${Math.floor(1000000 + Math.random() * 8999999)}`;
    state.customer = await authenticateCustomer({
      request: (method, path, options = {}) => request(method, path, options),
      phone: requestedPhone,
      displayName: `Phase D Customer ${runId}`,
    });
    state.customerToken = state.customer.token;
    state.customerId = state.customer.id;
    await admin('POST', `/api/admin/customers/${state.customerId}/verify`, { body: {} });
  });
  if (!state.customerToken) {
    console.log('Passed: 0 / Skipped: 0 / Failed: 1');
    process.exitCode = 1;
    return;
  }
  await step('admin notification preview, send, unread and batch-read', async () => {
    const message = {
      titleAr: 'D6 Runtime Smoke',
      titleEn: 'D6 Runtime Smoke',
      bodyAr: 'D6 persisted one-customer runtime verification',
      bodyEn: 'D6 persisted one-customer runtime verification',
      audienceType: 'ONE_CUSTOMER',
      customerId: state.customerId,
      linkType: 'NONE',
    };
    const unreadBefore = unwrap((await customer('GET', '/api/notifications/unread-count')).body);
    const preview = unwrap(
      (
        await admin('POST', '/api/admin/notifications/audience-preview', {
          body: { audienceType: message.audienceType, customerId: message.customerId },
        })
      ).body,
    );
    if (preview?.recipientCount !== 1) throw new Error('notification preview count was not one');
    const idempotencyKey = idem('notification-send');
    const sent = unwrap(
      (
        await admin('POST', '/api/admin/notifications/send', {
          idempotencyKey,
          body: message,
        })
      ).body,
    );
    if (!sent?.campaignId || sent?.createdCount !== 1)
      throw new Error('notification campaign delivery failed');
    const replayed = unwrap(
      (
        await admin('POST', '/api/admin/notifications/send', {
          idempotencyKey,
          body: message,
        })
      ).body,
    );
    if (replayed?.campaignId !== sent.campaignId || replayed?.createdCount !== 1)
      throw new Error('idempotent notification retry changed the campaign result');
    const unreadAfter = unwrap((await customer('GET', '/api/notifications/unread-count')).body);
    if (unreadAfter?.count !== unreadBefore?.count + 1)
      throw new Error('notification send did not increase unread count by one');
    const list = items((await customer('GET', '/api/notifications?limit=50')).body);
    const persisted = list.find(
      (item) => item.titleAr === message.titleAr && item.bodyAr === message.bodyAr && !item.isRead,
    );
    if (!persisted?.id) throw new Error('persisted customer notification was not found');
    const campaigns = items((await admin('GET', '/api/admin/notifications?limit=50')).body);
    if (!campaigns.some((campaign) => campaign.id === sent.campaignId))
      throw new Error('notification campaign was not found in history');
    const details = unwrap(
      (await admin('GET', `/api/admin/notifications/${sent.campaignId}`)).body,
    );
    if (details?.id !== sent.campaignId || details?.recipientCount !== 1)
      throw new Error('notification campaign detail contract failed');
    await admin('POST', '/api/admin/notifications/send', {
      expected: [400],
      idempotencyKey: idem('notification-live-rejected'),
      body: { ...message, linkType: 'LIVE', linkTargetId: 'legacy-live' },
    });
    const unread = list.filter((item) => !item.isRead);
    await customer('POST', `/api/notifications/${persisted.id}/read`);
    const remaining = unread.filter((item) => item.id !== persisted.id).map((item) => item.id);
    const batch = unwrap(
      (await customer('POST', '/api/notifications/read-batch', { body: { ids: remaining } })).body,
    );
    if (typeof batch?.updatedCount !== 'number')
      throw new Error('notification unread/batch response contract failed');
    state.notificationCampaignId = sent.campaignId;
  });
  await step('Live customer and admin routes are unavailable', async () => {
    await request('GET', '/api/live/current', { expected: [404] });
    await admin('GET', '/api/admin/live-sessions', { expected: [404] });
  });
  await step('deprecated Live ad destinations are rejected', async () => {
    await admin('POST', '/api/admin/ads', {
      expected: [400],
      body: {
        title: `Rejected Live Ad ${runId}`,
        imageUrl: 'https://example.com/ad.jpg',
        placement: 'LIVE_BANNER',
        targetType: 'ALL',
        linkType: 'LIVE',
        priority: 1,
        sortOrder: 0,
      },
    });
  });
  await step('ad placement and priority', async () => {
    const ad = unwrap(
      (
        await admin('POST', '/api/admin/ads', {
          body: {
            title: `Phase D Ad ${runId}`,
            body: 'Phase D',
            imageUrl: 'https://example.com/ad.jpg',
            placement: 'STORE_HERO',
            targetType: 'ALL',
            linkType: 'NONE',
            startsAt: new Date(Date.now() - 1000).toISOString(),
            endsAt: new Date(Date.now() + 300000).toISOString(),
            priority: 10,
            sortOrder: 0,
          },
        })
      ).body,
    );
    const publicAds = items((await request('GET', '/api/ads?placement=STORE_HERO')).body);
    if (!publicAds.some((item) => item.id === ad.id))
      throw new Error('STORE_HERO ad contract failed');
  });
  await step('customer address lifecycle', async () => {
    state.address = unwrap(
      (
        await customer('POST', '/api/customer/addresses', {
          body: {
            fullName: 'Phase D Customer',
            phone: '+964770000001',
            governorate: 'Baghdad',
            city: 'Baghdad',
            addressLine: `Phase D address ${runId}`,
            isDefault: true,
          },
        })
      ).body,
    );
    await customer('GET', '/api/customer/addresses');
    await customer('PATCH', `/api/customer/addresses/${state.address.id}`, {
      body: { nearestPoint: 'Phase D test point' },
    });
    await customer('POST', `/api/customer/addresses/${state.address.id}/set-default`);
  });
  await step('real product purchase to warehouse label eligibility', async () => {
    const created = unwrap(
      (
        await admin('POST', '/api/admin/products', {
          body: {
            title: `Phase D Shipping Product ${runId}`,
            description: 'Phase D shipping smoke',
            categoryId: state.category.id,
            imageUrls: ['https://example.com/phase-d.jpg'],
            price: 4000,
          },
        })
      ).body,
    );
    await admin('POST', `/api/admin/products/${created.id}/publish`);
    const purchased = unwrap(
      (
        await customer('POST', `/api/products/${created.id}/buy`, {
          idempotencyKey: idem('product-buy'),
          body: { quantity: 1 },
        })
      ).body,
    );
    const orderItem = (purchased.orderItems || purchased.items || [])[0] || purchased.orderItem;
    state.orderItemId = orderItem?.id || orderItem?.orderItemId;
    if (!state.orderItemId) throw new Error('product purchase did not return an order item id');
    const pending = items(
      (
        await admin(
          'GET',
          `/api/admin/warehouse/label-pending?customerId=${state.customerId}&limit=50`,
        )
      ).body,
    );
    const eligible = pending.find((item) => (item.id || item.orderItemId) === state.orderItemId);
    if (!eligible) throw new Error('purchased item was not label-eligible');
    await admin('POST', `/api/admin/warehouse/items/${state.orderItemId}/print-label`, {
      idempotencyKey: idem('print-label'),
    });
    await admin('POST', `/api/admin/warehouse/items/${state.orderItemId}/confirm-label-attached`);
  });
  await step('shipping request approve-pack-ship and immutable snapshot', async () => {
    const created = unwrap(
      (
        await customer('POST', '/api/customer/shipping-requests', {
          idempotencyKey: idem('shipping-request'),
          body: {
            itemIds: [state.orderItemId],
            addressId: state.address.id,
            note: 'Phase D shipping smoke',
          },
        })
      ).body,
    );
    state.shippingId = created.id;
    const initialSnapshot =
      created.addressSnapshot || created.shippingAddressSnapshot || created.address_snapshot;
    if (!state.shippingId || !initialSnapshot)
      throw new Error('shipping request did not return an address snapshot');
    await customer('GET', `/api/customer/shipping-requests/${state.shippingId}`);
    await admin('GET', `/api/admin/shipping-requests/${state.shippingId}`);
    await admin('POST', `/api/admin/shipping-requests/${state.shippingId}/approve`);
    await admin('POST', `/api/admin/shipping-requests/${state.shippingId}/pack`);
    await admin('POST', `/api/admin/shipping-requests/${state.shippingId}/ship`, {
      body: {
        shippingCompany: 'Phase D Carrier',
        trackingNumber: `PD-${runId}`,
        shippingPrice: 2500,
      },
    });
    const final = unwrap(
      (await customer('GET', `/api/customer/shipping-requests/${state.shippingId}`)).body,
    );
    if (
      final.status !== 'SHIPPED' ||
      JSON.stringify(
        final.addressSnapshot || final.shippingAddressSnapshot || final.address_snapshot,
      ) !== JSON.stringify(initialSnapshot)
    )
      throw new Error('shipping transition or snapshot immutability failed');
  });
  await step('influencer, commission and reports', async () => {
    const influencer = unwrap(
      (
        await admin('POST', '/api/admin/influencers', {
          body: { name: `Phase D Influencer ${runId}` },
        })
      ).body,
    );
    const code = unwrap(
      (
        await admin('POST', '/api/admin/referral-codes', {
          body: {
            influencerId: influencer.id,
            code: `PD${runId.replace(/\D/g, '').slice(-8)}`,
            commissionRate: 5,
            durationDays: 30,
          },
        })
      ).body,
    );
    if (!influencer?.id || !code?.id) throw new Error('influencer/referral create failed');
    await admin('GET', `/api/admin/influencers/${influencer.id}/commissions`);
    await admin('GET', `/api/admin/influencers/${influencer.id}/report`);
    for (const path of [
      '/api/admin/reports/sales',
      '/api/admin/reports/categories',
      '/api/admin/reports/customers',
      '/api/admin/reports/warehouse',
      '/api/admin/reports/influencers',
      '/api/admin/reports/auctions',
    ])
      await admin('GET', path);
  });
  await step('OpenAPI reflects the Phase D.6 reset', async () => {
    const res = await request('GET', '/api/docs-json');
    const paths = res.body?.paths || {};
    if (Object.keys(paths).some((path) => path.toLowerCase().includes('/live')))
      throw new Error('OpenAPI still exposes Live paths');
    for (const path of [
      '/api/admin/notifications/audience-preview',
      '/api/admin/notifications/send',
      '/api/admin/notifications',
      '/api/admin/notifications/{id}',
    ]) {
      if (!paths[path]) throw new Error(`OpenAPI missing ${path}`);
    }
  });

  const passed = results.filter((result) => result.status === 'PASS').length;
  const failed = results.filter((result) => result.status === 'FAIL').length;
  console.log(`Passed: ${passed} / Skipped: 0 / Failed: ${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FATAL: ${error.message}`);
  console.log(
    `Passed: ${results.filter((r) => r.status === 'PASS').length} / Skipped: 0 / Failed: 1`,
  );
  process.exitCode = 1;
});
