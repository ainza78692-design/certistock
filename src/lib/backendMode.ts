export const backendMode = (import.meta.env.VITE_BACKEND_MODE || "supabase").toLowerCase();
export const isLocalBackend = backendMode === "local";

export const LOCAL_API_URL_STORAGE_KEY = "certistock.local.apiUrl";

const FALLBACK_LOCAL_API_URL = "http://10.43.139.233:8787";

const normalizeUrlValue = (value: string) => {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(withProtocol);
  if (!url.port) url.port = "8787";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
};

export const defaultLocalApiUrl = normalizeUrlValue(
  import.meta.env.VITE_LOCAL_API_URL || FALLBACK_LOCAL_API_URL
);

const isLoopbackUrl = (value: string) => {
  try {
    const { hostname } = new URL(value);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
};

export const normalizeLocalApiUrl = (value?: string | null) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return defaultLocalApiUrl;
  return normalizeUrlValue(trimmed);
};

export const getLocalApiUrl = () => {
  if (typeof window === "undefined") return defaultLocalApiUrl;
  const stored = window.localStorage.getItem(LOCAL_API_URL_STORAGE_KEY);
  try {
    const normalized = normalizeLocalApiUrl(stored);
    if (stored && isLoopbackUrl(normalized) && !isLoopbackUrl(defaultLocalApiUrl)) {
      window.localStorage.setItem(LOCAL_API_URL_STORAGE_KEY, defaultLocalApiUrl);
      return defaultLocalApiUrl;
    }
    return normalized;
  } catch {
    window.localStorage.removeItem(LOCAL_API_URL_STORAGE_KEY);
    return defaultLocalApiUrl;
  }
};

export const setLocalApiUrl = (value: string) => {
  const normalized = normalizeLocalApiUrl(value);
  window.localStorage.setItem(LOCAL_API_URL_STORAGE_KEY, normalized);
  return normalized;
};

export type LocalApiHealth = {
  ok?: boolean;
  service?: string;
  database?: string;
  parserVersion?: string;
  [key: string]: unknown;
};

export const testLocalApiUrl = async (value?: string | null) => {
  const url = value ? normalizeLocalApiUrl(value) : getLocalApiUrl();
  const response = await fetch(`${url}/health`, { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  const health = contentType.includes("application/json")
    ? ((await response.json()) as LocalApiHealth)
    : ({ service: await response.text() } as LocalApiHealth);

  if (!response.ok || health.ok === false) {
    throw new Error("Server health check failed");
  }

  return { url, health };
};
