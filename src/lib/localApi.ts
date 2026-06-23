import { getLocalApiUrl } from "@/lib/backendMode";

const TOKEN_KEY = "certistock.local.token";
const USER_KEY = "certistock.local.user";

export type LocalUser = {
  id: string;
  email: string;
  companyId: string;
  role: string;
  fullName: string | null;
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
  getUser(): LocalUser | null {
    const u = localStorage.getItem(USER_KEY);
    return u ? JSON.parse(u) : null;
  },
  setUser(user: LocalUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export async function localApi<T>(path: string, init: RequestInit = {}): Promise<T> {
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
      `Cannot reach CertiStock local server at ${baseUrl}. Start the local stack or change the server URL on the sign-in page.`
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
  const data = await localApi<{ user: LocalUser; token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localAuth.setToken(data.token);
  localAuth.setUser(data.user);
  return data;
}

export async function localSignup(input: {
  email: string;
  password: string;
  fullName: string;
  companyName: string;
}) {
  const data = await localApi<{ user: LocalUser; token: string }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  localAuth.setToken(data.token);
  localAuth.setUser(data.user);
  return data;
}

export async function localMe() {
  return localApi<{ user: LocalUser }>("/api/auth/me");
}
