import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Account } from "./components/Account";
import { Composer } from "./components/Composer";
import { DetailSheet } from "./components/DetailSheet";
import { IconPlay } from "./components/Icons";
import { ImageViewer } from "./components/ImageViewer";
import { ItemCard } from "./components/ItemCard";
import { ReviewDeck } from "./components/ReviewDeck";
import { Toast } from "./components/Toast";
import { boot, useStore } from "./store";
import { STATUS } from "./types";

type Filter = "all" | 0 | 1 | 2;
const FILTERS: { key: Filter; label: string; color?: string }[] = [
  { key: "all", label: "すべて" },
  ...STATUS.map((s, i) => ({ key: i as Filter, label: s.label, color: s.color })),
];

function readFilter(): Filter {
  try {
    const v = localStorage.getItem("mnemo-filter");
    return v === null || v === "all" ? "all" : (Number(v) as Filter);
  } catch {
    return "all";
  }
}

export function App() {
  const items = useStore((s) => s.items);
  const ready = useStore((s) => s.ready);
  const [filter, setFilter] = useState<Filter>(readFilter);
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    boot();
    const splash = document.getElementById("splash");
    splash?.classList.add("out");
    setTimeout(() => splash?.remove(), 600);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("mnemo-filter", String(filter));
    } catch {}
  }, [filter]);

  const counts = useMemo(() => [0, 1, 2].map((s) => items.filter((i) => i.status === s).length), [items]);
  const visible = filter === "all" ? items : items.filter((i) => i.status === filter);
  const dueCount = counts[0] + counts[1];
  const close = useCallback(() => setOpenId(null), []);

  return (
    <>
      <div className="ambient" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="shell">
        <header className="topbar">
          <nav className="seg glass" aria-label="ステータス">
            {FILTERS.map((f) => (
              <button key={String(f.key)} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} data-testid={`filter-${f.key}`}>
                {filter === f.key && <motion.span layoutId="seg-pill" className="pill" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                {f.color && <span className="dot" style={{ background: f.color }} />}
                {f.key === "all" ? f.label : <span className="lbl">{f.label}</span>}
                {f.key !== "all" && <span className="n">{counts[f.key as number]}</span>}
              </button>
            ))}
          </nav>
          <Account />
        </header>

        <main className="scroller">
          <Composer />
          {!ready ? (
            <div className="list" data-testid="skeleton">
              {[0.9, 0.6, 0.8, 0.5].map((w, i) => (
                <motion.div key={i} className="skel glass" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <b style={{ width: `${w * 100}%` }} />
                  <b style={{ width: `${w * 70}%` }} />
                  <b style={{ width: "22%", height: 18, borderRadius: 9, marginTop: 4 }} />
                </motion.div>
              ))}
            </div>
          ) : (
            <LayoutGroup>
              <motion.div className="list" layout data-testid="list">
                <AnimatePresence mode="popLayout" initial={false}>
                  {visible.map((it, i) => (
                    <ItemCard key={it.id} item={it} index={i} onOpen={setOpenId} />
                  ))}
                </AnimatePresence>
              </motion.div>
            </LayoutGroup>
          )}
          <AnimatePresence>
            {ready && visible.length === 0 && (
              <motion.div className="empty" data-testid="empty" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="8" y="10" width="32" height="28" rx="8" />
                  <path d="M16 20h16M16 27h10" strokeLinecap="round" />
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <motion.div
        className="dock glass"
        initial={{ y: 90, x: "-50%", opacity: 0 }}
        animate={{ y: reviewing ? 120 : 0, x: "-50%", opacity: reviewing ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30, delay: reviewing ? 0 : 0.15 }}
      >
        <motion.button className="play" data-testid="review-btn" whileTap={{ scale: 0.92 }} disabled={!dueCount} onClick={() => setReviewing(true)}>
          <IconPlay />
          復習
          <span className="badge">{dueCount}</span>
        </motion.button>
      </motion.div>

      <DetailSheet id={openId} onClose={close} onView={setViewKey} />
      <ImageViewer k={viewKey} onClose={() => setViewKey(null)} />
      <ReviewDeck open={reviewing} onClose={() => setReviewing(false)} />
      <Toast />
    </>
  );
}
