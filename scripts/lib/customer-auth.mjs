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

/**
 * Authenticates a customer without printing credentials or tokens.
 * Precedence: CUSTOMER_ACCESS_TOKEN, then CUSTOMER_PHONE + CUSTOMER_PASSWORD.
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
  const configuredPassword = process.env.CUSTOMER_PASSWORD;
  const loginPhone = configuredPhone || phone;
  if (!loginPhone || !configuredPassword) {
    throw new Error("Customer authentication unavailable; set CUSTOMER_ACCESS_TOKEN or CUSTOMER_PHONE and CUSTOMER_PASSWORD");
  }

  let authenticated = await request("POST", "/api/auth/customer/login", {
    body: { phone: loginPhone, password: configuredPassword },
    expectStatus: [200, 201, 401],
    allowFail: true,
  });
  if (!authenticated.ok) {
    authenticated = await request("POST", "/api/auth/customer/register", {
      body: {
        phone: loginPhone,
        password: configuredPassword,
        displayName: displayName || "Smoke Customer",
        referralCode,
      },
      expectStatus: [200, 201],
    });
  }
  const accessToken = tokenOf(authenticated.body);
  const id = idOf(authenticated.body);
  if (!accessToken || !id) throw new Error("Customer authentication did not return a customer access token");
  return { token: accessToken, id, phone: loginPhone, profile: customerOf(authenticated.body) };
}

export function safeAuthError(error) {
  return redact({ message: error?.message || String(error), context: error?.context });
}
