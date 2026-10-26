import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef } from "react";
import { useImageSrc } from "../store";
import { IconX } from "./Icons";

const MIN = 1;
const MAX = 5;
const DOUBLE_TAP = 2.5;
const spring = { type: "spring", stiffness: 420, damping: 38 } as const;

export function ImageViewer({ k, onClose }: { k: string | null; onClose: () => void }) {
  return <AnimatePresence>{k && <View k={k} onClose={onClose} />}</AnimatePresence>;
}

/** Full-screen image with pinch, double-tap and wheel zoom; pan while zoomed, swipe down to close. */
function View({ k, onClose }: { k: string; onClose: () => void }) {
  const src = useImageSrc(k);
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // Fade the backdrop while dragging down to dismiss.
  const backdrop = useTransform(y, (v) => (scale.get() > 1 ? 1 : Math.max(0.35, 1 - Math.abs(v) / 500)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  /** Keep the zoomed image covering the screen instead of sliding off it. */
  const clamp = (s: number, nx: number, ny: number) => {
    const el = img.current;
    if (!el) return { x: nx, y: ny };
    const mx = Math.max(0, (el.offsetWidth * s - window.innerWidth) / 2);
    const my = Math.max(0, (el.offsetHeight * s - window.innerHeight) / 2);
    return { x: Math.min(mx, Math.max(-mx, nx)), y: Math.min(my, Math.max(-my, ny)) };
  };

  /** Zoom to `next` keeping the point under (cx, cy) fixed on screen. */
  const zoomAt = (next: number, cx: number, cy: number, smooth: boolean) => {
    const s = Math.min(MAX, Math.max(MIN, next));
    const prev = scale.get();
    const ox = cx - window.innerWidth / 2;
    const oy = cy - window.innerHeight / 2;
    const ratio = s / prev;
    const pos = s === 1 ? { x: 0, y: 0 } : clamp(s, ox - (ox - x.get()) * ratio, oy - (oy - y.get()) * ratio);
    if (smooth) {
      animate(scale, s, spring);
      animate(x, pos.x, spring);
      animate(y, pos.y, spring);
    } else {
      scale.set(s);
      x.set(pos.x);
      y.set(pos.y);
    }
  };

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; scale: number; cx: number; cy: number } | null = null;
    let pan: { x: number; y: number; ox: number; oy: number; moved: boolean } | null = null;
    let lastTap = 0;

    const dist = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const mid = () => {
      const [a, b] = [...pts.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(".viewer-close")) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture can fail for pointers the browser no longer tracks; moves still arrive on the stage.
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const m = mid();
        pinch = { dist: dist(), scale: scale.get(), cx: m.x, cy: m.y };
        pan = null;
      } else if (pts.size === 1) {
        pan = { x: e.clientX, y: e.clientY, ox: x.get(), oy: y.get(), moved: false };
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const m = mid();
        zoomAt((pinch.scale * dist()) / pinch.dist, m.x, m.y, false);
        return;
      }
      if (!pan) return;
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (Math.hypot(dx, dy) > 6) pan.moved = true;
      if (scale.get() > 1) {
        const p = clamp(scale.get(), pan.ox + dx, pan.oy + dy);
        x.set(p.x);
        y.set(p.y);
      } else {
        // Not zoomed: drag vertically to dismiss.
        y.set(dy);
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pinch) {
        if (pts.size < 2) pinch = null;
        if (scale.get() < 1.05) zoomAt(1, window.innerWidth / 2, window.innerHeight / 2, true);
        // Continue panning with the finger that stays down.
        const rest = [...pts.values()][0];
        pan = rest ? { x: rest.x, y: rest.y, ox: x.get(), oy: y.get(), moved: true } : null;
        return;
      }
      const p = pan;
      pan = null;
      if (!p) return;
      if (scale.get() <= 1) {
        if (Math.abs(y.get()) > 120) return onClose();
        animate(y, 0, spring);
      }
      if (p.moved) return;
      // A tap: double tap toggles zoom; a single tap on the backdrop closes.
      const now = Date.now();
      if (now - lastTap < 300) {
        lastTap = 0;
        zoomAt(scale.get() > 1 ? 1 : DOUBLE_TAP, e.clientX, e.clientY, true);
        return;
      }
      lastTap = now;
      const onImage = (e.target as HTMLElement) === img.current;
      if (!onImage && scale.get() <= 1) {
        setTimeout(() => lastTap && Date.now() - lastTap >= 280 && onClose(), 300);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(scale.get() * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY, false);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div className="viewer" data-testid="image-viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="viewer-backdrop" style={{ opacity: backdrop }} />
      <div ref={stage} className="viewer-stage">
        <motion.div
          style={{ display: "grid", placeItems: "center", maxHeight: "100%", maxWidth: "100%" }}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={spring}
        >
          {src && <motion.img ref={img} src={src} alt="" draggable={false} data-testid="viewer-image" style={{ scale, x, y }} />}
        </motion.div>
      </div>
      <motion.button
        className="viewer-close glass"
        aria-label="閉じる"
        data-testid="viewer-close"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        whileTap={{ scale: 0.88 }}
        onClick={onClose}
      >
        <IconX />
      </motion.button>
    </motion.div>
  );
}
