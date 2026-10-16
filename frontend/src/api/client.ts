import { getToken, markExpired, setSession } from "../lib/session";

/** Erro devolvido pela API no formato { error: { code, message, details? } }. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: { field: string; message: string; line?: number }[];

  constructor(status: number, code: string, message: string, details?: { field: string; message: string; line?: number }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, params?: Params) {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

export async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  opts: { params?: Params; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.params), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Não foi possível falar com a API. Ela está no ar?");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw toApiError(res.status, data, !!token);
  return data as T;
}

function toApiError(status: number, data: { error?: { code?: string; message?: string; details?: [] } } | null, hadToken: boolean) {
  // Token vencido ou usuário desativado: volta para a tela de login
  if (status === 401 && hadToken) {
    markExpired();
    setSession(null);
  }
  const err = data?.error;
  return new ApiError(status, err?.code ?? "HTTP_ERROR", err?.message ?? `Erro ${status}`, err?.details);
}

/** Baixa um CSV com os filtros da tela. É um fetch (e não um link) porque a API exige o token. */
export async function downloadCsv(path: string, filename: string, params?: Params) {
  const token = getToken();
  const res = await fetch(buildUrl(path, params), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw toApiError(res.status, await res.json().catch(() => null), !!token);
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

/** Envia um arquivo como multipart/form-data (o navegador monta o Content-Type com o boundary). */
export async function uploadCsv<T>(path: string, file: File, params?: Params): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(buildUrl(path, params), { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Não foi possível falar com a API. Ela está no ar?");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw toApiError(res.status, data, !!token);
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>("GET", path, { params }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>("POST", path, { body, headers }),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, { body }),
};
