/** Authenticated Backend Phase E readiness smoke. Secrets are never printed. */
import crypto from "node:crypto";
import fs from "node:fs";

function loadDotEnv() {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index > 0 && !process.env[trimmed.slice(0, index)]) process.env[trimmed.slice(0, index)] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
loadDotEnv();

const baseUrl = (process.env.API_BASE_URL || process.env.BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const ownerEmail = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
const ownerPassword = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
if (!ownerEmail || !ownerPassword) {
  console.error("FATAL: ADMIN_EMAIL/ADMIN_PASSWORD or SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD is required");
  console.log("Passed: 0 / Skipped: 0 / Failed: 1");
  process.exit(1);
}

const runId = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const results = [];
const state = {};
const unwrap = (body) => body?.data;
const redact = (value) => JSON.stringify(value ?? null).replace(/"(?:accessToken|refreshToken|password|otp|authorization|token)"\s*:\s*"[^"]*"/gi, '"[redacted]":"[redacted]"');

async function request(method, path, { token, body, expected = [200, 201], headers = {} } = {}) {
  const requestHeaders = { accept: "application/json", ...headers };
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  if (body !== undefined) requestHeaders["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  if (!expected.includes(response.status)) throw new Error(`${method} ${path} -> ${response.status} ${redact(parsed)}`);
  return { status: response.status, body: parsed };
}
const admin = (method, path, options = {}) => request(method, path, { ...options, token: state.adminToken });
const staff = (method, path, options = {}) => request(method, path, { ...options, token: state.staffToken });
const staffNew = (method, path, options = {}) => request(method, path, { ...options, token: state.staffNewToken });

async function step(name, fn) {
  try { await fn(); results.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: "FAIL" }); console.log(`FAIL ${name}: ${error.message}`); }
}

async function main() {
  console.log(`Phase E backend readiness smoke (${baseUrl})`);
  await step("health", async () => { if (unwrap((await request("GET", "/health")).body)?.status !== "ok") throw new Error("health failed"); });
  await step("owner login", async () => {
    const data = unwrap((await request("POST", "/api/admin/auth/login", { body: { email: ownerEmail, password: ownerPassword } })).body);
    state.adminToken = data?.accessToken; state.adminRefreshToken = data?.refreshToken;
    if (!state.adminToken || !data?.admin?.isOwner) throw new Error("owner login contract failed");
  });
  await step("Phase E permission catalog", async () => {
    const groups = unwrap((await admin("GET", "/api/admin/permissions/catalog")).body) || [];
    const keys = JSON.stringify(groups);
    for (const key of ["staff.view", "staff.create", "staff.manage_permissions", "staff.manage_sessions", "roles.view", "audit_logs.view"]) if (!keys.includes(key)) throw new Error(`missing ${key}`);
  });
  await step("create role and assign permissions", async () => {
    const role = unwrap((await admin("POST", "/api/admin/roles", { body: { name: `Phase E Role ${runId}`, description: "Phase E smoke role", permissionKeys: ["products.view"] } })).body);
    state.roleId = role.id;
    const updated = unwrap((await admin("PATCH", `/api/admin/roles/${role.id}`, { body: { permissionKeys: ["products.view"] } })).body);
    if (!updated.permissionKeys.includes("products.view")) throw new Error("role permission update failed");
  });
  await step("create staff", async () => {
    state.staffEmail = `phase-e-${runId}@example.test`;
    state.staffTemporaryPassword = `TempPhaseE${runId.replace(/\D/g, "").slice(-8)}A1`;
    const created = unwrap((await admin("POST", "/api/admin/staff", { body: { email: state.staffEmail, displayName: `Phase E Staff ${runId}`, jobTitle: "Phase E QA", notes: "Phase E smoke data", temporaryPassword: state.staffTemporaryPassword, roleIds: [state.roleId], mustChangePassword: true } })).body);
    state.staffId = created.id;
    if (!created.mustChangePassword || created.passwordHash || created.refreshTokenHash) throw new Error("staff response leaked secret or missed mandatory change");
  });
  await step("temporary staff login", async () => {
    const data = unwrap((await request("POST", "/api/admin/auth/login", { body: { email: state.staffEmail, password: state.staffTemporaryPassword }, headers: { "x-device-name": "Phase E Smoke", "x-platform": "script", "x-app-version": "phase-e" } })).body);
    state.staffToken = data.accessToken; state.staffRefreshToken = data.refreshToken;
    if (!data.admin?.mustChangePassword) throw new Error("temporary login did not require password change");
  });
  await step("mandatory password-change restriction", async () => {
    const denied = await staff("POST", "/api/admin/products", { body: { title: "must-not-create", categoryId: "none", price: 1 }, expected: [403] });
    if (denied.body?.code !== "STAFF_MUST_CHANGE_PASSWORD") throw new Error("mandatory gate code mismatch");
    const me = unwrap((await staff("GET", "/api/admin/auth/me")).body);
    if (!me.mustChangePassword) throw new Error("me did not expose mandatory state");
  });
  await step("staff self-service password change", async () => {
    state.staffPassword = `NewPhaseE${runId.replace(/\D/g, "").slice(-8)}B2`;
    const result = unwrap((await staff("POST", "/api/admin/auth/change-password", { body: { currentPassword: state.staffTemporaryPassword, newPassword: state.staffPassword } })).body);
    if (!result.passwordChanged || result.mustChangePassword) throw new Error("password change response failed");
    const data = unwrap((await request("POST", "/api/admin/auth/login", { body: { email: state.staffEmail, password: state.staffPassword } })).body);
    state.staffNewToken = data.accessToken; state.staffNewRefreshToken = data.refreshToken;
  });
  await step("allowed and forbidden permissions", async () => {
    const products = unwrap((await staffNew("GET", "/api/admin/products")).body);
    if (!Array.isArray(products?.items)) throw new Error("allowed products view failed");
    const forbidden = await staffNew("POST", "/api/admin/products", { body: { title: "not-authorized", categoryId: "none", price: 1 }, expected: [403] });
    if (forbidden.body?.code !== "INSUFFICIENT_PERMISSIONS") throw new Error("forbidden permission code mismatch");
  });
  await step("staff profile edit", async () => {
    const updated = unwrap((await admin("PATCH", `/api/admin/staff/${state.staffId}`, { body: { displayName: `Phase E Staff Updated ${runId}`, jobTitle: "Updated QA" } })).body);
    if (updated.displayName !== `Phase E Staff Updated ${runId}`) throw new Error("profile update failed");
  });
  await step("staff access preview and update", async () => {
    const preview = unwrap((await admin("POST", "/api/admin/staff/access-preview", { body: { roleIds: [state.roleId], directGrantKeys: ["products.view"], directDenyKeys: [] } })).body);
    if (!preview.effectivePermissions.includes("products.view")) throw new Error("preview did not resolve products.view");
    const access = unwrap((await admin("PUT", `/api/admin/staff/${state.staffId}/access`, { body: { roleIds: [state.roleId], directGrantKeys: ["products.view"], directDenyKeys: [] } })).body);
    if (!access.effectivePermissions.includes("products.view")) throw new Error("access update did not resolve products.view");
  });
  await step("owner-only permission assignment is blocked", async () => {
    const response = await admin("PUT", `/api/admin/staff/${state.staffId}/access`, { body: { roleIds: [state.roleId], directGrantKeys: ["admin.users.manage"], directDenyKeys: [] }, expected: [403] });
    if (response.body?.code !== "OWNER_ONLY_PERMISSION") throw new Error("owner-only assignment code mismatch");
  });
  await step("session list and single-session revoke", async () => {
    const sessions = unwrap((await admin("GET", `/api/admin/staff/${state.staffId}/sessions`)).body);
    if (!Array.isArray(sessions) || !sessions[0]?.id) throw new Error("staff session list failed");
    state.sessionId = sessions[0].id;
    await admin("DELETE", `/api/admin/staff/${state.staffId}/sessions/${state.sessionId}`);
    const rejected = await request("GET", "/api/admin/auth/me", { token: state.staffNewToken, expected: [401] });
    if (rejected.status !== 401) throw new Error("revoked session remained valid");
  });
  await step("administrative reset and old session rejection", async () => {
    state.resetPassword = `ResetPhaseE${runId.replace(/\D/g, "").slice(-8)}C3`;
    await admin("POST", `/api/admin/staff/${state.staffId}/reset-password`, { body: { newTemporaryPassword: state.resetPassword, mustChangePassword: true } });
    const rejected = await request("GET", "/api/admin/auth/me", { token: state.staffToken, expected: [401] });
    if (rejected.status !== 401) throw new Error("reset did not revoke old access");
    const data = unwrap((await request("POST", "/api/admin/auth/login", { body: { email: state.staffEmail, password: state.resetPassword } })).body);
    state.staffToken = data.accessToken;
  });
  await step("deactivate, reactivate, lock, and unlock", async () => {
    await admin("POST", `/api/admin/staff/${state.staffId}/deactivate`);
    const rejectedLogin = await request("POST", "/api/admin/auth/login", { body: { email: state.staffEmail, password: state.resetPassword }, expected: [401] });
    if (rejectedLogin.body?.code !== "INVALID_CREDENTIALS") throw new Error("inactive login leaked account state");
    await admin("POST", `/api/admin/staff/${state.staffId}/activate`);
    const activeLogin = unwrap((await request("POST", "/api/admin/auth/login", { body: { email: state.staffEmail, password: state.resetPassword } })).body);
    state.staffToken = activeLogin.accessToken;
    await admin("POST", `/api/admin/staff/${state.staffId}/lock`);
    await request("POST", "/api/admin/auth/login", { body: { email: state.staffEmail, password: state.resetPassword }, expected: [401] });
    await admin("POST", `/api/admin/staff/${state.staffId}/unlock`);
    const unlocked = unwrap((await request("POST", "/api/admin/auth/login", { body: { email: state.staffEmail, password: state.resetPassword } })).body);
    state.staffToken = unlocked.accessToken;
  });
  await step("logout-all and audit visibility", async () => {
    await admin("DELETE", `/api/admin/staff/${state.staffId}/sessions`);
    const logs = unwrap((await admin("GET", "/api/admin/audit-logs?action=STAFF_CREATED&limit=100")).body);
    if (!logs.items?.some((item) => item.entityId === state.staffId)) throw new Error("staff audit log missing");
  });
  await step("owner protection", async () => {
    const me = unwrap((await admin("GET", "/api/admin/auth/me")).body);
    const response = await admin("POST", `/api/admin/staff/${me.id}/deactivate`, { expected: [403] });
    if (!["LAST_ACTIVE_OWNER", "CANNOT_DEACTIVATE_SELF"].includes(response.body?.code)) throw new Error("owner protection code mismatch");
  });
  await step("OpenAPI contains Phase E contracts", async () => {
    const document = (await request("GET", "/api/docs-json")).body;
    for (const path of ["/api/admin/staff", "/api/admin/roles", "/api/admin/auth/change-password", "/api/admin/auth/sessions", "/api/admin/audit-logs/{id}"]) if (!document.paths?.[path]) throw new Error(`OpenAPI missing ${path}`);
  });

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.filter((result) => result.status === "FAIL").length;
  console.log(`Passed: ${passed} / Skipped: 0 / Failed: ${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(`FATAL: ${error.message}`); console.log(`Passed: ${results.filter((r) => r.status === "PASS").length} / Skipped: 0 / Failed: 1`); process.exitCode = 1; });
