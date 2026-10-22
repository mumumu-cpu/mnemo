import { get, set, del } from "idb-keyval";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, ApiError } from "./api";
import { compressImage } from "./image";
import type { Item, Status, User } from "./types";

type State = {
  auth: "loading" | "in" | "out";
  user: User | null;
  googleClientId: string | null;
  devAuth: boolean;
  items: Item[];
  /** true once we have something to show (cache or server). Drives skeletons. */
  ready: boolean;
  syncing: boolean;
  toast: { id: number; text: string; action?: { label: string; run: () => void } } | null;
};

let state: State = {
  auth: "loading",
  user: null,
  googleClientId: null,
  devAuth: false,
  items: [],
  ready: false,
  syncing: false,
  toast: null,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  emit();
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => sel(state),
  );
}

export const getState = () => state;

let toastSeq = 0;
export function toast(text: string, action?: { label: string; run: () => void }, ms = 2600) {
  const id = ++toastSeq;
  setState({ toast: { id, text, action } });
  setTimeout(() => state.toast?.id === id && setState({ toast: null }), ms);
}
export const dismissToast = () => setState({ toast: null });

// ---------- persistence ----------

const CACHE_KEY = "items-v1";
let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => set(CACHE_KEY, state.items).catch(() => {}), 120);
}

function setItems(fn: (items: Item[]) => Item[]) {
  setState((s) => ({ items: fn(s.items) }));
  persist();
}

const patchItem = (id: string, patch: Partial<Item>) =>
  setItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

// ---------- images ----------

/** In-memory object URLs: local blobs, and freshly uploaded blobs keyed by their server key. */
const blobUrls = new Map<string, string>();

export function imageSrc(key: string): string | null {
  if (blobUrls.has(key)) return blobUrls.get(key)!;
  if (key.startsWith("local:")) return null;
  return `/api/images/${key}`;
}

export function useImageSrc(key: string) {
  const [src, setSrc] = useState(() => imageSrc(key));
  useEffect(() => {
    const direct = imageSrc(key);
    if (direct) return setSrc(direct);
    let alive = true;
    get<Blob>(`blob:${key}`).then((b) => {
      if (!b || !alive) return;
      const url = URL.createObjectURL(b);
      blobUrls.set(key, url);
      setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return src;
}

// ---------- boot & sync ----------

export async function boot() {
  const cached = await get<Item[]>(CACHE_KEY).catch(() => undefined);
  if (cached?.length) setState({ items: cached, ready: true });

  const [cfg, me] = await Promise.allSettled([api.config(), api.me()]);
  if (cfg.status === "fulfilled") setState({ googleClientId: cfg.value.googleClientId, devAuth: cfg.value.devAuth });
  if (me.status === "fulfilled" && me.value.user) {
    setState({ auth: "in", user: me.value.user });
    await sync();
  } else {
    // Signed out: only unsynced local memos belong on this device. If the
    // server was unreachable, keep showing the cache instead.
    if (me.status === "fulfilled") setItems((items) => items.filter((i) => i.pending));
    setState({ auth: "out", user: null, ready: true });
  }
}

export async function sync() {
  setState({ syncing: true });
  try {
    const { items } = await api.items();
    setItems((cur) => [...cur.filter((i) => i.pending), ...items]);
    setState({ ready: true });
    await flush();
  } catch (e) {
    handleError(e);
    setState({ ready: true });
  } finally {
    setState({ syncing: false });
  }
}

let flushing = false;
/** Items whose images are still being compressed; flush waits for them. */
const preparing = new Set<string>();
async function flush() {
  if (flushing || state.auth !== "in") return;
  flushing = true;
  try {
    for (;;) {
      const it = [...state.items].reverse().find((i) => i.pending && !preparing.has(i.id));
      if (!it) break;
      const keys: string[] = [];
      for (const k of it.images) {
        if (!k.startsWith("local:")) {
          keys.push(k);
          continue;
        }
        const blob = await get<Blob>(`blob:${k}`);
        if (!blob) continue;
        const { key } = await api.upload(blob);
        if (blobUrls.has(k)) blobUrls.set(key, blobUrls.get(k)!);
        keys.push(key);
      }
      const { item } = await api.create({ id: it.id, body: it.body, images: keys, createdAt: it.createdAt, status: it.status });
      // The user may have edited the memo while it was uploading.
      const latest = state.items.find((i) => i.id === it.id);
      setItems((items) => items.map((i) => (i.id === it.id ? { ...item, body: latest?.body ?? item.body } : i)));
      if (latest && latest.body !== item.body) api.patch(item.id, { body: latest.body }).catch(handleError);
      await Promise.all(it.images.filter((k) => k.startsWith("local:")).map((k) => del(`blob:${k}`)));
    }
  } catch (e) {
    handleError(e);
  } finally {
    flushing = false;
  }
}

function handleError(e: unknown) {
  if (e instanceof ApiError && e.status === 401) {
    setState({ auth: "out", user: null });
    return;
  }
  if (!navigator.onLine) return; // pending items retry on reconnect
  toast("通信に失敗しました");
  console.error(e);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => flush());
}

// ---------- auth ----------

export async function signInWithGoogle(credential: string) {
  try {
    const { user } = await api.google(credential);
    setState({ auth: "in", user });
    await sync();
  } catch {
    toast("ログインに失敗しました");
  }
}

export async function signInDev() {
  const { user } = await api.dev();
  setState({ auth: "in", user });
  await sync();
}

export async function signOut() {
  await api.logout().catch(() => {});
  setItems((items) => items.filter((i) => i.pending));
  setState({ auth: "out", user: null });
}

// ---------- mutations ----------

export async function addItem(body: string, files: Blob[]) {
  const id = crypto.randomUUID();
  const images: string[] = [];
  for (const f of files) {
    const key = `local:${crypto.randomUUID()}`;
    blobUrls.set(key, URL.createObjectURL(f));
    images.push(key);
    set(`blob:${key}`, f).catch(() => {});
  }
  const now = Date.now();
  const item: Item = { id, body, images, status: 0, question: null, answer: null, reviews: 0, createdAt: now, updatedAt: now, pending: true };
  setItems((items) => [item, ...items]);
  if (!files.length) {
    flush();
    return id;
  }
  // Compress in the background, then upload.
  preparing.add(id);
  Promise.all(
    files.map(async (f, i) => {
      const small = await compressImage(f).catch(() => f);
      await set(`blob:${images[i]}`, small);
    }),
  ).finally(() => {
    preparing.delete(id);
    flush();
  });
  return id;
}

async function mutate(id: string, patch: Partial<Item>, remote: Record<string, unknown>) {
  const before = state.items.find((i) => i.id === id);
  if (!before) return;
  patchItem(id, { ...patch, updatedAt: Date.now() });
  if (before.pending || state.auth !== "in") return;
  try {
    const { item } = await api.patch(id, remote);
    patchItem(id, { ...item });
  } catch (e) {
    patchItem(id, before);
    handleError(e);
  }
}

export const setStatus = (id: string, status: Status, reviewed = false) =>
  mutate(
    id,
    { status, ...(reviewed ? { reviews: (state.items.find((i) => i.id === id)?.reviews ?? 0) + 1 } : {}) },
    { status, reviewed },
  );

export const setBody = (id: string, body: string) => mutate(id, { body }, { body });

export const setQA = (id: string, question: string, answer: string) =>
  mutate(id, { question, answer }, { question, answer });

const UNDO_MS = 4000;

/** Removes immediately from the list, but only deletes for real once the undo window has passed. */
export function removeItem(id: string) {
  const index = state.items.findIndex((i) => i.id === id);
  const it = state.items[index];
  if (!it) return;
  setItems((items) => items.filter((i) => i.id !== id));
  let undone = false;
  const timer = setTimeout(async () => {
    if (undone) return;
    if (it.pending) {
      it.images.forEach((k) => del(`blob:${k}`).catch(() => {}));
      return;
    }
    try {
      await api.remove(id);
    } catch (e) {
      setItems((items) => [...items.slice(0, index), it, ...items.slice(index)]);
      handleError(e);
    }
  }, UNDO_MS);
  toast(
    "削除しました",
    {
      label: "元に戻す",
      run: () => {
        undone = true;
        clearTimeout(timer);
        setItems((items) => [...items.slice(0, index), it, ...items.slice(index)]);
        dismissToast();
      },
    },
    UNDO_MS,
  );
}

export async function runAI(id: string, mode: "quiz" | "summary") {
  const it = state.items.find((i) => i.id === id);
  if (!it) return null;
  if (it.pending || state.auth !== "in") {
    toast("ログインするとAIが使えます");
    return null;
  }
  try {
    const res = await api.ai(id, mode);
    if (res.item) patchItem(id, res.item);
    return res;
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) toast("メモが空です");
    else if (e instanceof ApiError && e.status === 502) toast("AIの応答を読み取れませんでした");
    else handleError(e);
    return null;
  }
}
