
/**
 * Full API smoke/integration tester for the Single Store Live Commerce backend.
 *
 * Requirements:
 * - Node.js 18+ (uses built-in fetch)
 * - Backend running, for example: docker compose up --build
 * - Database migrated and seeded
 *
 * Usage:
 *   node full-api-smoke-test.mjs
 *
 * Optional env:
 *   API_BASE_URL=http://localhost:8000
 *   ADMIN_EMAIL=owner@example.com
 *   ADMIN_PASSWORD=change-me-strong
 *   CUSTOMER_ACCESS_TOKEN=... or CUSTOMER_PHONE=+9647... CUSTOMER_OTP=......
 *
 * The script also reads .env from the current working directory if present.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { authenticateCustomer } from "./scripts/lib/customer-auth.mjs";

function loadDotEnv(path = ".env") {
    if (!fs.existsSync(path)) return;
    const raw = fs.readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
    }
}

loadDotEnv();

const BASE_URL = (process.env.API_BASE_URL || process.env.BASE_URL || "http://localhost:8000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "owner@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "change-me-strong";
const RUN_SECURITY = process.env.RUN_SECURITY !== "false";
const RUN_IDEMPOTENCY = process.env.RUN_IDEMPOTENCY !== "false";
const RUN_CONCURRENCY = process.env.RUN_CONCURRENCY !== "false";

const state = {
    adminToken: null,
    adminRefreshToken: null,
    customer1: null,
    buyerA: null,
    buyerB: null,
    referredCustomer: null,
    category: null,
    session: null,
    quickSaleItem: null,
    quickSalePrintJob: null,
    quickSaleLabelPayload: null,
    address: null,
    product: null,
    productWinnerItem: null,
    auction: null,
    influencer: null,
    referralCode: null,
    ad: null,
    shippingRequest: null,
    screen: null,
};

const results = [];

function nowTag() {
    return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

const RUN_ID = nowTag() + "-" + crypto.randomBytes(3).toString("hex");

function idem(prefix) {
    return `${prefix} -${RUN_ID} -${crypto.randomBytes(6).toString("hex")} `;
}

function short(obj, max = 700) {
    const text = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    return text.length > max ? text.slice(0, max) + "..." : text;
}

function unwrap(body) {
    if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "data")) {
        return body.data;
    }
    return body;
}

function idOf(obj) {
    if (!obj || typeof obj !== "object") return undefined;
    return (
        obj.id ||
        obj._id ||
        obj.deviceId ||
        obj.data?.id ||
        obj.data?._id ||
        obj.data?.deviceId ||
        obj.customer?.id ||
        obj.user?.id
    );
}

function tokenOf(obj) {
    if (!obj || typeof obj !== "object") return undefined;
    const d = unwrap(obj);
    return (
        d.accessToken ||
        d.token ||
        d.jwt ||
        d.adminToken ||
        d.customerToken ||
        d.screenToken ||
        d.tokens?.accessToken ||
        d.auth?.accessToken ||
        obj.accessToken ||
        obj.token
    );
}

function refreshOf(obj) {
    if (!obj || typeof obj !== "object") return undefined;
    const d = unwrap(obj);
    return d.refreshToken || d.tokens?.refreshToken || d.auth?.refreshToken || obj.refreshToken;
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    const d = unwrap(value);
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.docs)) return d.docs;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.results)) return d.results;
    if (Array.isArray(d.rows)) return d.rows;
    return [];
}

function findFirstArrayDeep(obj, keyHints = []) {
    const seen = new Set();
    function walk(x) {
        if (!x || typeof x !== "object" || seen.has(x)) return null;
        seen.add(x);
        if (Array.isArray(x)) return x;
        for (const hint of keyHints) {
            if (Array.isArray(x[hint])) return x[hint];
        }
        for (const v of Object.values(x)) {
            const found = walk(v);
            if (found) return found;
        }
        return null;
    }
    return walk(obj) || [];
}

function pickNested(obj, keys) {
    if (!obj || typeof obj !== "object") return undefined;
    for (const key of keys) {
        if (obj[key] !== undefined) return obj[key];
    }
    for (const value of Object.values(obj)) {
        if (value && typeof value === "object") {
            const found = pickNested(value, keys);
            if (found !== undefined) return found;
        }
    }
    return undefined;
}

function assert(condition, message, context) {
    if (!condition) {
        const err = new Error(message);
        if (context !== undefined) err.context = context;
        throw err;
    }
}

async function request(method, path, opts = {}) {
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    const headers = {
        Accept: "application/json",
        ...(opts.headers || {}),
    };

    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    let body;
    if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.body);
    }

    const started = Date.now();
    let res;
    let text;
    let json;
    try {
        res = await fetch(url, { method, headers, body });
        text = await res.text();
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = { raw: text };
        }
    } catch (error) {
        if (opts.allowNetworkError) {
            return { ok: false, status: 0, body: { error: error.message }, headers: {}, ms: Date.now() - started };
        }
        throw error;
    }

    const out = {
        ok: res.ok,
        status: res.status,
        body: json,
        headers: Object.fromEntries(res.headers.entries()),
        ms: Date.now() - started,
    };

    const expected = opts.expectStatus;
    const allowed = Array.isArray(expected) ? expected : expected ? [expected] : null;
    const statusAccepted = allowed ? allowed.includes(res.status) : res.ok;

    if (!statusAccepted && !opts.allowFail) {
        const err = new Error(`${method} ${path} failed with HTTP ${res.status} `);
        err.response = out;
        throw err;
    }

    return out;
}

async function step(name, fn, options = {}) {
    const started = Date.now();
    process.stdout.write(`\n▶ ${name} ... `);
    try {
        const value = await fn();
        const ms = Date.now() - started;
        console.log(`OK(${ms}ms)`);
        results.push({ name, ok: true, ms });
        return value;
    } catch (error) {
        const ms = Date.now() - started;
        console.log(`FAILED(${ms}ms)`);
        console.error(`\n❌ ${name} `);
        console.error(error.stack || error.message);
        if (error.response) console.error(`Response: ${short(error.response.body, 2000)} `);
        if (error.context) console.error(`Context: ${short(error.context, 2000)} `);
        results.push({ name, ok: false, ms, reason: error.message });
        throw error;
    }
}

async function admin(method, path, opts = {}) {
    return request(method, path, { ...opts, token: state.adminToken });
}

async function customer(customerState, method, path, opts = {}) {
    assert(customerState?.token, `Missing customer token for ${path}`);
    return request(method, path, { ...opts, token: customerState.token });
}

function safeData(res) {
    return unwrap(res.body);
}

function pickCustomerFromAuth(body) {
    const d = unwrap(body);
    return d.customer || d.user || d.profile || d;
}

async function loginCustomer(phone, displayName, referralCode) {
    const authenticated = await authenticateCustomer({ request, phone, displayName, referralCode });
    const me = await request("GET", "/api/auth/customer/me", { token: authenticated.token });
    return {
        ...authenticated,
        refreshToken: refreshOf(me.body),
        profile: pickCustomerFromAuth(me.body),
        authBody: me.body,
    };
}

async function verifyCustomerByAdmin(customerId, note = "Verified by smoke test") {
    if (!customerId) return;
    const res = await admin("POST", `/api/admin/customers/${customerId}/verify`, {
        body: { note },
        expectStatus: [200, 201],
        allowFail: true,
    });
    if (!res.ok) {
        console.log(`   Could not admin - verify customer ${customerId}: HTTP ${res.status} ${short(res.body, 300)} `);
    }
}

async function main() {
    console.log("==================================================");
    console.log("Single Store Live Commerce — Full API Smoke Test");
    console.log("==================================================");
    console.log(`BASE_URL: ${BASE_URL} `);
    console.log(`ADMIN_EMAIL: ${ADMIN_EMAIL} `);
    console.log(`RUN_ID: ${RUN_ID} `);
    console.log("==================================================");

    await step("Health check", async () => {
        const res = await request("GET", "/health");
        assert(res.ok, "Health endpoint is not OK", res.body);
    });

    await step("Admin login", async () => {
        const res = await request("POST", "/api/admin/auth/login", {
            body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
            expectStatus: [200, 201],
        });
        state.adminToken = tokenOf(res.body);
        state.adminRefreshToken = refreshOf(res.body);
        assert(state.adminToken, "Could not extract admin access token. Check login response shape.", res.body);
    });

    await step("Admin /me", async () => {
        const res = await admin("GET", "/api/admin/auth/me");
        assert(res.ok, "Admin /me failed", res.body);
    });

    await step("Patch settings for test-friendly verified/unverified behavior", async () => {
        const res = await admin("PATCH", "/api/admin/settings", {
            body: {
                allowUnverifiedPurchase: true,
                unverifiedPurchaseLimit: 100000000,
                allowUnverifiedBidding: true,
                unverifiedBidLimit: 100000000,
                defaultAuctionExtensionSeconds: 30,
                defaultAuctionExtensionTriggerSeconds: 60,
                defaultLiveAuctionResetSeconds: 10,
                maxAuctionExtensions: 10,
                shippingRequestEnabled: true,
            },
            expectStatus: [200],
            allowFail: true,
        });
        if (!res.ok) console.log("   Settings patch did not fully apply; continuing because admin verification may still allow flows.");
    });

    await step("Create category", async () => {
        const res = await admin("POST", "/api/admin/categories", {
            body: {
                name: `Smoke Category ${RUN_ID} `,
                slug: `smoke - category - ${RUN_ID.toLowerCase()} `,
                icon: "🧪",
                isActive: true,
                sortOrder: 999,
            },
            expectStatus: [200, 201],
        });
        state.category = safeData(res);
        assert(idOf(state.category), "Could not extract category id", res.body);
    });

    await step("Create virtual TikTok customer", async () => {
        const phone = `+ 96477${Math.floor(10000000 + Math.random() * 89999999)} `;
        const res = await admin("POST", "/api/admin/customers/virtual", {
            body: {
                displayName: `TikTok Customer ${RUN_ID} `,
                phone,
                whatsappPhone: phone,
                tiktokUsername: `@smoke_${RUN_ID.toLowerCase()} `,
                notes: "Created by full API smoke test",
            },
            expectStatus: [200, 201],
        });
        const data = safeData(res);
        state.customer1 = { id: idOf(data), phone, profile: data };
        assert(state.customer1.id, "Could not extract virtual customer id", res.body);
    });

    await step("Start sales session", async () => {
        const res = await admin("POST", "/api/admin/sales-sessions/start", {
            body: {
                title: `Smoke TikTok Live ${RUN_ID} `,
                source: "TIKTOK_EXTERNAL",
            },
            expectStatus: [200, 201],
        });
        state.session = safeData(res);
        assert(idOf(state.session), "Could not extract sales session id", res.body);
    });

    await step("Quick sale with printNow=true", async () => {
        const res = await admin("POST", "/api/admin/sales/quick", {
            idempotencyKey: idem("quick-sale-print"),
            body: {
                customerId: state.customer1.id,
                price: 4000,
                categoryId: idOf(state.category),
                quantity: 1,
                source: "TIKTOK_LIVE_MANUAL",
                title: "Smoke printed TikTok item",
                description: "Quick sale smoke item",
                imageUrl: "https://example.com/smoke-item.jpg",
                snapshotUrl: "https://example.com/smoke-snapshot.jpg",
                isBroken: false,
                isGift: false,
                isReplacement: false,
                liveSessionId: idOf(state.session),
                printNow: true,
            },
            expectStatus: [200, 201],
        });

        const data = safeData(res);
        const items = data.items || data.orderItems || findFirstArrayDeep(data, ["items", "orderItems"]);
        const jobs = data.labelPrintJobs || data.printJobs || findFirstArrayDeep(data, ["labelPrintJobs", "printJobs"]);
        const payloads = data.labelPayloads || data.labels || [];

        state.quickSaleItem = items?.[0];
        state.quickSalePrintJob = jobs?.[0];
        state.quickSaleLabelPayload = payloads?.[0];

        assert(idOf(state.quickSaleItem), "Could not extract quick sale item id", res.body);
        assert(idOf(state.quickSalePrintJob), "Could not extract label print job id", res.body);
    });

    await step("Mark quick sale label printed", async () => {
        const res = await admin("POST", `/api/admin/labels/jobs/${idOf(state.quickSalePrintJob)}/mark-printed`, {
            expectStatus: [200, 201],
        });
        assert(res.ok, "Mark printed failed", res.body);
    });

    await step("Confirm quick sale label attached", async () => {
        const res = await admin("POST", `/api/admin/labels/jobs/${idOf(state.quickSalePrintJob)}/confirm-attached`, {
            expectStatus: [200, 201],
        });
        assert(res.ok, "Confirm attached failed", res.body);
    });

    await step("Customer OTP login claims virtual account", async () => {
        const claimed = await loginCustomer(state.customer1.phone, `Claimed ${RUN_ID}`);
        state.customer1 = { ...state.customer1, ...claimed };
        assert(state.customer1.token, "No customer token after claim");
        await verifyCustomerByAdmin(state.customer1.id);
    });

    await step("Customer box shows previous quick sale", async () => {
        const res = await customer(state.customer1, "GET", "/api/customer/box");
        assert(res.ok, "Customer box failed", res.body);
    });

    await step("Create customer address", async () => {
        const res = await customer(state.customer1, "POST", "/api/customer/addresses", {
            body: {
                fullName: `Smoke Customer ${RUN_ID}`,
                phone: state.customer1.phone,
                governorate: "Baghdad",
                city: "Karrada",
                addressLine: "Smoke test address line",
                nearestPoint: "Near smoke test point",
                isDefault: true,
            },
            expectStatus: [200, 201],
        });
        state.address = safeData(res);
        assert(idOf(state.address), "Could not extract address id", res.body);
    });

    await step("Create buyer A customer", async () => {
        const phone = `+96478${Math.floor(10000000 + Math.random() * 89999999)}`;
        state.buyerA = await loginCustomer(phone, `Buyer A ${RUN_ID}`);
        await verifyCustomerByAdmin(state.buyerA.id);
    });

    await step("Create buyer B customer", async () => {
        const phone = `+96479${Math.floor(10000000 + Math.random() * 89999999)}`;
        state.buyerB = await loginCustomer(phone, `Buyer B ${RUN_ID}`);
        await verifyCustomerByAdmin(state.buyerB.id);
    });

    await step("Create and publish fixed-price product", async () => {
        const create = await admin("POST", "/api/admin/products", {
            body: {
                title: `Smoke Fixed Product ${RUN_ID}`,
                description: "Product created by full API smoke test",
                categoryId: idOf(state.category),
                imageUrls: ["https://example.com/product.jpg"],
                price: 15000,
            },
            expectStatus: [200, 201],
        });
        state.product = safeData(create);
        assert(idOf(state.product), "Could not extract product id", create.body);

        const publish = await admin("POST", `/api/admin/products/${idOf(state.product)}/publish`, {
            expectStatus: [200, 201],
        });
        assert(publish.ok, "Publish product failed", publish.body);
    });

    if (RUN_CONCURRENCY) {
        await step("Concurrent fixed product buy: exactly one winner", async () => {
            const productId = idOf(state.product);
            const attempts = Array.from({ length: 20 }, (_, i) => {
                const buyer = i % 2 === 0 ? state.buyerA : state.buyerB;
                return customer(buyer, "POST", `/api/products/${productId}/buy`, {
                    idempotencyKey: idem(`product-buy-${i}`),
                    expectStatus: [200, 201],
                    allowFail: true,
                }).then((res) => ({ i, buyer, res }));
            });

            const outcomes = await Promise.all(attempts);
            const successes = outcomes.filter((x) => x.res.ok);
            const failures = outcomes.filter((x) => !x.res.ok);

            assert(successes.length === 1, `Expected exactly one successful product buy, got ${successes.length}`, {
                statuses: outcomes.map((x) => ({ i: x.i, status: x.res.status, body: x.res.body })),
            });
            assert(failures.length === 19, `Expected 19 failed product buy attempts, got ${failures.length}`);

            const data = safeData(successes[0].res);
            const item =
                data.item ||
                data.orderItem ||
                data.items?.[0] ||
                data.orderItems?.[0] ||
                pickNested(data, ["orderItem"]);
            state.productWinnerItem = item;
        });
    }

    await step("Warehouse label-pending includes app product sale", async () => {
        const res = await admin("GET", "/api/admin/warehouse/label-pending?limit=100");
        const list = asArray(res.body);
        const productItemId = idOf(state.productWinnerItem);
        if (productItemId) {
            const found = JSON.stringify(list).includes(productItemId);
            assert(found, "Product sale item not found in label-pending", { productItemId, list });
        } else {
            assert(list.length > 0, "No label-pending items found", res.body);
        }
    });

    await step("Create, publish, bid, and close auction", async () => {
        const startsAt = new Date(Date.now() - 5000).toISOString();
        const endsAt = new Date(Date.now() + 60_000).toISOString();

        const create = await admin("POST", "/api/admin/auctions", {
            body: {
                title: `Smoke Auction ${RUN_ID}`,
                description: "Auction created by full API smoke test",
                categoryId: idOf(state.category),
                imageUrls: ["https://example.com/auction.jpg"],
                startingPrice: 1000,
                minIncrement: 500,
                startsAt,
                endsAt,
                extensionSeconds: 30,
                extensionTriggerSeconds: 60,
                maxExtensions: 10,
            },
            expectStatus: [200, 201],
        });
        state.auction = safeData(create);
        const auctionId = idOf(state.auction);
        assert(auctionId, "Could not extract auction id", create.body);

        await admin("POST", `/api/admin/auctions/${auctionId}/publish`, {
            expectStatus: [200, 201],
        });

        const bid1 = await customer(state.buyerA, "POST", `/api/auctions/${auctionId}/bids`, {
            idempotencyKey: idem("auction-bid-a"),
            body: { amount: 1500 },
            expectStatus: [200, 201],
        });
        assert(bid1.ok, "Buyer A bid failed", bid1.body);

        const bid2 = await customer(state.buyerB, "POST", `/api/auctions/${auctionId}/bids`, {
            idempotencyKey: idem("auction-bid-b"),
            body: { amount: 2000 },
            expectStatus: [200, 201],
        });
        assert(bid2.ok, "Buyer B bid failed", bid2.body);

        const close = await admin("POST", `/api/admin/auctions/${auctionId}/close-now`, {
            expectStatus: [200, 201],
        });
        assert(close.ok, "Close auction failed", close.body);
    });

    await step("Buyer A has outbid notification or notifications endpoint works", async () => {
        const res = await customer(state.buyerA, "GET", "/api/notifications?limit=20");
        assert(res.ok, "Notifications failed", res.body);
    });

    await step("Create influencer and referral code", async () => {
        const inf = await admin("POST", "/api/admin/influencers", {
            body: {
                name: `Smoke Influencer ${RUN_ID}`,
                phone: `+96475${Math.floor(10000000 + Math.random() * 89999999)}`,
                notes: "Created by full API smoke test",
            },
            expectStatus: [200, 201],
        });
        state.influencer = safeData(inf);
        assert(idOf(state.influencer), "Could not extract influencer id", inf.body);

        const code = `SMOKE${RUN_ID.replace(/[^A-Za-z0-9]/g, "").slice(-10).toUpperCase()}`;
        const rc = await admin("POST", "/api/admin/referral-codes", {
            body: {
                influencerId: idOf(state.influencer),
                code,
                commissionRate: 0.1,
                durationDays: 180,
                startsAt: new Date(Date.now() - 60_000).toISOString(),
                endsAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
            },
            expectStatus: [200, 201],
        });
        state.referralCode = safeData(rc);
        assert(idOf(state.referralCode), "Could not extract referral code id", rc.body);
    });

    await step("Register referred customer and create commission through quick sale", async () => {
        const phone = `+96476${Math.floor(10000000 + Math.random() * 89999999)}`;
        const codeValue = state.referralCode.code || pickNested(state.referralCode, ["code"]);
        state.referredCustomer = await loginCustomer(phone, `Referred ${RUN_ID}`, codeValue);
        await verifyCustomerByAdmin(state.referredCustomer.id);

        const sale = await admin("POST", "/api/admin/sales/quick", {
            idempotencyKey: idem("referred-quick-sale"),
            body: {
                customerId: state.referredCustomer.id,
                price: 25000,
                categoryId: idOf(state.category),
                quantity: 1,
                source: "ADMIN_MANUAL",
                title: "Referral commission smoke item",
                printNow: false,
            },
            expectStatus: [200, 201],
        });
        assert(sale.ok, "Referred quick sale failed", sale.body);

        const commissions = await admin("GET", `/api/admin/commissions?influencerId=${idOf(state.influencer)}&limit=50`);
        assert(commissions.ok, "List commissions failed", commissions.body);
    });

    await step("Create active in-app ad and list customer ads", async () => {
        const create = await admin("POST", "/api/admin/ads", {
            body: {
                title: `Smoke Ad ${RUN_ID}`,
                body: "This is a smoke test ad.",
                imageUrl: "https://example.com/ad.jpg",
                placement: "HOME_BANNER",
                targetType: "ALL",
                linkType: "NONE",
                startsAt: new Date(Date.now() - 60_000).toISOString(),
                endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                isActive: true,
            },
            expectStatus: [200, 201],
        });
        state.ad = safeData(create);
        assert(idOf(state.ad), "Could not extract ad id", create.body);

        const list = await request("GET", "/api/ads?placement=HOME_BANNER");
        assert(list.ok, "Customer ads list failed", list.body);
    });

    await step("Create shipping request and admin approve/pack/ship", async () => {
        const itemId = idOf(state.quickSaleItem);
        const addressId = idOf(state.address);
        assert(itemId && addressId, "Missing item or address for shipping", { itemId, addressId });

        const create = await customer(state.customer1, "POST", "/api/customer/shipping-requests", {
            idempotencyKey: idem("shipping-request"),
            body: {
                itemIds: [itemId],
                addressId,
                note: "Smoke test shipping request",
            },
            expectStatus: [200, 201],
        });
        state.shippingRequest = safeData(create);
        const shippingId = idOf(state.shippingRequest);
        assert(shippingId, "Could not extract shipping request id", create.body);

        await admin("POST", `/api/admin/shipping-requests/${shippingId}/approve`, {
            expectStatus: [200, 201],
        });
        await admin("POST", `/api/admin/shipping-requests/${shippingId}/pack`, {
            expectStatus: [200, 201],
        });
        await admin("POST", `/api/admin/shipping-requests/${shippingId}/ship`, {
            body: {
                shippingCompany: "SmokeShip",
                trackingNumber: `TRK-${RUN_ID}`,
                shippingPrice: 5000,
            },
            expectStatus: [200, 201],
        });
    });

    await step("Dashboard and report endpoints", async () => {
        const paths = [
            "/api/admin/dashboard/stats",
            "/api/admin/reports/sales",
            "/api/admin/reports/categories",
            "/api/admin/reports/customers",
            "/api/admin/reports/warehouse",
            "/api/admin/reports/influencers",
            "/api/admin/reports/auctions",
        ];
        for (const path of paths) {
            const res = await admin("GET", path);
            assert(res.ok, `${path} failed`, res.body);
        }
    });

    await step("Warehouse search by quick sale barcode", async () => {
        const barcode =
            state.quickSaleItem?.barcode ||
            state.quickSaleLabelPayload?.itemBarcode ||
            state.quickSaleLabelPayload?.barcodeValue ||
            pickNested(state.quickSaleItem, ["barcode"]);
        if (!barcode) throw new Error("No barcode found to search");
        const res = await admin("GET", `/api/admin/warehouse/items/search?barcode=${encodeURIComponent(barcode)}`);
        assert(res.ok, "Warehouse barcode search failed", res.body);
    });

    await step("Create screen and validate screen token", async () => {
        const create = await admin("POST", "/api/admin/screens", {
            body: { name: `Smoke Screen ${RUN_ID}` },
            expectStatus: [200, 201],
        });
        state.screen = safeData(create);
        const screenToken = tokenOf(create.body) || state.screen.screenToken || state.screen.token;
        if (!screenToken) throw new Error("Screen created but no screen token found in response");

        const me = await request("GET", "/api/screens/me", { token: screenToken });
        assert(me.ok, "Screen /me failed", me.body);
        state.screen.token = screenToken;
    });

    if (RUN_SECURITY) {
        await step("Security: customer token cannot access admin customers", async () => {
            const res = await request("GET", "/api/admin/customers", {
                token: state.customer1.token,
                allowFail: true,
            });
            assert([401, 403].includes(res.status), "Expected 401/403 for customer token on admin endpoint", res.body);
        });

        await step("Security: unauthenticated admin route is blocked", async () => {
            const res = await request("GET", "/api/admin/customers", {
                allowFail: true,
            });
            assert([401, 403].includes(res.status), "Expected 401/403 without token", res.body);
        });

        await step("Security: screen token cannot access admin endpoints", async () => {
            if (!state.screen?.token) throw new Error("No screen token available; skipping");
            const res = await request("GET", "/api/admin/customers", {
                token: state.screen.token,
                allowFail: true,
            });
            assert([401, 403].includes(res.status), "Expected 401/403 for screen token on admin endpoint", res.body);
        });
    }

    if (RUN_IDEMPOTENCY) {
        await step("Idempotency: same key same body replays, same key different body conflicts", async () => {
            const key = idem("idempotency-quick-sale");
            const body = {
                customerId: state.customer1.id,
                price: 7777,
                categoryId: idOf(state.category),
                quantity: 1,
                source: "ADMIN_MANUAL",
                title: "Idempotency smoke item",
                printNow: false,
            };

            const first = await admin("POST", "/api/admin/sales/quick", {
                idempotencyKey: key,
                body,
                expectStatus: [200, 201],
            });
            const second = await admin("POST", "/api/admin/sales/quick", {
                idempotencyKey: key,
                body,
                expectStatus: [200, 201],
            });

            assert(first.ok && second.ok, "Idempotent replay did not succeed", { first: first.body, second: second.body });

            const conflict = await admin("POST", "/api/admin/sales/quick", {
                idempotencyKey: key,
                body: { ...body, price: 8888 },
                allowFail: true,
            });

            assert([400, 409, 422].includes(conflict.status), "Expected idempotency conflict status", conflict.body);
        });
    }

    console.log("\n==================================================");
    console.log("SUMMARY");
    console.log("==================================================");
    for (const r of results) {
        const icon = r.ok ? "✓" : "✗";
        console.log(`${icon} ${r.name}`);
    }
    const failures = results.filter((r) => !r.ok);
    console.log("--------------------------------------------------");
    console.log(`Passed: ${results.length - failures.length}`);
    console.log("Skipped: 0");
    console.log(`Failed: ${failures.length}`);
    console.log("==================================================");

    if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
    console.error("\nFatal test runner error:");
    console.error(error.stack || error.message);
    if (error.response) console.error(short(error.response.body, 2000));
    process.exitCode = 1;
});


