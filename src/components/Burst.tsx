import { animate } from "motion";

const COLORS = ["#22c38e", "#6f8dff", "#b07bff", "#ff8fb1", "#f5c524"];

/** A tiny celebratory particle burst, for when something is memorised. */
export function burst(x: number, y: number, count = 14) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "burst";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.background = COLORS[i % COLORS.length];
    document.body.appendChild(el);
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const d = 40 + Math.random() * 50;
    animate(
      el,
      { x: [0, Math.cos(a) * d], y: [0, Math.sin(a) * d + 20], scale: [1, 0.2], opacity: [1, 0] },
      { duration: 0.7 + Math.random() * 0.3, ease: [0.2, 0.8, 0.3, 1] },
    ).then(() => el.remove());
  }
}
