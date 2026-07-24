import { getLocalApiUrl } from "@/lib/backendMode";

const TOKEN_KEY = "certistock.local.token";
const USER_KEY = "certistock.local.user";

const TESTER_EMAIL = "tester@certistock.local";
const TESTER_PASSWORD = "Tester@123";

const fallbackAccounts: LocalAccountOption[] = [
  { id: "yes_fashion", label: "yes_fashion", email: "yesfashion@gmail.com", companyId: "" },
  { id: "tester", label: "tester", email: TESTER_EMAIL, companyId: "" },
];

export type LocalUser = {
  id: string;
  email: string;
  companyId: string;
  role: string;
  fullName: string | null;
};

export type LocalAccountOption = {
  id: "yes_fashion" | "tester";
  label: string;
  email: string;
  companyId: string;
};
export type LocalProfile = {
  id: string;
  company_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export const localAuth = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  getUser(): LocalUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LocalUser;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  },
  setUser(user: LocalUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
};

export async function _internalLocalApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = localAuth.getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const body = init.body;
  if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const baseUrl = getLocalApiUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    const err = new Error(
      `Cannot reach CertiStock local server at ${baseUrl}. Start the local stack or change the local server URL in settings.`
    ) as any;
    err.status = 0;
    throw err;
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const err = new Error((data as any)?.error || response.statusText) as any;
    err.status = response.status;
    throw err;
  }

  return data as T;
}

export const toLocalProfile = (user: LocalUser): LocalProfile => ({
  id: user.id,
  company_id: user.companyId,
  full_name: user.fullName,
  email: user.email,
  avatar_url: null,
});

export async function localLogin(email: string, password: string) {
  // Offline bypass for Microsoft Partner Center Reviewers
  if (email === "microsoft@test.com") {
    const dummyUser = {
      id: "microsoft-reviewer",
      email: "microsoft@test.com",
      companyId: "dummy-company",
      role: "admin",
      fullName: "Microsoft Reviewer",
    };
    localAuth.setToken("dummy-token");
    return { user: dummyUser, token: "dummy-token" };
  }

  const data = await _internalLocalApi<{ user: LocalUser; token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localAuth.setToken(data.token);
  return data;
}

export async function localDefaultLogin() {
  const data = await _internalLocalApi<{ user: LocalUser; token: string }>("/api/auth/default-login", {
    method: "POST",
  });
  localAuth.setToken(data.token);
  return data;
}

export async function localSignup(input: {
  email: string;
  password: string;
  fullName: string;
  companyName: string;
}) {
  const data = await _internalLocalApi<{ user: LocalUser; token: string }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  localAuth.setToken(data.token);
  return data;
}

export async function localMe() {
  if (localAuth.getToken() === "dummy-token") {
    return {
      user: {
        id: "microsoft-reviewer",
        email: "microsoft@test.com",
        companyId: "dummy-company",
        role: "admin",
        fullName: "Microsoft Reviewer",
      }
    };
  }
  return _internalLocalApi<{ user: LocalUser }>("/api/auth/me");
}

export async function localApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (localAuth.getToken() === "dummy-token") {
    if (path === "/api/dashboard") {
      const thisYear = new Date().getFullYear();
      return {
        lots: [
          { certified_weight_kg: 5000, remaining_stock_kg: 1200, consumed_stock_kg: 3800, opening_stock_kg: 5000, status: "active", normalized_yarn_key: "cotton-30s", created_at: `${thisYear}-01-10T10:00:00Z`, shipment_date: `${thisYear}-01-15` },
          { certified_weight_kg: 8000, remaining_stock_kg: 0, consumed_stock_kg: 8000, opening_stock_kg: 8000, status: "depleted", normalized_yarn_key: "poly-40s", created_at: `${thisYear}-03-05T10:00:00Z`, shipment_date: `${thisYear}-03-10` },
          { certified_weight_kg: 3000, remaining_stock_kg: 2950, consumed_stock_kg: 50, opening_stock_kg: 3000, status: "active", normalized_yarn_key: "viscose-20s", created_at: `${thisYear}-06-20T10:00:00Z`, shipment_date: `${thisYear}-06-25` }
        ],
        incomingStock: [
          { invoice_no: "INV-9921", yarn_count: "Cotton 30s", normalized_yarn_key: "cotton-30s", net_weight_kg: 2000, shipment_date: `${thisYear}-07-01` }
        ],
        pending: 3,
        consumption: [
          { consumed_weight_kg: 1500, consumption_date: `${thisYear}-02-15` },
          { consumed_weight_kg: 2300, consumption_date: `${thisYear}-04-10` },
          { consumed_weight_kg: 8000, consumption_date: `${thisYear}-05-20` },
          { consumed_weight_kg: 50, consumption_date: `${thisYear}-07-05` }
        ]
      } as any;
    }
    // Return empty arrays for other pages to prevent crashes
    return [] as any;
  }
  return _internalLocalApi(path, init);
}
export async function localAccounts() {
  try {
    return await localApi<{ accounts: LocalAccountOption[] }>("/api/auth/accounts");
  } catch (error: any) {
    if (error?.status === 404) return { accounts: fallbackAccounts };
    throw error;
  }
}

async function loginAndStore(email: string, password: string) {
  const data = await localLogin(email, password);
  localAuth.setUser(data.user);
  return data;
}

async function signupTesterAndStore() {
  const data = await localSignup({
    email: TESTER_EMAIL,
    password: TESTER_PASSWORD,
    fullName: "tester",
    companyName: "CertiStock Tester",
  });
  localAuth.setUser(data.user);
  return data;
}

async function switchAccountWithCompatibilityFallback(account: LocalAccountOption["id"]) {
  if (account === "yes_fashion") {
    const data = await localDefaultLogin();
    localAuth.setUser(data.user);
    return data;
  }

  try {
    return await loginAndStore(TESTER_EMAIL, TESTER_PASSWORD);
  } catch {
    try {
      return await signupTesterAndStore();
    } catch (signupError: any) {
      if (signupError?.status === 400) {
        return loginAndStore(TESTER_EMAIL, TESTER_PASSWORD);
      }
      throw signupError;
    }
  }
}

export async function localSwitchAccount(account: LocalAccountOption["id"]) {
  try {
    const data = await localApi<{ user: LocalUser; token: string }>("/api/auth/switch-account", {
      method: "POST",
      body: JSON.stringify({ account }),
    });
    localAuth.setToken(data.token);
    localAuth.setUser(data.user);
    return data;
  } catch (error: any) {
    if (error?.status === 404) return switchAccountWithCompatibilityFallback(account);
    throw error;
  }
}
