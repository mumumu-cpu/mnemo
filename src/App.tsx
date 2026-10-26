import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Account } from "./components/Account";
import { Composer } from "./components/Composer";
import { DeckBar, type DeckFilter } from "./components/DeckBar";
import { DeckEditor, DeckPicker } from "./components/DeckSheets";
import { DetailSheet } from "./components/DetailSheet";
import { IconFolder, IconPlay, IconTrash, IconX } from "./components/Icons";
import { ImageViewer } from "./components/ImageViewer";
import { ItemCard } from "./components/ItemCard";
import { ReviewDeck } from "./components/ReviewDeck";
import { Toast } from "./components/Toast";
import { boot, getState, moveItems, removeItems, toast, useStore } from "./store";
import { STATUS } from "./types";

type Filter = "all" | 0 | 1 | 2;
const FILTERS: { key: Filter; label: string; color?: string }[] = [
  { key: "all", label: "すべて" },
  ...STATUS.map((s, i) => ({ key: i as Filter, label: s.label, color: s.color })),
];

function readDeck(): DeckFilter {
  try {
    return localStorage.getItem("mnemo-deck") ?? "all";
  } catch {
    return "all";
  }
}

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
  const decks = useStore((s) => s.decks);
  const auth = useStore((s) => s.auth);
  const decksLoaded = useStore((s) => s.decksLoaded);
  const [filter, setFilter] = useState<Filter>(readFilter);
  const [deck, setDeck] = useState<DeckFilter>(readDeck);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [picker, setPicker] = useState<null | "move" | "open">(null);
  const [editingDeck, setEditingDeck] = useState<string | null>(null);
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
      localStorage.setItem("mnemo-deck", deck);
    } catch {}
  }, [filter, deck]);

  // A remembered file may have been deleted elsewhere, or belong to a signed-out account.
  // Only judge once the server's list has arrived; the device cache may not know new files yet.
  useEffect(() => {
    if (deck !== "all" && decksLoaded && !decks.some((d) => d.id === deck)) setDeck("all");
  }, [deck, decks, decksLoaded]);

  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && endSelect();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const deckId = deck === "all" ? null : deck;
  const inDeck = useMemo(() => (deckId ? items.filter((i) => i.deckId === deckId) : items), [items, deckId]);
  const deckNames = useMemo(() => new Map(decks.map((d) => [d.id, d.name])), [decks]);
  const counts = useMemo(() => [0, 1, 2].map((s) => inDeck.filter((i) => i.status === s).length), [inDeck]);
  const visible = filter === "all" ? inDeck : inDeck.filter((i) => i.status === filter);

  const endSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const startSelect = (id: string) => {
    setSelecting(true);
    setSelected(new Set([id]));
  };
  const selectedDecks = new Set(items.filter((i) => selected.has(i.id)).map((i) => i.deckId ?? null));
  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));
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
        <DeckBar
          value={deck}
          onChange={setDeck}
          onAdd={() => (auth === "in" ? setPicker("open") : toast("ログインするとファイルを作れます"))}
          onEdit={setEditingDeck}
          selecting={selecting}
          onToggleSelect={() => (selecting ? endSelect() : setSelecting(true))}
        />

        <main className="scroller">
          <Composer deckId={deckId} />
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
                    <ItemCard
                      key={it.id}
                      item={it}
                      index={i}
                      onOpen={setOpenId}
                      deckName={deckId ? undefined : (it.deckId && deckNames.get(it.deckId)) || undefined}
                      selecting={selecting}
                      selected={selected.has(it.id)}
                      onSelect={toggle}
                      onLongPress={startSelect}
                    />
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
        <AnimatePresence mode="popLayout" initial={false}>
          {selecting ? (
            <motion.div key="select" className="dock-row" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <motion.button className="dock-btn" aria-label="選択をやめる" data-testid="select-cancel" whileTap={{ scale: 0.9 }} onClick={endSelect}>
                <IconX />
              </motion.button>
              <motion.button
                className="dock-btn text"
                data-testid="select-all"
                whileTap={{ scale: 0.94 }}
                onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((i) => i.id)))}
              >
                {allVisibleSelected ? "全解除" : "全選択"}
              </motion.button>
              <motion.button
                className="dock-btn danger"
                aria-label={`${selected.size}件を削除`}
                data-testid="delete-selected"
                whileTap={{ scale: 0.9 }}
                disabled={!selected.size}
                onClick={() => {
                  removeItems([...selected]);
                  endSelect();
                }}
              >
                <IconTrash />
              </motion.button>
              <motion.button
                className="play"
                data-testid="move-btn"
                whileTap={{ scale: 0.92 }}
                disabled={!selected.size}
                onClick={() => (auth === "in" || decks.length ? setPicker("move") : toast("ログインするとファイルを作れます"))}
              >
                <IconFolder />
                ファイルへ
                <span className="badge">{selected.size}</span>
              </motion.button>
            </motion.div>
          ) : (
            <motion.button
              key="review"
              className="play"
              data-testid="review-btn"
              whileTap={{ scale: 0.92 }}
              disabled={!dueCount}
              onClick={() => setReviewing(true)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <IconPlay />
              {deckId ? <span className="play-deck">{deckNames.get(deckId)}</span> : "復習"}
              <span className="badge">{dueCount}</span>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      <DetailSheet id={openId} onClose={close} onView={setViewKey} />
      <ImageViewer k={viewKey} onClose={() => setViewKey(null)} />
      <ReviewDeck open={reviewing} deckId={deckId} onClose={() => setReviewing(false)} onView={setViewKey} />
      <DeckPicker
        open={picker === "move"}
        title={`${selected.size}件をファイルへ`}
        current={selectedDecks.size === 1 ? [...selectedDecks][0] : undefined}
        onClose={() => setPicker(null)}
        onPick={(target) => {
          const n = selected.size;
          moveItems([...selected], target);
          setPicker(null);
          endSelect();
          toast(target ? `${n}件を「${getState().decks.find((d) => d.id === target)?.name ?? ""}」へ` : `${n}件をファイルから外しました`);
        }}
      />
      <DeckPicker
        open={picker === "open"}
        title="ファイル"
        onClose={() => setPicker(null)}
        onPick={(target) => {
          setPicker(null);
          if (target) setDeck(target);
        }}
      />
      <DeckEditor deckId={editingDeck} onClose={() => setEditingDeck(null)} onDeleted={() => (setEditingDeck(null), setDeck("all"))} />
      <Toast />
    </>
  );
}
