import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { imagesFrom } from "../image";
import { getState, setAnswer, setMarked, setMemo, setStatus, useStore } from "../store";
import type { Item } from "../types";
import { burst } from "./Burst";
import { isolate, stop, useNativeStop } from "../isolate";
import { DraftThumbs, useDraftImages } from "./DraftImages";
import { IconCheck, IconFlag, IconFolder, IconHand, IconImage, IconPen, IconRotate, IconShuffle, IconX } from "./Icons";
import { Img } from "./Img";

type Result = "ok" | "ng";
type Side = "front" | "back";
type UpdateCard = (id: string, question: string, answer: string, questionImages?: string[], answerImages?: string[]) => void;



export function ReviewDeck({ open, deckId, onClose }: { open: boolean; deckId: string | null; onClose: () => void }) {
  return <AnimatePresence>{open && <Deck deckId={deckId} onClose={onClose} />}</AnimatePresence>;
}

const SHUFFLE_KEY = "mnemo-shuffle";

function readShuffle() {
  try {
    return localStorage.getItem(SHUFFLE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Least-reviewed, then oldest, first. */
const inOrder = (items: Item[]) => [...items].sort((a, b) => a.reviews - b.reviews || a.createdAt - b.createdAt).map((i) => i.id);

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Cards still to memorise, limited to one file when `deckId` is set. */
const dueIn = (items: Item[], deckId: string | null) => items.filter((i) => i.status !== 2 && (!deckId || i.deckId === deckId));

/** The memo is the question; the answer is added separately. */
function faces(it: Item) {
  return { front: it.body, back: it.answer ?? "", frontImages: it.images, backImages: it.answerImages ?? [] };
}

function Deck({ deckId, onClose }: { deckId: string | null; onClose: () => void }) {
  const deckName = useStore((s) => s.decks.find((d) => d.id === deckId)?.name);
  const [shuffle, setShuffle] = useState(readShuffle);
  // Snapshot the queue: everything not yet memorised, least-reviewed first, or shuffled.
  const order = (ids: string[], random: boolean) => {
    if (random) return shuffled(ids);
    const byId = new Map(getState().items.map((i) => [i.id, i]));
    return inOrder(ids.flatMap((id) => byId.get(id) ?? []));
  };
  const [queue, setQueue] = useState(() => order(inOrder(dueIn(getState().items, deckId)), shuffle));

  // Toggling mid-review keeps the card in hand and reorders the rest.
  const toggleShuffle = () => {
    const next = !shuffle;
    setShuffle(next);
    try {
      localStorage.setItem(SHUFFLE_KEY, next ? "1" : "0");
    } catch {}
    setQueue((q) => (q.length ? [q[0], ...order(q.slice(1), next)] : q));
    navigator.vibrate?.(8);
  };
  const [total, setTotal] = useState(queue.length);
  const [results, setResults] = useState<Result[]>([]);
  const [round, setRound] = useState(0);
  const [dir, setDir] = useState(1);
  const items = useStore((s) => s.items);
  const current = items.find((i) => i.id === queue[0]);
  const upcoming = items.find((i) => i.id === queue[1]);

  const onUpdateCard: UpdateCard = (id, question, answer, questionImages, answerImages) => {
    const it = getState().items.find((i) => i.id === id);
    if (!it) return;
    if (question !== it.body || questionImages) setMemo(id, question, questionImages);
    if (answer !== (it.answer ?? "") || answerImages) setAnswer(id, answer, answerImages);
  };

  const decide = (r: Result) => {
    if (!current) return;
    navigator.vibrate?.(r === "ok" ? [10, 30, 10] : 14);
    setDir(r === "ok" ? 1 : -1);
    if (r === "ok") burst(window.innerWidth / 2, window.innerHeight / 2, 22);
    setStatus(current.id, r === "ok" ? 2 : 1, true);
    setResults((x) => [...x, r]);
    setQueue((q) => q.slice(1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const done = results.length;
  const ok = results.filter((r) => r === "ok").length;
  const finished = !current;

  return (
    <motion.div
      className="review"
      role="dialog"
      aria-label="復習"
      initial={{ clipPath: "circle(0% at 50% 94%)" }}
      animate={{ clipPath: "circle(150% at 50% 94%)" }}
      exit={{ clipPath: "circle(0% at 50% 94%)", transition: { duration: 0.35, ease: [0.4, 0, 0.6, 1] } }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="review-top">
        <motion.button className="icon-btn glass" aria-label="閉じる" whileTap={{ scale: 0.88 }} onClick={onClose}>
          <IconX />
        </motion.button>
        <div className="progress">
          <motion.div animate={{ width: `${total ? (done / total) * 100 : 100}%` }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
        </div>
        {deckName && (
          <span className="review-deck" data-testid="review-deck">
            <IconFolder />
            {deckName}
          </span>
        )}
        <span className="review-count" data-testid="review-count">
          {Math.min(done + (finished ? 0 : 1), total)}/{total}
        </span>
        <motion.button
          className={`icon-btn glass shuffle${shuffle ? " on" : ""}`}
          aria-label="シャッフル"
          aria-pressed={shuffle}
          data-testid="shuffle"
          whileTap={{ scale: 0.86 }}
          animate={{ rotate: shuffle ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
          onClick={toggleShuffle}
        >
          <IconShuffle />
        </motion.button>
      </div>

      {finished ? (
        <Done ok={ok} ng={done - ok} total={total} onClose={onClose} onAgain={() => {
          const again = order(inOrder(dueIn(getState().items, deckId)), shuffle);
          setQueue(again);
          setTotal(again.length);
          setResults([]);
          setRound((r) => r + 1);
        }} canAgain={dueIn(getState().items, deckId).length > 0} />
      ) : (
        <>
          <div className="deck">
            <AnimatePresence initial={false} custom={dir}>
              {upcoming && (
                <motion.div key={`${round}-${upcoming.id}-peek`} className="flash" initial={{ scale: 0.9, y: 24, opacity: 0 }} animate={{ scale: 0.94, y: 16, opacity: 0.7 }} exit={{ opacity: 0 }} style={{ zIndex: 0 }}>
                  <div className="face glass" />
                </motion.div>
              )}
              <FlashCard key={`${round}-${current.id}`} item={current} onDecide={decide} onUpdateCard={onUpdateCard} />
            </AnimatePresence>
          </div>
          <div className="review-actions">
            <motion.button className="round glass ng" aria-label="もう一度" whileTap={{ scale: 0.85 }} onClick={() => decide("ng")}>
              <IconRotate />
            </motion.button>
            <motion.button
              className={`round glass mark${current.marked ? " on" : ""}`}
              aria-label="印"
              aria-pressed={!!current.marked}
              data-testid="mark-btn"
              whileTap={{ scale: 0.85 }}
              onClick={() => {
                setMarked(current.id, !current.marked);
                navigator.vibrate?.(10);
              }}
            >
              <motion.span key={String(!!current.marked)} style={{ display: "grid" }} initial={{ scale: 0.4, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 600, damping: 18 }}>
                <IconFlag />
              </motion.span>
            </motion.button>
            <motion.button className="round glass ok" aria-label="覚えた" whileTap={{ scale: 0.85 }} onClick={() => decide("ok")}>
              <IconCheck />
            </motion.button>
          </div>
        </>
      )}
    </motion.div>
  );
}

function FlashCard({ item, onDecide, onUpdateCard }: { item: Item; onDecide: (r: Result) => void; onUpdateCard: UpdateCard }) {
  const [flipped, setFlipped] = useState(false);
  const [editing, setEditing] = useState<Side | null>(null);
  const x = useMotionValue(0);
  const dragged = useRef(0);
  const rotate = useTransform(x, [-300, 300], [-14, 14]);
  const okOpacity = useTransform(x, [30, 120], [0, 1]);
  const ngOpacity = useTransform(x, [-120, -30], [1, 0]);
  const f = faces(item);

  const fling = (r: Result) => onDecide(r);

  const save = (side: Side, text: string, images: string[]) => {
    const value = text.trim();
    const before = side === "front" ? f.frontImages : f.backImages;
    if (side === "front" && !value && !images.length) return false;
    const imagesChanged = images.length !== before.length || images.some((k, i) => k !== before[i]);
    const textChanged = value !== (side === "front" ? f.front : f.back).trim();
    if (textChanged || imagesChanged) {
      onUpdateCard(
        item.id,
        side === "front" ? value : item.body,
        side === "back" ? value : item.answer ?? "",
        side === "front" && imagesChanged ? images : undefined,
        side === "back" && imagesChanged ? images : undefined,
      );
    }
    setEditing(null);
    return true;
  };

  const faceProps = (side: Side) => ({
    itemId: item.id,
    side,
    value: side === "front" ? f.front : f.back,
    images: side === "front" ? f.frontImages : f.backImages,
    editing: editing === side,
    locked: editing !== null && editing !== side,
    onEdit: () => setEditing(side),
    onSave: (text: string, images: string[]) => save(side, text, images),
    onCancel: () => setEditing(null),
  });

  return (
    <motion.div
      className={`flash${editing ? " is-editing" : ""}`}
      data-testid="flashcard"
      style={{ x, rotate, zIndex: 2 }}
      variants={{
        exit: (d: number) => ({ x: d * 600, opacity: 0, rotate: d * 20, transition: { duration: 0.35, ease: [0.3, 0, 0.2, 1] } }),
      }}
      initial={{ scale: 0.92, y: 30, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit="exit"
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      drag={!editing}
      dragSnapToOrigin
      dragElastic={0.9}
      onDragStart={() => (dragged.current = Date.now())}
      onDragEnd={(_, i) => {
        dragged.current = Date.now();
        if (i.offset.x > 110 || i.velocity.x > 700) fling("ok");
        else if (i.offset.x < -110 || i.velocity.x < -700) fling("ng");
        else animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
      }}
      onTap={(e) => {
        if (editing || Date.now() - dragged.current < 300) return;
        if ((e.target as Element | null)?.closest?.("[data-no-flip]")) return;
        setFlipped((v) => !v);
      }}
    >
      <motion.div className="stamp ok" style={{ opacity: okOpacity }}>覚えた</motion.div>
      <motion.div className="stamp ng" style={{ opacity: ngOpacity }}>もう一度</motion.div>
      <motion.div className="flash-inner" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
        <motion.div
          className="face front glass strong"
          data-testid="face-front"
          style={{ pointerEvents: flipped ? "none" : "auto" }}
          animate={{ opacity: flipped ? 0 : 1 }}
          transition={{ duration: 0.01, delay: 0.1 }}
        >
          <span className="label">Q</span>
          <AnimatePresence>
            {item.marked && (
              <motion.span className="mark-badge" data-testid="card-mark" aria-label="印あり" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 20 }}>
                <IconFlag />
              </motion.span>
            )}
          </AnimatePresence>
          <FaceText {...faceProps("front")} />
          {editing !== "front" && (
            <div className="tap">
              <IconHand />
            </div>
          )}
        </motion.div>
        <motion.div
          className="face back glass strong"
          data-testid="face-back"
          style={{ pointerEvents: flipped ? "auto" : "none" }}
          animate={{ opacity: flipped ? 1 : 0 }}
          transition={{ duration: 0.01, delay: 0.1 }}
        >
          <span className="label">A</span>
          <AnimatePresence>
            {item.marked && (
              <motion.span className="mark-badge" data-testid="card-mark" aria-label="印あり" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 20 }}>
                <IconFlag />
              </motion.span>
            )}
          </AnimatePresence>
          <FaceText {...faceProps("back")} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function FaceImages({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <div className={`fimgs n${Math.min(keys.length, 3)}`} data-testid="face-images">
      {keys.slice(0, 3).map((k) => (
        <div key={k} className="fimg">
          <Img k={k} />
        </div>
      ))}
      {keys.length > 3 && <span className="fimgs-more">+{keys.length - 3}</span>}
    </div>
  );
}

function FaceText({
  itemId,
  side,
  value,
  images,
  editing,
  locked,
  onEdit,
  onSave,
  onCancel,
}: {
  itemId: string;
  side: Side;
  value: string;
  images: string[];
  editing: boolean;
  locked: boolean;
  onEdit: () => void;
  onSave: (text: string, images: string[]) => boolean;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  // The front is the memo itself, which can hold more images than an answer.
  const draftImages = useDraftImages(itemId, side === "front" ? 12 : undefined);
  const [shake, setShake] = useState(0);
  const tools = useNativeStop<HTMLDivElement>();
  const area = useNativeStop<HTMLDivElement>();
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(value);
    draftImages.reset(images);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // The textarea mounts only after the text view has animated out, so focus it on mount.
  const focusOnMount = useCallback((el: HTMLTextAreaElement | null) => {
    ta.current = el;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * (draftImages.list.length ? 0.28 : 0.45))}px`;
  }, [draft, editing, draftImages.list.length]);

  const uploading = draftImages.uploading;
  const addFiles = draftImages.add;

  const commit = () => {
    if (uploading) return;
    if (!onSave(draft, draftImages.keys())) setShake((n) => n + 1);
  };

  const label = side === "front" ? "問題" : "回答";

  return (
    <>
      <div className="face-tools" ref={tools} data-no-flip {...isolate}>
        <AnimatePresence mode="popLayout" initial={false}>
          {editing ? (
            <motion.div key="editing" className="face-tools-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.button
                type="button"
                className="face-btn glass"
                aria-label={`${label}に画像を追加`}
                data-testid={`add-image-${side}`}
                disabled={draftImages.full}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileTap={{ scale: 0.86 }}
                transition={{ type: "spring", stiffness: 600, damping: 26, delay: 0.04 }}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInput.current?.click();
                }}
              >
                <IconImage />
              </motion.button>
              <motion.button
                type="button"
                className="face-btn save"
                aria-label={`${label}を保存`}
                data-testid={`save-${side}`}
                disabled={uploading}
                initial={{ scale: 0.4, opacity: 0, rotate: -45 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                whileTap={{ scale: 0.86 }}
                transition={{ type: "spring", stiffness: 600, damping: 26 }}
                onClick={(e) => {
                  e.stopPropagation();
                  commit();
                }}
              >
                {uploading ? <span className="spinner" /> : <IconCheck />}
              </motion.button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </motion.div>
          ) : (
            !locked && (
              <motion.button
                key="edit"
                type="button"
                className="face-btn glass"
                aria-label={`${label}を編集`}
                data-testid={`edit-${side}`}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                whileTap={{ scale: 0.86 }}
                transition={{ type: "spring", stiffness: 600, damping: 26 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <IconPen />
              </motion.button>
            )
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div
            key="edit"
            ref={area}
            className="face-edit"
            data-no-flip
            {...isolate}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addFiles(imagesFrom(e.dataTransfer));
            }}
            initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", x: shake ? [0, -8, 8, -5, 5, 0] : 0 }}
            exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
            transition={{ duration: 0.22 }}
          >
            <DraftThumbs draft={draftImages} testId={`edit-images-${side}`} />
            <textarea
              ref={focusOnMount}
              value={draft}
              aria-label={label}
              data-testid={`input-${side}`}
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                e.stopPropagation();
                const files = imagesFrom(e.clipboardData);
                if (!files.length) return;
                e.preventDefault();
                addFiles(files);
              }}
              onPointerDown={stop}
              onClick={stop}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") onCancel();
                else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commit();
                }
              }}
              onKeyUp={stop}
            />
          </motion.div>
        ) : (
          <motion.div
            key="view"
            className="face-view"
            initial={{ opacity: 0, y: -6, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8, filter: "blur(6px)" }}
            transition={{ duration: 0.22 }}
          >
            <FaceImages keys={images} />
            {value && (
              <div className={`text${value.length > 60 ? " small" : ""}`} data-testid={`text-${side}`}>
                {value}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Done({ ok, ng, total, onClose, onAgain, canAgain }: { ok: number; ng: number; total: number; onClose: () => void; onAgain: () => void; canAgain: boolean }) {
  const pct = total ? ok / total : 1;
  const C = 2 * Math.PI * 64;
  return (
    <motion.div className="done" data-testid="review-done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
      <svg className="ring" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="64" stroke="rgba(20,22,31,.08)" strokeWidth="12" fill="none" />
        <motion.circle
          cx="75" cy="75" r="64" fill="none" strokeWidth="12" strokeLinecap="round" stroke="url(#rg)"
          transform="rotate(-90 75 75)" strokeDasharray={C}
          initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct) }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
        <defs>
          <linearGradient id="rg" x1="0" x2="1"><stop offset="0" stopColor="#22c38e" /><stop offset="1" stopColor="#6f8dff" /></linearGradient>
        </defs>
        <text x="75" y="84" textAnchor="middle" fontSize="30" fontWeight="800" fill="var(--ink)">{Math.round(pct * 100)}%</text>
      </svg>
      <div className="stats">
        <div className="glass"><b style={{ color: "var(--s2)" }}>{ok}</b><span>覚えた</span></div>
        <div className="glass"><b style={{ color: "var(--s1)" }}>{ng}</b><span>もう一度</span></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {canAgain && <motion.button className="again glass" whileTap={{ scale: 0.94 }} onClick={onAgain}>もう一周</motion.button>}
        <motion.button className="again glass strong" whileTap={{ scale: 0.94 }} onClick={onClose}>閉じる</motion.button>
      </div>
    </motion.div>
  );
}
