import { get, set, del } from "idb-keyval";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, ApiError } from "./api";
import { compressImage } from "./image";
import type { Deck, Item, Status, User } from "./types";

type State = {
  auth: "loading" | "in" | "out";
  user: User | null;
  googleClientId: string | null;
  devAuth: boolean;
  items: Item[];
  decks: Deck[];
  /** true once the server's file list has been loaded (or we know there's none to load). */
  decksLoaded: boolean;
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
  decks: [],
  decksLoaded: false,
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
const DECKS_KEY = "decks-v1";
let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => set(CACHE_KEY, state.items).catch(() => {}), 120);
}

function setItems(fn: (items: Item[]) => Item[]) {
  setState((s) => ({ items: fn(s.items) }));
  persist();
}

function setDecks(fn: (decks: Deck[]) => Deck[]) {
  setState((s) => ({ decks: fn(s.decks) }));
  set(DECKS_KEY, state.decks).catch(() => {});
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
  const [cached, cachedDecks] = await Promise.all([
    get<Item[]>(CACHE_KEY).catch(() => undefined),
    get<Deck[]>(DECKS_KEY).catch(() => undefined),
  ]);
  if (cachedDecks?.length) setState({ decks: cachedDecks });
  if (cached?.length) setState({ items: cached, ready: true });

  const [cfg, me] = await Promise.allSettled([api.config(), api.me()]);
  if (cfg.status === "fulfilled") setState({ googleClientId: cfg.value.googleClientId, devAuth: cfg.value.devAuth });
  if (me.status === "fulfilled" && me.value.user) {
    setState({ auth: "in", user: me.value.user });
    await sync();
  } else {
    // Signed out: only unsynced local memos belong on this device. If the
    // server was unreachable, keep showing the cache instead.
    if (me.status === "fulfilled") {
      setItems((items) => items.filter((i) => i.pending));
      setDecks(() => []);
    }
    setState({ auth: "out", user: null, ready: true, decksLoaded: me.status === "fulfilled" });
  }
}

export async function sync() {
  setState({ syncing: true });
  try {
    const [{ items }, { decks }] = await Promise.all([api.items(), api.decks()]);
    setDecks(() => decks);
    setState({ decksLoaded: true });
    // A file picked for an unsynced memo while signed out can't exist on the server.
    const known = new Set(decks.map((d) => d.id));
    setItems((cur) => [...cur.filter((i) => i.pending).map((i) => (i.deckId && !known.has(i.deckId) ? { ...i, deckId: null } : i)), ...items]);
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
      const uploaded = new Map<string, string>();
      const upload = async (list: string[] = []) => {
        const out: string[] = [];
        for (const k of list) {
          if (!k.startsWith("local:")) {
            out.push(k);
            continue;
          }
          if (!uploaded.has(k)) {
            const blob = await get<Blob>(`blob:${k}`);
            if (!blob) continue;
            const { key } = await api.upload(blob);
            if (blobUrls.has(k)) blobUrls.set(key, blobUrls.get(k)!);
            uploaded.set(k, key);
          }
          out.push(uploaded.get(k)!);
        }
        return out;
      };
      const keys = await upload(it.images);
      const { item } = await api.create({ id: it.id, body: it.body, images: keys, createdAt: it.createdAt, status: it.status, deckId: it.deckId ?? null });
      // The user may have edited the memo (or its card) while it was uploading.
      const latest = state.items.find((i) => i.id === it.id) ?? it;
      const extra: Record<string, unknown> = {};
      if (latest.body !== item.body) extra.body = latest.body;
      if ((latest.deckId ?? null) !== (item.deckId ?? null)) extra.deckId = latest.deckId ?? null;
      if (latest.marked) extra.marked = true;
      if (latest.images.length !== it.images.length || latest.images.some((k, i) => k !== it.images[i])) extra.images = await upload(latest.images);
      if (latest.question) extra.question = latest.question;
      if (latest.answer) extra.answer = latest.answer;
      if (latest.questionImages) extra.questionImages = await upload(latest.questionImages);
      if (latest.answerImages) extra.answerImages = await upload(latest.answerImages);
      let synced = item;
      if (Object.keys(extra).length) synced = (await api.patch(item.id, extra)).item;
      setItems((items) => items.map((i) => (i.id === it.id ? synced : i)));
      const locals = [...it.images, ...latest.images, ...(latest.questionImages ?? []), ...(latest.answerImages ?? [])].filter((k) => k.startsWith("local:"));
      await Promise.all([...new Set(locals)].map((k) => del(`blob:${k}`)));
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
  setDecks(() => []);
  setState({ auth: "out", user: null });
}

// ---------- mutations ----------

export async function addItem(body: string, files: Blob[], deckId: string | null = null) {
  const id = crypto.randomUUID();
  const images: string[] = [];
  for (const f of files) {
    const key = `local:${crypto.randomUUID()}`;
    blobUrls.set(key, URL.createObjectURL(f));
    images.push(key);
    set(`blob:${key}`, f).catch(() => {});
  }
  const now = Date.now();
  const item: Item = { id, body, images, status: 0, question: null, answer: null, deckId, reviews: 0, createdAt: now, updatedAt: now, pending: true };
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

export const setMarked = (id: string, marked: boolean) => mutate(id, { marked }, { marked });

export const setBody = (id: string, body: string) => mutate(id, { body }, { body });

/** The memo is the card's question: its text and images. */
export const setMemo = (id: string, body: string, images?: string[]) =>
  mutate(id, { body, ...(images && { images }) }, { body, ...(images && { images }) });

export const setAnswer = (id: string, answer: string, answerImages?: string[]) =>
  mutate(id, { answer, ...(answerImages && { answerImages }) }, { answer, ...(answerImages && { answerImages }) });

export const setQA = (id: string, question: string, answer: string, questionImages?: string[], answerImages?: string[]) =>
  mutate(
    id,
    { question, answer, ...(questionImages && { questionImages }), ...(answerImages && { answerImages }) },
    { question, answer, ...(questionImages && { questionImages }), ...(answerImages && { answerImages }) },
  );

/**
 * Compresses images for an item and makes them referenceable right away. Synced
 * items get server keys; unsynced ones keep "local:" keys in IndexedDB until the
 * item's first sync uploads them. Returns null if an upload failed.
 */
export async function stageImages(itemId: string, files: Blob[]): Promise<string[] | null> {
  const owner = state.items.find((i) => i.id === itemId);
  const pending = !owner || !!owner.pending || state.auth !== "in";
  const keys: string[] = [];
  for (const f of files) {
    const small = await compressImage(f).catch(() => f);
    const preview = URL.createObjectURL(small);
    if (!pending) {
      try {
        const { key } = await api.upload(small);
        blobUrls.set(key, preview);
        keys.push(key);
      } catch (e) {
        handleError(e);
        return null;
      }
      continue;
    }
    const key = `local:${crypto.randomUUID()}`;
    blobUrls.set(key, preview);
    await set(`blob:${key}`, small);
    keys.push(key);
  }
  return keys;
}

export async function addImages(id: string, files: Blob[]) {
  const keys = await stageImages(id, files);
  const it = state.items.find((i) => i.id === id);
  if (!it || !keys?.length) return;
  const images = [...it.images, ...keys].slice(0, 12);
  return mutate(id, { images }, { images });
}

// ---------- files (decks) ----------

export async function createDeck(name: string): Promise<string | null> {
  const clean = name.trim().slice(0, 60);
  if (!clean) return null;
  if (state.auth !== "in") {
    toast("ログインするとファイルを作れます");
    return null;
  }
  const deck: Deck = { id: crypto.randomUUID(), name: clean, createdAt: Date.now() };
  setDecks((d) => [...d, deck]);
  try {
    await api.createDeck({ id: deck.id, name: clean });
    return deck.id;
  } catch (e) {
    setDecks((d) => d.filter((x) => x.id !== deck.id));
    handleError(e);
    return null;
  }
}

export async function renameDeck(id: string, name: string) {
  const clean = name.trim().slice(0, 60);
  const before = state.decks.find((d) => d.id === id);
  if (!clean || !before || clean === before.name) return;
  setDecks((d) => d.map((x) => (x.id === id ? { ...x, name: clean } : x)));
  try {
    await api.renameDeck(id, clean);
  } catch (e) {
    setDecks((d) => d.map((x) => (x.id === id ? before : x)));
    handleError(e);
  }
}

/** Deletes the file only; its memos stay and simply leave the file. */
export async function removeDeck(id: string) {
  const deck = state.decks.find((d) => d.id === id);
  if (!deck) return;
  const members = state.items.filter((i) => i.deckId === id).map((i) => i.id);
  setDecks((d) => d.filter((x) => x.id !== id));
  setItems((items) => items.map((i) => (i.deckId === id ? { ...i, deckId: null } : i)));
  try {
    await api.removeDeck(id);
  } catch (e) {
    setDecks((d) => [...d, deck].sort((a, b) => a.createdAt - b.createdAt));
    setItems((items) => items.map((i) => (members.includes(i.id) ? { ...i, deckId: id } : i)));
    handleError(e);
  }
}

export async function moveItems(ids: string[], deckId: string | null) {
  const before = new Map(state.items.filter((i) => ids.includes(i.id)).map((i) => [i.id, i.deckId ?? null]));
  if (!before.size) return;
  setItems((items) => items.map((i) => (before.has(i.id) ? { ...i, deckId, updatedAt: Date.now() } : i)));
  // Unsynced memos carry their file with them on first sync.
  const synced = [...before.keys()].filter((id) => !state.items.find((i) => i.id === id)?.pending);
  if (!synced.length || state.auth !== "in") return;
  try {
    await api.move(synced, deckId);
  } catch (e) {
    setItems((items) => items.map((i) => (before.has(i.id) ? { ...i, deckId: before.get(i.id)! } : i)));
    handleError(e);
  }
}

const UNDO_MS = 4000;

/** Removes immediately from the list, but only deletes for real once the undo window has passed. */
export const removeItem = (id: string) => removeItems([id]);

export function removeItems(ids: string[]) {
  const wanted = new Set(ids);
  const removed = state.items.flatMap((it, index) => (wanted.has(it.id) ? [{ it, index }] : []));
  if (!removed.length) return;
  setItems((items) => items.filter((i) => !wanted.has(i.id)));
  const restore = () =>
    setItems((items) => {
      const next = [...items];
      for (const { it, index } of removed) next.splice(Math.min(index, next.length), 0, it);
      return next;
    });
  let undone = false;
  const timer = setTimeout(async () => {
    if (undone) return;
    for (const { it } of removed) if (it.pending) it.images.forEach((k) => del(`blob:${k}`).catch(() => {}));
    const synced = removed.filter(({ it }) => !it.pending).map(({ it }) => it.id);
    if (!synced.length) return;
    try {
      if (synced.length === 1) await api.remove(synced[0]);
      else await api.removeMany(synced);
    } catch (e) {
      restore();
      handleError(e);
    }
  }, UNDO_MS);
  toast(
    removed.length === 1 ? "削除しました" : `${removed.length}件を削除しました`,
    {
      label: "元に戻す",
      run: () => {
        undone = true;
        clearTimeout(timer);
        restore();
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
