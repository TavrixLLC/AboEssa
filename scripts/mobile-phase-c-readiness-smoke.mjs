/**
 * Backend Mobile Phase C readiness smoke test.
 *
 * Usage:
 *   node scripts/mobile-phase-c-readiness-smoke.mjs
 *
 * Optional env:
 *   API_BASE_URL=http://localhost:8080
 *   ADMIN_EMAIL=owner@example.com
 *   ADMIN_PASSWORD=change-me-strong
 *   CUSTOMER_ACCESS_TOKEN=... or CUSTOMER_PHONE=+9647... CUSTOMER_PASSWORD=...
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { authenticateCustomer } from "./lib/customer-auth.mjs";

function loadDotEnv(path = ".env") {
  if (!fs.existsSync(path)) return;
  const raw = fs.readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const BASE_URL = (process.env.API_BASE_URL || process.env.BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "owner@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "change-me-strong";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + crypto.randomBytes(3).toString("hex");
const results = [];
const state = {
  adminToken: undefined,
  buyerA: undefined,
  buyerB: undefined,
  category: undefined,
  product: undefined,
  inventoryProduct: undefined,
  auction: undefined,
  uploadImplemented: false,
};

function idem(prefix) {
  return `${prefix}-${RUN_ID}-${crypto.randomBytes(4).toString("hex")}`;
}

function phone(suffix) {
  return `+9647${suffix}${Math.floor(1000000 + Math.random() * 8999999)}`;
}

function unwrap(body) {
  return body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
}

function idOf(value) {
  const data = unwrap(value);
  if (!data || typeof data !== "object") return undefined;
  return data.id || data.productId || data.auctionId || data.customer?.id || data.product?.id || data.auction?.id;
}

function tokenOf(body) {
  const data = unwrap(body);
  return data?.accessToken || data?.tokens?.accessToken;
}

function asItems(body) {
  const data = unwrap(body);
  if (Array.isArray(data)) return data;
  return data?.items || [];
}

function sanitized(value) {
  const clone = JSON.parse(JSON.stringify(value ?? null));
  function scrub(node) {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (/token|password|otp/i.test(key)) {
        node[key] = "[redacted]";
      } else {
        scrub(node[key]);
      }
    }
  }
  scrub(clone);
  return clone;
}

function assert(condition, message, context) {
  if (!condition) {
    const error = new Error(message);
    if (context !== undefined) error.context = sanitized(context);
    throw error;
  }
}

async function request(method, path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let body;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (options.formData) {
    body = options.formData;
  }

  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  const text = await response.text();
  const responseBody = text ? JSON.parse(text) : null;
  const result = { status: response.status, ok: response.ok, body: responseBody };
  const expected = options.expectStatus || [200, 201];
  if (!expected.includes(response.status) && !options.allowFail) {
    const error = new Error(`${method} ${path} returned ${response.status}`);
    error.context = sanitized(responseBody);
    throw error;
  }
  return result;
}

async function step(name, fn, options = {}) {
  const started = Date.now();
  process.stdout.write(`- ${name} ... `);
  try {
    await fn();
    const ms = Date.now() - started;
    console.log(`PASS (${ms}ms)`);
    results.push({ name, ok: true, skipped: false, ms });
  } catch (error) {
    const ms = Date.now() - started;
    console.log(`FAIL (${ms}ms)`);
    console.error(error.message);
    if (error.context) console.error(JSON.stringify(error.context, null, 2));
    results.push({ name, ok: false, skipped: false, ms, reason: error.message });
    throw error;
  }
}

async function loginCustomer(customerPhone, displayName) {
  return authenticateCustomer({
    request,
    phone: customerPhone,
    displayName,
  });
}

async function admin(method, path, options = {}) {
  return request(method, path, { ...options, token: state.adminToken });
}

async function customer(user, method, path, options = {}) {
  return request(method, path, { ...options, token: user.token });
}

async function main() {
  console.log("Backend Mobile Phase C readiness smoke");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Run ID: ${RUN_ID}`);

  await step("health", async () => {
    const res = await request("GET", "/health");
    assert(res.ok, "Health check failed", res.body);
  });

  await step("admin login", async () => {
    const res = await request("POST", "/api/admin/auth/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      expectStatus: [200, 201],
    });
    state.adminToken = tokenOf(res.body);
    assert(state.adminToken, "Admin login did not return access token", res.body);
  });

  await step("permissions catalog", async () => {
    const res = await admin("GET", "/api/admin/permissions/catalog");
    const groups = asItems(res.body);
    assert(groups.some((group) => group.group === "products"), "Products permission group missing", res.body);
    assert(JSON.stringify(groups).includes("auctions.close_now"), "Auction close-now permission missing", res.body);
  });

  await step("time endpoint", async () => {
    const res = await request("GET", "/api/time");
    assert(Date.parse(unwrap(res.body).serverTime), "serverTime is not parseable", res.body);
  });

  await step("create category if needed", async () => {
    const list = await admin("GET", "/api/admin/categories?isActive=true&limit=1");
    const existing = asItems(list.body)[0];
    if (existing?.id) {
      state.category = existing;
      return;
    }
    const created = await admin("POST", "/api/admin/categories", {
      body: { name: `Mobile Smoke ${RUN_ID}`, slug: `mobile-smoke-${RUN_ID}`, isActive: true },
      expectStatus: [200, 201],
    });
    state.category = unwrap(created.body);
  });

  await step("create product", async () => {
    const res = await admin("POST", "/api/admin/products", {
      body: {
        title: `Mobile Smoke Product ${RUN_ID}`,
        description: "Created by mobile readiness smoke",
        categoryId: state.category.id,
        imageUrls: ["https://example.com/product.jpg"],
        price: 15000,
      },
      expectStatus: [200, 201],
    });
    state.product = unwrap(res.body);
    assert(state.product.id && state.product.price !== undefined, "Product response missing stable fields", res.body);
  });

  await step("publish product", async () => {
    const res = await admin("POST", `/api/admin/products/${state.product.id}/publish`, { expectStatus: [200, 201] });
    assert(unwrap(res.body).status === "ACTIVE", "Product did not publish", res.body);
  });

  await step("customer login", async () => {
    state.buyerA = await loginCustomer(phone("70"), `Buyer A ${RUN_ID}`);
    state.buyerB = await loginCustomer(phone("71"), `Buyer B ${RUN_ID}`);
    await admin("POST", `/api/admin/customers/${state.buyerA.id}/verify`, { body: {}, expectStatus: [200, 201] });
    await admin("POST", `/api/admin/customers/${state.buyerB.id}/verify`, { body: {}, expectStatus: [200, 201] });
  });

  await step("quantity product inventory", async () => {
    const created = await admin("POST", "/api/admin/products", {
      body: {
        title: `Mobile Smoke Inventory Product ${RUN_ID}`,
        description: "Created by mobile inventory smoke",
        categoryId: state.category.id,
        imageUrls: ["https://example.com/inventory-product.jpg"],
        price: 22000,
        quantity: 3,
      },
      expectStatus: [200, 201],
    });
    state.inventoryProduct = unwrap(created.body);
    assert(state.inventoryProduct.totalQuantity === 3, "Product quantity was not created", created.body);
    await admin("POST", `/api/admin/products/${state.inventoryProduct.id}/publish`, { expectStatus: [200, 201] });

    const purchase = await customer(state.buyerA, "POST", `/api/products/${state.inventoryProduct.id}/buy`, {
      idempotencyKey: idem("product-buy-quantity"),
      body: { quantity: 2 },
      expectStatus: [200, 201],
    });
    const data = unwrap(purchase.body);
    assert(data.purchasedQuantity === 2 && data.remainingQuantity === 1, "Quantity buy did not return inventory counts", purchase.body);
    assert(Array.isArray(data.orderItems) && data.orderItems.length === 2, "Quantity buy did not create physical items", purchase.body);

    const tooMany = await customer(state.buyerB, "POST", `/api/products/${state.inventoryProduct.id}/buy`, {
      idempotencyKey: idem("product-buy-too-many"),
      body: { quantity: 2 },
      allowFail: true,
    });
    assert(tooMany.status === 409 && tooMany.body.code === "INSUFFICIENT_PRODUCT_STOCK", "Insufficient stock did not return stable code", tooMany.body);

    const details = await request("GET", `/api/products/${state.inventoryProduct.id}`);
    assert(unwrap(details.body).availableQuantity === 1, "Public product detail did not show remaining stock", details.body);
  });

  await step("public product list/details", async () => {
    const list = await request("GET", `/api/products?search=${encodeURIComponent("Mobile Smoke Product")}&limit=20`);
    assert(asItems(list.body).some((item) => item.id === state.product.id), "Published product missing from public list", list.body);
    const details = await request("GET", `/api/products/${state.product.id}`);
    const data = unwrap(details.body);
    assert(data.minimumNextBid === undefined && data.isAvailable === true, "Product details shape is not stable", details.body);
  });

  await step("buy product with Idempotency-Key", async () => {
    const missing = await customer(state.buyerA, "POST", `/api/products/${state.product.id}/buy`, {
      allowFail: true,
      expectStatus: [400],
    });
    assert(missing.status === 400 && missing.body.code === "IDEMPOTENCY_KEY_REQUIRED", "Missing idempotency key was not enforced", missing.body);

    const key = idem("product-buy");
    const first = await customer(state.buyerA, "POST", `/api/products/${state.product.id}/buy`, {
      idempotencyKey: key,
      expectStatus: [200, 201],
    });
    const replay = await customer(state.buyerA, "POST", `/api/products/${state.product.id}/buy`, {
      idempotencyKey: key,
      expectStatus: [200, 201],
    });
    assert(unwrap(first.body).orderItemId === unwrap(replay.body).orderItemId, "Idempotent product buy did not replay", { first: first.body, replay: replay.body });
  });

  await step("already sold handling", async () => {
    const res = await customer(state.buyerB, "POST", `/api/products/${state.product.id}/buy`, {
      idempotencyKey: idem("product-buy-loser"),
      allowFail: true,
    });
    assert(res.status === 409 && res.body.code === "PRODUCT_ALREADY_SOLD", "Already-sold product did not return stable conflict", res.body);
  });

  await step("create auction", async () => {
    const res = await admin("POST", "/api/admin/auctions", {
      body: {
        title: `Mobile Smoke Auction ${RUN_ID}`,
        description: "Created by mobile readiness smoke",
        categoryId: state.category.id,
        imageUrls: ["https://example.com/auction.jpg"],
        startingPrice: 1000,
        minIncrement: 500,
        startsAt: new Date(Date.now() - 5000).toISOString(),
        endsAt: new Date(Date.now() + 120000).toISOString(),
        extensionSeconds: 30,
        extensionTriggerSeconds: 20,
        maxExtensions: 3,
      },
      expectStatus: [200, 201],
    });
    state.auction = unwrap(res.body);
    assert(state.auction.id && state.auction.minimumNextBid, "Auction response missing stable fields", res.body);
  });

  await step("publish auction", async () => {
    const res = await admin("POST", `/api/admin/auctions/${state.auction.id}/publish`, { expectStatus: [200, 201] });
    assert(unwrap(res.body).status === "ACTIVE", "Auction did not publish", res.body);
  });

  await step("public auction list/details include serverTime/minimumNextBid", async () => {
    const list = await customer(state.buyerA, "GET", `/api/auctions?limit=20&search=${encodeURIComponent("Mobile Smoke Auction")}`);
    const data = unwrap(list.body);
    assert(data.serverTime && data.items.some((item) => item.id === state.auction.id), "Auction list missing serverTime/items", list.body);
    const details = await customer(state.buyerA, "GET", `/api/auctions/${state.auction.id}`);
    const auctionDetails = unwrap(details.body);
    assert(auctionDetails.serverTime && auctionDetails.minimumNextBid, "Auction details missing countdown fields", details.body);
  });

  await step("unified marketplace lists available products and active auctions", async () => {
    const res = await customer(state.buyerA, "GET", `/api/marketplace?search=${encodeURIComponent("Mobile Smoke")}&limit=50`);
    const data = unwrap(res.body);
    const items = data.items || [];
    assert(data.serverTime, "Marketplace missing serverTime", res.body);
    assert(
      items.some((item) => item.itemType === "PRODUCT" && item.id === state.inventoryProduct.id && item.availableQuantity === 1),
      "Marketplace missing available inventory product",
      res.body,
    );
    assert(
      items.some((item) => item.itemType === "AUCTION" && item.id === state.auction.id && item.minimumNextBid),
      "Marketplace missing active auction",
      res.body,
    );
  });

  await step("customer bid with Idempotency-Key", async () => {
    const key = idem("auction-bid");
    const bid = await customer(state.buyerA, "POST", `/api/auctions/${state.auction.id}/bids`, {
      idempotencyKey: key,
      body: { amount: 1500 },
      expectStatus: [200, 201],
    });
    assert(unwrap(bid.body).minimumNextBid === "2000.00", "Bid result missing next bid", bid.body);

    const replay = await customer(state.buyerA, "POST", `/api/auctions/${state.auction.id}/bids`, {
      idempotencyKey: key,
      body: { amount: 1500 },
      expectStatus: [200, 201],
    });
    assert(unwrap(bid.body).bidId === unwrap(replay.body).bidId, "Idempotent bid did not replay", { bid: bid.body, replay: replay.body });
  });

  await step("low bid rejected", async () => {
    const res = await customer(state.buyerB, "POST", `/api/auctions/${state.auction.id}/bids`, {
      idempotencyKey: idem("auction-low-bid"),
      body: { amount: 1600 },
      allowFail: true,
    });
    assert(res.status === 400 && res.body.code === "BID_TOO_LOW", "Low bid did not return BID_TOO_LOW", res.body);
  });

  await step("admin close auction", async () => {
    const res = await admin("POST", `/api/admin/auctions/${state.auction.id}/close-now`, { expectStatus: [200, 201] });
    assert(unwrap(res.body).auction?.status === "ENDED" || unwrap(res.body).status === "ENDED", "Auction did not close", res.body);
  });

  await step("notifications list", async () => {
    const res = await customer(state.buyerA, "GET", "/api/notifications?limit=20");
    assert(Array.isArray(unwrap(res.body).items), "Notifications list did not return items", res.body);
  });

  await step("notification settings", async () => {
    const current = await customer(state.buyerA, "GET", "/api/customer/notification-settings");
    assert(typeof unwrap(current.body).auctionOutbid === "boolean", "Notification settings missing booleans", current.body);
    const patched = await customer(state.buyerA, "PATCH", "/api/customer/notification-settings", {
      body: { auctionOutbid: true, auctionEndingSoon: true },
    });
    assert(unwrap(patched.body).auctionOutbid === true, "Notification settings patch failed", patched.body);
  });

  await step("OpenAPI docs reachable and updated", async () => {
    const res = await request("GET", "/api/docs-json");
    const paths = res.body.paths || {};
    assert(paths["/api/time"], "OpenAPI missing /api/time");
    assert(paths["/api/marketplace"], "OpenAPI missing /api/marketplace");
    assert(paths["/api/admin/permissions/catalog"], "OpenAPI missing permissions catalog");
    assert(paths["/api/admin/uploads/images"], "OpenAPI missing upload endpoint");
    const bidHeaders = paths["/api/auctions/{id}/bids"]?.post?.parameters || [];
    assert(bidHeaders.some((param) => param.name === "Idempotency-Key" && param.required === true), "OpenAPI missing bid Idempotency-Key header");
  });

  await step("upload endpoint", async () => {
    const docs = await request("GET", "/api/docs-json");
    state.uploadImplemented = Boolean(docs.body.paths?.["/api/admin/uploads/images"]);
    if (!state.uploadImplemented) throw new Error("Upload endpoint is not implemented");

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), `mobile-smoke-${RUN_ID}.png`);
    form.append("folder", "products");
    const res = await admin("POST", "/api/admin/uploads/images", {
      formData: form,
      expectStatus: [200, 201],
    });
    assert(unwrap(res.body).url && unwrap(res.body).key, "Upload did not return url/key", res.body);
  });

  console.log("\nSummary");
  console.log("-------");
  for (const result of results) {
    const marker = result.skipped ? "SKIP" : result.ok ? "PASS" : "FAIL";
    console.log(`${marker} ${result.name}`);
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`Passed: ${results.length - failed.length}`);
  console.log("Skipped: 0");
  console.log(`Failed: ${failed.length}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("\nFatal smoke failure:");
  console.error(error.stack || error.message);
  if (error.context) console.error(JSON.stringify(error.context, null, 2));
  process.exitCode = 1;
});
