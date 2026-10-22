import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type SyntheticEvent } from "react";
import { getState, setQA, setStatus, useStore } from "../store";
import type { Item } from "../types";
import { burst } from "./Burst";
import { IconCheck, IconHand, IconPen, IconRotate, IconX } from "./Icons";
import { Img } from "./Img";

type Result = "ok" | "ng";
type Side = "front" | "back";
type UpdateCard = (id: string, question: string, answer: string) => void;

const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Motion listens for tap/drag with native listeners on the card itself, which fire
 * before React's delegated handlers, so React's stopPropagation alone is too late.
 * Stop the press natively too, so controls inside the card never flip or drag it.
 */
function useNativeStop(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const types = ["pointerdown", "mousedown", "touchstart"] as const;
    const halt = (e: Event) => e.stopPropagation();
    types.forEach((t) => el.addEventListener(t, halt));
    return () => types.forEach((t) => el.removeEventListener(t, halt));
  }, [ref]);
}

const isolate = {
  onPointerDown: stop,
  onPointerUp: stop,
  onMouseDown: stop,
  onTouchStart: stop,
  onClick: stop,
  onDoubleClick: stop,
  onKeyDown: stop,
  onKeyUp: stop,
};

export function ReviewDeck({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <Deck onClose={onClose} />}</AnimatePresence>;
}

function faces(it: Item) {
  if (it.question) return { front: it.question, back: it.answer ?? "", backImages: it.images };
  const [first, ...rest] = it.body.split("\n");
  const restText = rest.join("\n").trim();
  if (restText) return { front: first, back: restText, backImages: it.images };
  return { front: it.body, back: "", backImages: it.images, frontImage: !it.body ? it.images[0] : undefined };
}

function Deck({ onClose }: { onClose: () => void }) {
  // Snapshot the queue: everything not yet memorised, oldest-reviewed first.
  const [queue, setQueue] = useState(() =>
    getState()
      .items.filter((i) => i.status !== 2)
      .sort((a, b) => a.reviews - b.reviews || a.createdAt - b.createdAt)
      .map((i) => i.id),
  );
  const total = useMemo(() => queue.length, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [results, setResults] = useState<Result[]>([]);
  const [round, setRound] = useState(0);
  const [dir, setDir] = useState(1);
  const items = useStore((s) => s.items);
  const current = items.find((i) => i.id === queue[0]);
  const upcoming = items.find((i) => i.id === queue[1]);

  const onUpdateCard: UpdateCard = (id, question, answer) => setQA(id, question, answer);

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
        <span className="review-count" data-testid="review-count">
          {Math.min(done + (finished ? 0 : 1), total)}/{total}
        </span>
      </div>

      {finished ? (
        <Done ok={ok} ng={done - ok} total={total} onClose={onClose} onAgain={() => {
          const again = getState().items.filter((i) => i.status !== 2).map((i) => i.id);
          setQueue(again);
          setResults([]);
          setRound((r) => r + 1);
        }} canAgain={getState().items.some((i) => i.status !== 2)} />
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

  const save = (side: Side, text: string) => {
    const value = text.trim();
    const question = side === "front" ? value : f.front.trim();
    const answer = side === "back" ? value : f.back.trim();
    if (!question) return false;
    if (question !== (item.question ?? "") || answer !== (item.answer ?? "")) onUpdateCard(item.id, question, answer);
    setEditing(null);
    return true;
  };

  const faceProps = (side: Side) => ({
    side,
    value: side === "front" ? f.front : f.back,
    editing: editing === side,
    locked: editing !== null && editing !== side,
    onEdit: () => setEditing(side),
    onSave: (text: string) => save(side, text),
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
          {f.frontImage && editing !== "front" && (
            <div className="fimg" style={{ position: "relative" }}>
              <Img k={f.frontImage} />
            </div>
          )}
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
          {f.backImages[0] && editing !== "back" && (
            <div className="fimg" style={{ position: "relative" }}>
              <Img k={f.backImages[0]} />
            </div>
          )}
          <FaceText {...faceProps("back")} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function FaceText({
  side,
  value,
  editing,
  locked,
  onEdit,
  onSave,
  onCancel,
}: {
  side: Side;
  value: string;
  editing: boolean;
  locked: boolean;
  onEdit: () => void;
  onSave: (text: string) => boolean;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [shake, setShake] = useState(0);
  const tools = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  useNativeStop(tools);
  useNativeStop(area);

  useEffect(() => {
    if (editing) setDraft(value);
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
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.45)}px`;
  }, [draft, editing]);

  const commit = () => {
    if (!onSave(draft)) setShake((n) => n + 1);
  };

  const label = side === "front" ? "問題" : "回答";

  return (
    <>
      <div className="face-tools" ref={tools} data-no-flip {...isolate}>
        <AnimatePresence mode="popLayout" initial={false}>
          {editing ? (
            <motion.button
              key="save"
              type="button"
              className="face-btn save"
              aria-label={`${label}を保存`}
              data-testid={`save-${side}`}
              initial={{ scale: 0.4, opacity: 0, rotate: -45 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              whileTap={{ scale: 0.86 }}
              transition={{ type: "spring", stiffness: 600, damping: 26 }}
              onClick={(e) => {
                e.stopPropagation();
                commit();
              }}
            >
              <IconCheck />
            </motion.button>
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
            initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", x: shake ? [0, -8, 8, -5, 5, 0] : 0 }}
            exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
            transition={{ duration: 0.22 }}
          >
            <textarea
              ref={focusOnMount}
              value={draft}
              aria-label={label}
              data-testid={`input-${side}`}
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
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
            className={`text${value.length > 60 ? " small" : ""}`}
            data-testid={`text-${side}`}
            initial={{ opacity: 0, y: -6, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8, filter: "blur(6px)" }}
            transition={{ duration: 0.22 }}
          >
            {value}
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
