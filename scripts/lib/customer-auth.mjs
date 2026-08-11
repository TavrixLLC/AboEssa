import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function unwrap(body) {
  return body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
}

export function tokenOf(body) {
  const data = unwrap(body);
  return data?.accessToken || data?.token || data?.tokens?.accessToken;
}

function customerOf(body) {
  const data = unwrap(body);
  return data?.customer || data?.user || data?.profile || data;
}

function idOf(body) {
  const customer = customerOf(body);
  return customer?.id;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function redact(value) {
  const clone = JSON.parse(JSON.stringify(value ?? null));
  const scrub = (node) => {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (/token|password|otp|authorization/i.test(key)) node[key] = "[redacted]";
      else scrub(node[key]);
    }
  };
  scrub(clone);
  return clone;
}

async function devOtpFromLogs(phone) {
  const project = process.env.DOCKER_PROJECT || process.env.SMOKE_DOCKER_PROJECT;
  const args = ["compose"];
  if (project) args.push("-p", project);
  args.push("logs", "--no-color", "--since", "5m", "api");
  try {
    const { stdout } = await execFileAsync("docker", args, { timeout: 8000, maxBuffer: 1024 * 1024 });
    const matches = [...stdout.matchAll(/Development WhatsApp OTP for\s+([^:]+):\s*(\d{6})/g)]
      .filter((match) => digits(match[1]) === digits(phone));
    return matches.at(-1)?.[2];
  } catch {
    return undefined;
  }
}

/**
 * Authenticates a customer without printing credentials or tokens.
 * Precedence: CUSTOMER_ACCESS_TOKEN, CUSTOMER_PHONE + CUSTOMER_OTP,
 * then the existing non-production MockWhatsAppProvider log mechanism.
 */
export async function authenticateCustomer({ request, phone, displayName, referralCode } = {}) {
  const configuredToken = process.env.CUSTOMER_ACCESS_TOKEN?.trim();
  if (configuredToken) {
    const me = await request("GET", "/api/auth/customer/me", { token: configuredToken });
    const profile = customerOf(me.body);
    if (!me.ok || !profile?.id) throw new Error("CUSTOMER_ACCESS_TOKEN was rejected by /api/auth/customer/me");
    return { token: configuredToken, id: profile.id, phone: process.env.CUSTOMER_PHONE || phone, profile };
  }

  const configuredPhone = process.env.CUSTOMER_PHONE?.trim();
  const configuredOtp = process.env.CUSTOMER_OTP?.trim();
  const loginPhone = configuredPhone || phone;
  if (!loginPhone) throw new Error("Customer authentication unavailable; set CUSTOMER_ACCESS_TOKEN or CUSTOMER_PHONE and CUSTOMER_OTP");

  await request("POST", "/api/auth/customer/request-otp", { body: { phone: loginPhone }, expectStatus: [200, 201, 429], allowFail: true });
  const otp = configuredOtp || await devOtpFromLogs(loginPhone);
  if (!otp) throw new Error("Customer authentication unavailable; set CUSTOMER_ACCESS_TOKEN or CUSTOMER_PHONE and CUSTOMER_OTP, or run the existing local development OTP provider");

  const verified = await request("POST", "/api/auth/customer/verify-otp", {
    body: { phone: loginPhone, otp, displayName, referralCode },
    expectStatus: [200, 201],
  });
  const accessToken = tokenOf(verified.body);
  const id = idOf(verified.body);
  if (!accessToken || !id) throw new Error("Customer OTP verification did not return a customer access token");
  return { token: accessToken, id, phone: loginPhone, profile: customerOf(verified.body) };
}

export function safeAuthError(error) {
  return redact({ message: error?.message || String(error), context: error?.context });
}
