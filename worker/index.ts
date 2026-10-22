import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

type Env = {
  DB: D1Database;
  IMAGES: KVNamespace;
  AI: Ai;
  GOOGLE_CLIENT_ID: string;
  SESSION_SECRET: string;
  DEV_AUTH?: string;
};

type Vars = { uid: string };

type ItemRow = {
  id: string;
  body: string;
  images: string;
  status: number;
  question: string | null;
  answer: string | null;
  question_images: string | null;
  answer_images: string | null;
  deck_id: string | null;
  marked: number;
  reviews: number;
  created_at: number;
  updated_at: number;
};

const COOKIE = "mnemo_session";
const SESSION_DAYS = 60;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_FACE_IMAGES = 6;

const imageKeys = (v: unknown, max: number) =>
  Array.isArray(v) ? JSON.stringify(v.filter((k): k is string => typeof k === "string" && /^[\w-]{8,64}$/.test(k)).slice(0, max)) : null;
/** Returns the deck id if it belongs to the user, otherwise null. */
async function ownDeck(env: Env, uid: string, deckId: unknown): Promise<string | null> {
  if (typeof deckId !== "string" || !deckId) return null;
  const row = await env.DB.prepare("SELECT id FROM decks WHERE id = ? AND user_id = ?").bind(deckId, uid).first<{ id: string }>();
  return row?.id ?? null;
}

const TEXT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api");

const secretKey = (env: Env) => new TextEncoder().encode(env.SESSION_SECRET);

async function issueSession(c: any, uid: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey(c.env));
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

async function upsertUser(env: Env, u: { id: string; email: string; name?: string; picture?: string }) {
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, picture, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET email = ?2, name = ?3, picture = ?4`,
  )
    .bind(u.id, u.email, u.name ?? null, u.picture ?? null, Date.now())
    .run();
}

const toItem = (r: ItemRow) => ({
  id: r.id,
  body: r.body,
  images: JSON.parse(r.images) as string[],
  status: r.status,
  question: r.question,
  answer: r.answer,
  questionImages: r.question_images ? (JSON.parse(r.question_images) as string[]) : null,
  answerImages: r.answer_images ? (JSON.parse(r.answer_images) as string[]) : null,
  deckId: r.deck_id,
  marked: !!r.marked,
  reviews: r.reviews,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

app.get("/config", (c) =>
  c.json({ googleClientId: c.env.GOOGLE_CLIENT_ID || null, devAuth: c.env.DEV_AUTH === "1" }),
);

app.post("/auth/google", async (c) => {
  const { credential } = await c.req.json<{ credential?: string }>();
  if (!credential || !c.env.GOOGLE_CLIENT_ID) return c.json({ error: "bad_request" }, 400);
  try {
    const { payload } = await jwtVerify(credential, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: c.env.GOOGLE_CLIENT_ID,
    });
    if (!payload.sub || !payload.email || payload.email_verified === false) throw new Error("unverified");
    const user = {
      id: `g:${payload.sub}`,
      email: String(payload.email),
      name: payload.name as string | undefined,
      picture: payload.picture as string | undefined,
    };
    await upsertUser(c.env, user);
    await issueSession(c, user.id);
    return c.json({ user });
  } catch {
    return c.json({ error: "invalid_token" }, 401);
  }
});

// Local development only: enabled by DEV_AUTH=1 in .dev.vars, never set in production.
app.post("/auth/dev", async (c) => {
  if (c.env.DEV_AUTH !== "1") return c.notFound();
  const user = { id: "dev:tester", email: "tester@example.test", name: "Tester" };
  await upsertUser(c.env, user);
  await issueSession(c, user.id);
  return c.json({ user });
});

app.post("/auth/logout", (c) => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

async function sessionUid(c: any): Promise<string | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(c.env), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// Signed-out is a normal state on boot, so this answers 200 with user: null.
app.get("/me", async (c) => {
  const uid = await sessionUid(c);
  const user = uid
    ? await c.env.DB.prepare("SELECT id, email, name, picture FROM users WHERE id = ?").bind(uid).first()
    : null;
  return c.json({ user });
});

// Everything below requires a session.
app.use("*", async (c, next) => {
  const uid = await sessionUid(c);
  if (!uid) return c.json({ error: "unauthorized" }, 401);
  c.set("uid", uid);
  await next();
});

app.get("/items", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000",
  )
    .bind(c.get("uid"))
    .all<ItemRow>();
  return c.json({ items: results.map(toItem) });
});

app.post("/items", async (c) => {
  const b = await c.req.json<{ id?: string; body?: string; images?: string[]; createdAt?: number; status?: number; deckId?: string | null; answer?: string }>();
  const answer = typeof b.answer === "string" && b.answer.trim() ? b.answer.slice(0, 4000) : null;
  const deckId = await ownDeck(c.env, c.get("uid"), b.deckId);
  const status = [0, 1, 2].includes(b.status as number) ? (b.status as number) : 0;
  const id = b.id && /^[\w-]{8,64}$/.test(b.id) ? b.id : crypto.randomUUID();
  const images = (b.images ?? []).filter((k) => typeof k === "string").slice(0, 12);
  const now = Date.now();
  const created = Math.min(b.createdAt ?? now, now);
  await c.env.DB.prepare(
    `INSERT INTO items (id, user_id, body, images, status, created_at, updated_at, deck_id, answer)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(id) DO NOTHING`,
  )
    .bind(id, c.get("uid"), (b.body ?? "").slice(0, 20000), JSON.stringify(images), status, created, now, deckId, answer)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM items WHERE id = ? AND user_id = ?")
    .bind(id, c.get("uid"))
    .first<ItemRow>();
  if (!row) return c.json({ error: "conflict" }, 409);
  return c.json({ item: toItem(row) }, 201);
});

app.patch("/items/:id", async (c) => {
  const b = await c.req.json<
    Partial<{ body: string; status: number; question: string; answer: string; reviewed: boolean; images: string[]; questionImages: string[]; answerImages: string[]; deckId: string | null; marked: boolean }>
  >();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof b.body === "string") (sets.push("body = ?"), vals.push(b.body.slice(0, 20000)));
  if (typeof b.status === "number" && [0, 1, 2].includes(b.status)) (sets.push("status = ?"), vals.push(b.status));
  if (typeof b.question === "string") (sets.push("question = ?"), vals.push(b.question.slice(0, 2000)));
  if (typeof b.answer === "string") (sets.push("answer = ?"), vals.push(b.answer.slice(0, 4000)));
  const images = imageKeys(b.images, 12);
  const questionImages = imageKeys(b.questionImages, MAX_FACE_IMAGES);
  const answerImages = imageKeys(b.answerImages, MAX_FACE_IMAGES);
  if (images) (sets.push("images = ?"), vals.push(images));
  if (questionImages) (sets.push("question_images = ?"), vals.push(questionImages));
  if (answerImages) (sets.push("answer_images = ?"), vals.push(answerImages));
  if (b.deckId !== undefined) (sets.push("deck_id = ?"), vals.push(await ownDeck(c.env, c.get("uid"), b.deckId)));
  if (typeof b.marked === "boolean") (sets.push("marked = ?"), vals.push(b.marked ? 1 : 0));
  if (b.reviewed) sets.push("reviews = reviews + 1");
  if (!sets.length) return c.json({ error: "bad_request" }, 400);
  sets.push("updated_at = ?");
  vals.push(Date.now());
  const row = await c.env.DB.prepare(
    `UPDATE items SET ${sets.join(", ")} WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(...vals, c.req.param("id"), c.get("uid"))
    .first<ItemRow>();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ item: toItem(row) });
});

type DeckRow = { id: string; name: string; created_at: number };
const toDeck = (r: DeckRow) => ({ id: r.id, name: r.name, createdAt: r.created_at });
const deckName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 60) : "");

app.get("/decks", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, name, created_at FROM decks WHERE user_id = ? ORDER BY created_at")
    .bind(c.get("uid"))
    .all<DeckRow>();
  return c.json({ decks: results.map(toDeck) });
});

app.post("/decks", async (c) => {
  const b = await c.req.json<{ id?: string; name?: string }>();
  const name = deckName(b.name);
  if (!name) return c.json({ error: "bad_request" }, 400);
  const id = b.id && /^[\w-]{8,64}$/.test(b.id) ? b.id : crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO decks (id, user_id, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
    .bind(id, c.get("uid"), name, Date.now())
    .run();
  const row = await c.env.DB.prepare("SELECT id, name, created_at FROM decks WHERE id = ? AND user_id = ?")
    .bind(id, c.get("uid"))
    .first<DeckRow>();
  if (!row) return c.json({ error: "conflict" }, 409);
  return c.json({ deck: toDeck(row) }, 201);
});

app.patch("/decks/:id", async (c) => {
  const name = deckName((await c.req.json<{ name?: string }>()).name);
  if (!name) return c.json({ error: "bad_request" }, 400);
  const row = await c.env.DB.prepare("UPDATE decks SET name = ? WHERE id = ? AND user_id = ? RETURNING id, name, created_at")
    .bind(name, c.req.param("id"), c.get("uid"))
    .first<DeckRow>();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ deck: toDeck(row) });
});

// Deleting a file keeps its memos; they just leave the file.
app.delete("/decks/:id", async (c) => {
  const uid = c.get("uid");
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE items SET deck_id = NULL, updated_at = ? WHERE user_id = ? AND deck_id = ?").bind(Date.now(), uid, id),
    c.env.DB.prepare("DELETE FROM decks WHERE id = ? AND user_id = ?").bind(id, uid),
  ]);
  return c.json({ ok: true });
});

app.post("/items/move", async (c) => {
  const b = await c.req.json<{ ids?: string[]; deckId?: string | null }>();
  const uid = c.get("uid");
  const ids = (b.ids ?? []).filter((i) => typeof i === "string").slice(0, 1000);
  if (!ids.length) return c.json({ error: "bad_request" }, 400);
  const deckId = await ownDeck(c.env, uid, b.deckId);
  if (b.deckId && !deckId) return c.json({ error: "not_found" }, 404);
  const now = Date.now();
  // D1 caps bound parameters per statement, so move in chunks.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  await c.env.DB.batch(
    chunks.map((chunk) =>
      c.env.DB.prepare(
        `UPDATE items SET deck_id = ?, updated_at = ? WHERE user_id = ? AND id IN (${chunk.map(() => "?").join(",")})`,
      ).bind(deckId, now, uid, ...chunk),
    ),
  );
  return c.json({ ok: true, deckId });
});

type DeletedRow = { images: string; question_images: string | null; answer_images: string | null };

// Card images may reuse memo images, so delete each key once.
function purgeImages(c: any, rows: DeletedRow[]) {
  const uid = c.get("uid");
  const keys = [...new Set(rows.flatMap((r) => [r.images, r.question_images ?? "[]", r.answer_images ?? "[]"].flatMap((j) => JSON.parse(j) as string[])))];
  c.executionCtx.waitUntil(Promise.all(keys.map((k) => (c.env as Env).IMAGES.delete(`${uid}/${k}`))));
}

app.delete("/items/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "DELETE FROM items WHERE id = ? AND user_id = ? RETURNING images, question_images, answer_images",
  )
    .bind(c.req.param("id"), c.get("uid"))
    .first<DeletedRow>();
  if (row) purgeImages(c, [row]);
  return c.json({ ok: true });
});

app.post("/items/delete", async (c) => {
  const ids = ((await c.req.json<{ ids?: string[] }>()).ids ?? []).filter((i) => typeof i === "string").slice(0, 1000);
  if (!ids.length) return c.json({ error: "bad_request" }, 400);
  const uid = c.get("uid");
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const results = await c.env.DB.batch<DeletedRow>(
    chunks.map((chunk) =>
      c.env.DB.prepare(
        `DELETE FROM items WHERE user_id = ? AND id IN (${chunk.map(() => "?").join(",")}) RETURNING images, question_images, answer_images`,
      ).bind(uid, ...chunk),
    ),
  );
  const rows = results.flatMap((r) => r.results);
  purgeImages(c, rows);
  return c.json({ ok: true, deleted: rows.length });
});

app.post("/images", async (c) => {
  const type = c.req.header("content-type") ?? "";
  if (!/^image\/(webp|jpeg|png|gif)$/.test(type)) return c.json({ error: "unsupported_type" }, 415);
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_IMAGE_BYTES) return c.json({ error: "too_large" }, 413);
  const key = crypto.randomUUID();
  await c.env.IMAGES.put(`${c.get("uid")}/${key}`, buf, { metadata: { type } });
  return c.json({ key }, 201);
});

app.get("/images/:key", async (c) => {
  const { value, metadata } = await c.env.IMAGES.getWithMetadata<{ type: string }>(
    `${c.get("uid")}/${c.req.param("key")}`,
    "arrayBuffer",
  );
  if (!value) return c.notFound();
  return new Response(value, {
    headers: {
      "content-type": metadata?.type ?? "image/webp",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
});

const AI_PROMPTS = {
  quiz: `あなたは暗記カードを作るJSON生成器です。ユーザーのメモ（と画像）から、覚えるべき核心を一問一答1組にしてください。
出力規則（厳守）:
- 単一のJSONオブジェクトだけを出力する。最初の文字は「{」、最後の文字は「}」。
- 前置き・挨拶・解説・Markdown・コードフェンスは一切出力しない。
- キーは "question" と "answer" の2つだけ。
- question は表面に出す1文の問題。answer は裏面に出す簡潔な答え（120字以内、必要なら短い補足）。
- メモと同じ言語で書く。`,
  summary: `ユーザーのメモ（と画像）を暗記しやすいように、箇条書き3〜5行で要点だけ日本語で整理してください。前置きや見出しは不要。`,
} as const;

async function imageDataUrl(env: Env, uid: string, key: string) {
  const { value, metadata } = await env.IMAGES.getWithMetadata<{ type: string }>(`${uid}/${key}`, "arrayBuffer");
  if (!value) return null;
  const bytes = new Uint8Array(value);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${metadata?.type ?? "image/webp"};base64,${btoa(bin)}`;
}

function extractJson(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as { question?: string; answer?: string };
  } catch {
    return null;
  }
}

app.post("/items/:id/ai", async (c) => {
  const { mode } = await c.req.json<{ mode: keyof typeof AI_PROMPTS }>();
  if (!(mode in AI_PROMPTS)) return c.json({ error: "bad_request" }, 400);
  const uid = c.get("uid");
  const row = await c.env.DB.prepare("SELECT * FROM items WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), uid)
    .first<ItemRow>();
  if (!row) return c.json({ error: "not_found" }, 404);

  const imageKey = (JSON.parse(row.images) as string[])[0];
  const dataUrl = imageKey ? await imageDataUrl(c.env, uid, imageKey) : null;
  if (!row.body.trim() && !dataUrl) return c.json({ error: "empty" }, 422);

  const content: any[] = [{ type: "text", text: row.body.trim() || "（画像のみのメモ）" }];
  if (dataUrl) content.push({ type: "image_url", image_url: { url: dataUrl } });

  const res: any = await c.env.AI.run(TEXT_MODEL as any, {
    messages: [
      { role: "system", content: AI_PROMPTS[mode] },
      { role: "user", content },
    ],
    max_tokens: 600,
    temperature: mode === "quiz" ? 0.2 : 0.4,
    ...(mode === "quiz" && {
      response_format: {
        type: "json_schema",
        json_schema: {
          type: "object",
          properties: { question: { type: "string" }, answer: { type: "string" } },
          required: ["question", "answer"],
        },
      },
    }),
  } as any);
  if (mode === "quiz" && res?.response && typeof res.response === "object") {
    const card = res.response as { question?: string; answer?: string };
    if (card.question && card.answer) return saveQuiz(c, row.id, uid, card.question, card.answer);
  }
  const text: string = typeof res?.response === "string" ? res.response : JSON.stringify(res?.response ?? "");

  if (mode === "summary") return c.json({ summary: text.trim() });

  const parsed = extractJson(text);
  if (!parsed?.question || !parsed?.answer) return c.json({ error: "ai_parse_failed" }, 502);
  return saveQuiz(c, row.id, uid, parsed.question, parsed.answer);
});

async function saveQuiz(c: any, id: string, uid: string, question: string, answer: string) {
  const updated = await (c.env as Env).DB.prepare(
    "UPDATE items SET question = ?, answer = ?, updated_at = ? WHERE id = ? AND user_id = ? RETURNING *",
  )
    .bind(question.trim().slice(0, 2000), answer.trim().slice(0, 4000), Date.now(), id, uid)
    .first<ItemRow>();
  return c.json({ item: toItem(updated!) });
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

export default app;
