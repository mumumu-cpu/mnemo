import type { Item, User } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "same-origin", ...init });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  config: () => req<{ googleClientId: string | null; devAuth: boolean }>("/config"),
  me: () => req<{ user: User | null }>("/me"),
  google: (credential: string) => req<{ user: User }>("/auth/google", json("POST", { credential })),
  dev: () => req<{ user: User }>("/auth/dev", { method: "POST" }),
  logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),
  items: () => req<{ items: Item[] }>("/items"),
  create: (b: { id: string; body: string; images: string[]; createdAt: number; status: number }) =>
    req<{ item: Item }>("/items", json("POST", b)),
  patch: (id: string, b: Record<string, unknown>) => req<{ item: Item }>(`/items/${id}`, json("PATCH", b)),
  remove: (id: string) => req<{ ok: true }>(`/items/${id}`, { method: "DELETE" }),
  upload: (blob: Blob) =>
    req<{ key: string }>("/images", { method: "POST", headers: { "content-type": blob.type }, body: blob }),
  ai: (id: string, mode: "quiz" | "summary") =>
    req<{ item?: Item; summary?: string }>(`/items/${id}/ai`, json("POST", { mode })),
};
