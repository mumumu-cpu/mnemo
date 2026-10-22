import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { forwardRef, useRef } from "react";
import { setStatus } from "../store";
import { STATUS, type Item, type Status } from "../types";
import { burst } from "./Burst";
import { IconArrowL, IconArrowR, IconCheck, IconCloudOff, IconFlag, IconFolder, IconSpark } from "./Icons";
import { Img } from "./Img";

const THRESHOLD = 88;

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "たった今";
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type CardProps = {
  item: Item;
  onOpen: (id: string) => void;
  index: number;
  deckName?: string;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
};

const LONG_PRESS_MS = 480;

export const ItemCard = forwardRef<HTMLDivElement, CardProps>(
  function ItemCard({ item, onOpen, index, deckName, selecting = false, selected = false, onSelect, onLongPress }, ref) {
    const x = useMotionValue(0);
    const cardRef = useRef<HTMLDivElement>(null);
    const dragged = useRef(0);
    const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
    const cancelPress = () => {
      if (press.current) clearTimeout(press.current.timer);
      press.current = null;
    };
    const next = Math.min(2, item.status + 1) as Status;
    const prev = Math.max(0, item.status - 1) as Status;
    const canNext = next !== item.status;
    const canPrev = prev !== item.status;

    const rightOpacity = useTransform(x, [0, THRESHOLD], [0, 1]);
    const leftOpacity = useTransform(x, [-THRESHOLD, 0], [1, 0]);
    const iconScaleR = useTransform(x, [THRESHOLD * 0.4, THRESHOLD], [0.6, 1.15]);
    const iconScaleL = useTransform(x, [-THRESHOLD, -THRESHOLD * 0.4], [1.15, 0.6]);
    const rotate = useTransform(x, [-200, 0, 200], [-2.5, 0, 2.5]);

    const commit = (to: Status, dir: 1 | -1) => {
      navigator.vibrate?.(12);
      if (to === 2 && cardRef.current) {
        const r = cardRef.current.getBoundingClientRect();
        burst(r.left + r.width * 0.15, r.top + r.height / 2);
      }
      animate(x, dir * 26, { duration: 0.12 }).then(() => {
        setStatus(item.id, to);
        animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
      });
    };

    const s = STATUS[item.status];
    return (
      <motion.div
        ref={ref}
        className="swipe"
        layout
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9, height: 0, marginBottom: -10, transition: { duration: 0.28 } }}
        transition={{ type: "spring", stiffness: 420, damping: 34, delay: Math.min(index, 8) * 0.035 }}
      >
        {canNext && (
          <motion.div className="swipe-bg left" style={{ background: STATUS[next].color, opacity: rightOpacity }}>
            <motion.span style={{ scale: iconScaleR }}>
              {next === 2 ? <IconCheck /> : <IconArrowR />} {STATUS[next].label}
            </motion.span>
          </motion.div>
        )}
        {canPrev && (
          <motion.div className="swipe-bg right" style={{ background: STATUS[prev].color, opacity: leftOpacity }}>
            <motion.span style={{ scale: iconScaleL }}>
              {STATUS[prev].label} <IconArrowL />
            </motion.span>
          </motion.div>
        )}
        <motion.div
          ref={cardRef}
          className={`card glass${selecting ? " selecting" : ""}${selected ? " selected" : ""}`}
          data-testid="item-card"
          data-status={item.status}
          style={{ x, rotate }}
          drag={selecting ? false : "x"}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: canPrev ? 0.9 : 0.12, right: canNext ? 0.9 : 0.12 }}
          dragSnapToOrigin={false}
          onPointerDown={(e) => {
            if (selecting || !onLongPress) return;
            cancelPress();
            press.current = {
              x: e.clientX,
              y: e.clientY,
              timer: setTimeout(() => {
                press.current = null;
                dragged.current = Date.now(); // swallow the tap that ends this press
                navigator.vibrate?.(15);
                onLongPress(item.id);
              }, LONG_PRESS_MS),
            };
          }}
          onPointerMove={(e) => {
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) cancelPress();
          }}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onDragStart={() => {
            cancelPress();
            dragged.current = Date.now();
          }}
          onDragEnd={(_, info) => {
            dragged.current = Date.now();
            const dx = info.offset.x;
            const v = info.velocity.x;
            if (canNext && (dx > THRESHOLD || (dx > 30 && v > 600))) commit(next, 1);
            else if (canPrev && (dx < -THRESHOLD || (dx < -30 && v < -600))) commit(prev, -1);
            else animate(x, 0, { type: "spring", stiffness: 600, damping: 32 });
          }}
          onTap={() => {
            if (Date.now() - dragged.current < 300) return;
            if (selecting) onSelect?.(item.id);
            else onOpen(item.id);
          }}
          whileTap={{ scale: 0.985 }}
        >
          <AnimatePresence initial={false}>
            {selecting && (
              <motion.span
                className={`check${selected ? " on" : ""}`}
                aria-hidden
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 26 }}
              >
                <AnimatePresence>{selected && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} style={{ display: "grid" }}><IconCheck /></motion.span>}</AnimatePresence>
              </motion.span>
            )}
          </AnimatePresence>
          <div className="card-body">{item.body}</div>
          {item.images.length > 0 && (
            <div className={`card-imgs${item.body ? "" : " solo"}`}>
              {item.images.slice(0, 4).map((k) => (
                <motion.div key={k} className="im">
                  <Img k={k} />
                </motion.div>
              ))}
              {item.images.length > 4 && <div className="more">+{item.images.length - 4}</div>}
            </div>
          )}
          <div className="card-meta">
            <motion.span className="chip" layout style={{ color: s.color }} key={item.status} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 600, damping: 22 }}>
              <i style={{ background: s.color }} />
              {s.label}
            </motion.span>
            <AnimatePresence initial={false}>
              {item.marked && (
                <motion.span
                  className="mark-chip"
                  data-testid="list-mark"
                  aria-label="印あり"
                  title="印あり"
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 600, damping: 20 }}
                >
                  <IconFlag />
                </motion.span>
              )}
            </AnimatePresence>
            {deckName && (
              <span className="deck-tag">
                <IconFolder /> {deckName}
              </span>
            )}
            {!!(item.answer || item.answerImages?.length) && (
              <span className="qa-hint">
                <IconSpark /> 回答あり
              </span>
            )}
            <span style={{ flex: 1 }} />
            {item.pending && (
              <span className="sync-dot" title="未同期">
                <IconCloudOff />
              </span>
            )}
            <span>{ago(item.createdAt)}</span>
          </div>
        </motion.div>
      </motion.div>
    );
  },
);
