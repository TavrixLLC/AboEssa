/**
 * Phase C.2 inventory + unified marketplace smoke test.
 *
 * Usage:
 *   node scripts/inventory-marketplace-smoke.mjs
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
  defaultProduct: undefined,
  inventoryProduct: undefined,
  auction: undefined,
  firstPurchase: undefined,
  finalPurchase: undefined,
  concurrencyProduct: undefined,
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

function asItems(body) {
  const data = unwrap(body);
  if (Array.isArray(data)) return data;
  return data?.items || [];
}

function tokenOf(body) {
  const data = unwrap(body);
  return data?.accessToken || data?.tokens?.accessToken;
}

function sanitize(value) {
  const clone = JSON.parse(JSON.stringify(value ?? null));
  function scrub(node) {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (/token|password|otp|authorization/i.test(key)) {
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
    if (context !== undefined) error.context = sanitize(context);
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

  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  const text = await response.text();
  const responseBody = text ? JSON.parse(text) : null;
  const result = { status: response.status, ok: response.ok, body: responseBody };
  const expected = options.expectStatus || [200, 201];
  if (!expected.includes(response.status) && !options.allowFail) {
    const error = new Error(`${method} ${path} returned ${response.status}`);
    error.context = sanitize(responseBody);
    throw error;
  }
  return result;
}

async function step(name, fn) {
  const started = Date.now();
  process.stdout.write(`- ${name} ... `);
  try {
    await fn();
    const ms = Date.now() - started;
    console.log(`PASS (${ms}ms)`);
    results.push({ name, ok: true, ms });
  } catch (error) {
    const ms = Date.now() - started;
    console.log(`FAIL (${ms}ms)`);
    console.error(error.message);
    if (error.context) console.error(JSON.stringify(error.context, null, 2));
    results.push({ name, ok: false, ms, reason: error.message });
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

function productBody(extra = {}) {
  return {
    title: `C2 Product ${RUN_ID} ${crypto.randomBytes(2).toString("hex")}`,
    description: "Created by inventory marketplace smoke",
    categoryId: state.category.id,
    imageUrls: ["https://example.com/c2-product.jpg"],
    price: 4000,
    ...extra,
  };
}

async function createAndPublishProduct(extra = {}) {
  const created = await admin("POST", "/api/admin/products", {
    body: productBody(extra),
    expectStatus: [200, 201],
  });
  const product = unwrap(created.body);
  await admin("POST", `/api/admin/products/${product.id}/publish`, { expectStatus: [200, 201] });
  return product;
}

async function main() {
  console.log("Phase C.2 inventory + marketplace smoke");
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

  await step("customer login", async () => {
    state.buyerA = await loginCustomer(phone("80"), `C2 Buyer A ${RUN_ID}`);
    state.buyerB = await loginCustomer(phone("81"), `C2 Buyer B ${RUN_ID}`);
    await admin("POST", `/api/admin/customers/${state.buyerA.id}/verify`, { body: {}, expectStatus: [200, 201] });
    await admin("POST", `/api/admin/customers/${state.buyerB.id}/verify`, { body: {}, expectStatus: [200, 201] });
  });

  await step("create active category", async () => {
    const created = await admin("POST", "/api/admin/categories", {
      body: {
        name: `C2 Category ${RUN_ID}`,
        slug: `c2-category-${RUN_ID}`,
        isActive: true,
      },
      expectStatus: [200, 201],
    });
    state.category = unwrap(created.body);
    assert(state.category.id && state.category.isActive !== false, "Category was not active", created.body);
  });

  await step("create product without quantity defaults to one", async () => {
    const created = await admin("POST", "/api/admin/products", {
      body: productBody({ title: `C2 Default Quantity ${RUN_ID}` }),
      expectStatus: [200, 201],
    });
    state.defaultProduct = unwrap(created.body);
    assert(
      state.defaultProduct.totalQuantity === 1 &&
        state.defaultProduct.availableQuantity === 1 &&
        state.defaultProduct.soldQuantity === 0,
      "Default product quantity fields were wrong",
      created.body,
    );
  });

  await step("invalid product quantity rejected", async () => {
    const res = await admin("POST", "/api/admin/products", {
      body: productBody({ title: `C2 Invalid Quantity ${RUN_ID}`, quantity: 0 }),
      allowFail: true,
    });
    assert(res.status === 400 && res.body.code === "INVALID_PRODUCT_QUANTITY", "Quantity zero did not return stable code", res.body);
  });

  await step("create and publish quantity three product", async () => {
    state.inventoryProduct = await createAndPublishProduct({
      title: `C2 Inventory Product ${RUN_ID}`,
      quantity: 3,
    });
    const details = await admin("GET", `/api/admin/products/${state.inventoryProduct.id}`);
    const product = unwrap(details.body);
    assert(product.status === "ACTIVE" && product.totalQuantity === 3 && product.availableQuantity === 3, "Quantity product did not publish with stock", details.body);
  });

  await step("create and publish auction in same category", async () => {
    const created = await admin("POST", "/api/admin/auctions", {
      body: {
        title: `C2 Auction ${RUN_ID}`,
        description: "Created by inventory marketplace smoke",
        categoryId: state.category.id,
        imageUrls: ["https://example.com/c2-auction.jpg"],
        startingPrice: 6000,
        minIncrement: 500,
        startsAt: new Date(Date.now() - 5000).toISOString(),
        endsAt: new Date(Date.now() + 180000).toISOString(),
        extensionSeconds: 30,
        extensionTriggerSeconds: 20,
        maxExtensions: 3,
      },
      expectStatus: [200, 201],
    });
    state.auction = unwrap(created.body);
    await admin("POST", `/api/admin/auctions/${state.auction.id}/publish`, { expectStatus: [200, 201] });
  });

  await step("marketplace contains product and auction", async () => {
    const res = await customer(state.buyerA, "GET", `/api/marketplace?limit=50&categoryId=${state.category.id}`);
    const data = unwrap(res.body);
    const items = data.items || [];
    assert(data.serverTime && data.meta?.total >= 2, "Marketplace response missing server time or meta", res.body);
    assert(items.some((item) => item.itemType === "PRODUCT" && item.id === state.inventoryProduct.id), "Marketplace missing inventory product", res.body);
    assert(items.some((item) => item.itemType === "AUCTION" && item.id === state.auction.id), "Marketplace missing auction", res.body);
  });

  await step("first customer buys quantity two and product remains available", async () => {
    const key = idem("buy-two");
    const purchase = await customer(state.buyerA, "POST", `/api/products/${state.inventoryProduct.id}/buy`, {
      idempotencyKey: key,
      body: { quantity: 2 },
      expectStatus: [200, 201],
    });
    state.firstPurchase = unwrap(purchase.body);
    assert(
      state.firstPurchase.requestedQuantity === 2 &&
        state.firstPurchase.purchasedQuantity === 2 &&
        state.firstPurchase.remainingQuantity === 1 &&
        Array.isArray(state.firstPurchase.orderItems) &&
        state.firstPurchase.orderItems.length === 2,
      "Quantity-two purchase response was not stable",
      purchase.body,
    );

    const replay = await customer(state.buyerA, "POST", `/api/products/${state.inventoryProduct.id}/buy`, {
      idempotencyKey: key,
      body: { quantity: 2 },
      expectStatus: [200, 201],
    });
    assert(unwrap(replay.body).orderItems?.[0]?.id === state.firstPurchase.orderItems[0].id, "Same idempotency key did not replay original result", replay.body);

    const conflict = await customer(state.buyerA, "POST", `/api/products/${state.inventoryProduct.id}/buy`, {
      idempotencyKey: key,
      body: { quantity: 1 },
      allowFail: true,
    });
    assert(conflict.status === 409 && conflict.body.code === "IDEMPOTENCY_CONFLICT", "Different quantity did not conflict on idempotency key", conflict.body);

    const details = await request("GET", `/api/products/${state.inventoryProduct.id}`);
    const product = unwrap(details.body);
    assert(product.isAvailable === true && product.availableQuantity === 1 && product.soldQuantity === 2, "Product did not remain available with one unit", details.body);
  });

  await step("My Box and order-items contain two physical items", async () => {
    const box = await customer(state.buyerA, "GET", "/api/customer/box");
    const boxData = unwrap(box.body);
    const itemIds = new Set(state.firstPurchase.orderItems.map((item) => item.id));
    const boxItems = boxData.items || [];
    assert(boxItems.filter((item) => itemIds.has(item.id)).length === 2, "My Box missing purchased physical items", box.body);

    const orderItems = await customer(state.buyerA, "GET", "/api/customer/order-items?limit=50");
    const items = asItems(orderItems.body);
    assert(items.filter((item) => itemIds.has(item.id)).length === 2, "Order-items list missing purchased physical items", orderItems.body);
  });

  await step("second customer buys final quantity and product becomes out of stock", async () => {
    const purchase = await customer(state.buyerB, "POST", `/api/products/${state.inventoryProduct.id}/buy`, {
      idempotencyKey: idem("buy-final"),
      body: { quantity: 1 },
      expectStatus: [200, 201],
    });
    state.finalPurchase = unwrap(purchase.body);
    assert(state.finalPurchase.purchasedQuantity === 1 && state.finalPurchase.remainingQuantity === 0, "Final purchase did not consume last unit", purchase.body);

    const details = await admin("GET", `/api/admin/products/${state.inventoryProduct.id}`);
    const product = unwrap(details.body);
    assert(product.status === "SOLD" && product.availableQuantity === 0 && product.soldQuantity === 3 && product.isOutOfStock === true, "Product did not become sold out", details.body);

    const publicDetails = await request("GET", `/api/products/${state.inventoryProduct.id}`, { allowFail: true });
    assert(publicDetails.status === 404, "Sold-out product remained publicly fetchable as active detail", publicDetails.body);

    const rejected = await customer(state.buyerA, "POST", `/api/products/${state.inventoryProduct.id}/buy`, {
      idempotencyKey: idem("buy-after-out"),
      allowFail: true,
    });
    assert(rejected.status === 409 && ["PRODUCT_ALREADY_SOLD", "PRODUCT_OUT_OF_STOCK"].includes(rejected.body.code), "Buy after sold out was not rejected", rejected.body);
  });

  await step("sold-out product leaves default marketplace while auction remains", async () => {
    const res = await customer(state.buyerA, "GET", `/api/marketplace?limit=50&categoryId=${state.category.id}`);
    const items = unwrap(res.body).items || [];
    assert(!items.some((item) => item.itemType === "PRODUCT" && item.id === state.inventoryProduct.id), "Sold-out product remained in default marketplace", res.body);
    assert(items.some((item) => item.itemType === "AUCTION" && item.id === state.auction.id), "Auction disappeared from category marketplace", res.body);
  });

  await step("concurrent requests cannot oversell one remaining unit", async () => {
    state.concurrencyProduct = await createAndPublishProduct({
      title: `C2 Concurrency Product ${RUN_ID}`,
      quantity: 1,
    });
    const attempts = await Promise.all([
      customer(state.buyerA, "POST", `/api/products/${state.concurrencyProduct.id}/buy`, {
        idempotencyKey: idem("concurrent-a"),
        allowFail: true,
      }),
      customer(state.buyerB, "POST", `/api/products/${state.concurrencyProduct.id}/buy`, {
        idempotencyKey: idem("concurrent-b"),
        allowFail: true,
      }),
    ]);
    const successCount = attempts.filter((attempt) => [200, 201].includes(attempt.status)).length;
    const rejectedCount = attempts.filter((attempt) => attempt.status === 409).length;
    assert(successCount === 1 && rejectedCount === 1, "Concurrent buys did not produce exactly one success and one conflict", attempts.map((attempt) => attempt.body));

    const details = await admin("GET", `/api/admin/products/${state.concurrencyProduct.id}`);
    const product = unwrap(details.body);
    assert(product.availableQuantity === 0 && product.soldQuantity === 1, "Concurrent buy oversold inventory", details.body);
  });

  await step("OpenAPI documents marketplace and quantity", async () => {
    const res = await request("GET", "/api/docs-json");
    const docsText = JSON.stringify(res.body);
    assert(res.body.paths?.["/api/marketplace"], "OpenAPI missing /api/marketplace");
    assert(docsText.includes('"quantity"') && docsText.includes('"availableQuantity"'), "OpenAPI missing quantity fields");
  });

  console.log("\nSummary");
  console.log("-------");
  for (const result of results) {
    console.log(`PASS ${result.name}`);
  }
  console.log(`Passed: ${results.length}`);
  console.log("Failed: 0");
}

main().catch(() => {
  const failed = results.filter((result) => !result.ok);
  console.log("\nSummary");
  console.log("-------");
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  }
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);
  process.exitCode = 1;
});
