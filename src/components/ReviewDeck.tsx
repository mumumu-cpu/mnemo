import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getState, setStatus } from "../store";
import type { Item } from "../types";
import { burst } from "./Burst";
import { IconCheck, IconHand, IconRotate, IconX } from "./Icons";
import { Img } from "./Img";

type Result = "ok" | "ng";

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
  const items = getState().items;
  const current = items.find((i) => i.id === queue[0]);
  const upcoming = items.find((i) => i.id === queue[1]);

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
              <FlashCard key={`${round}-${current.id}`} item={current} onDecide={decide} />
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

function FlashCard({ item, onDecide }: { item: Item; onDecide: (r: Result) => void }) {
  const [flipped, setFlipped] = useState(false);
  const x = useMotionValue(0);
  const dragged = useRef(0);
  const rotate = useTransform(x, [-300, 300], [-14, 14]);
  const okOpacity = useTransform(x, [30, 120], [0, 1]);
  const ngOpacity = useTransform(x, [-120, -30], [1, 0]);
  const f = faces(item);

  const fling = (r: Result) => onDecide(r);

  return (
    <motion.div
      className="flash"
      data-testid="flashcard"
      style={{ x, rotate, zIndex: 2 }}
      variants={{
        exit: (d: number) => ({ x: d * 600, opacity: 0, rotate: d * 20, transition: { duration: 0.35, ease: [0.3, 0, 0.2, 1] } }),
      }}
      initial={{ scale: 0.92, y: 30, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit="exit"
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      drag
      dragSnapToOrigin
      dragElastic={0.9}
      onDragStart={() => (dragged.current = Date.now())}
      onDragEnd={(_, i) => {
        dragged.current = Date.now();
        if (i.offset.x > 110 || i.velocity.x > 700) fling("ok");
        else if (i.offset.x < -110 || i.velocity.x < -700) fling("ng");
        else animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
      }}
      onTap={() => Date.now() - dragged.current > 300 && setFlipped((v) => !v)}
    >
      <motion.div className="stamp ok" style={{ opacity: okOpacity }}>覚えた</motion.div>
      <motion.div className="stamp ng" style={{ opacity: ngOpacity }}>もう一度</motion.div>
      <motion.div className="flash-inner" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
        <motion.div className="face front glass strong" data-testid="face-front" animate={{ opacity: flipped ? 0 : 1 }} transition={{ duration: 0.01, delay: 0.1 }}>
          <span className="label">Q</span>
          {f.frontImage && (
            <div className="fimg" style={{ position: "relative" }}>
              <Img k={f.frontImage} />
            </div>
          )}
          <div className="text">{f.front}</div>
          <div className="tap">
            <IconHand />
          </div>
        </motion.div>
        <motion.div className="face back glass strong" data-testid="face-back" animate={{ opacity: flipped ? 1 : 0 }} transition={{ duration: 0.01, delay: 0.1 }}>
          <span className="label">A</span>
          {f.backImages[0] && (
            <div className="fimg" style={{ position: "relative" }}>
              <Img k={f.backImages[0]} />
            </div>
          )}
          {f.back && <div className={`text${f.back.length > 60 ? " small" : ""}`}>{f.back}</div>}
        </motion.div>
      </motion.div>
    </motion.div>
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
