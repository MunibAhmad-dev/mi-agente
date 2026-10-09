const TOKEN_KEY = "uce_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function throwError(res: Response): Promise<never> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    message = body?.detail ?? body?.error?.message ?? JSON.stringify(body);
  } catch {
    /* keep status message */
  }
  throw new Error(message);
}

export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) };
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) await throwError(res);
  return res;
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await request(path);
  return (await res.json()) as T;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export async function postRaw(path: string, body: BodyInit): Promise<Response> {
  return request(path, { method: "POST", body });
}

export interface User {
  id: string;
  username: string;
  role: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  owner_id: string;
  asset_count: number;
}

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  kind: string;
  sha256: string;
  size: number;
  version: number;
}

export interface JobTask {
  id: string;
  kind: string;
  status: string;
  attempt: number;
  error_id: string | null;
  artifacts: { id: string; name: string; sha256: string }[];
}

export interface Job {
  id: string;
  name: string;
  status: string;
  project_id: string | null;
  error_id: string | null;
  tasks: JobTask[];
}

export interface ErrorRecord {
  id: string;
  job_id: string;
  task_id: string | null;
  task_kind: string | null;
  code: string;
  message: string;
  cause: string | null;
  suggested_fix: string | null;
  created_at: string;
}