import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createDeck, removeDeck, renameDeck, useStore } from "../store";
import { IconCheck, IconFolder, IconPlus, IconTrash } from "./Icons";

function MiniSheet({ open, onClose, label, testId, children }: { open: boolean; onClose: () => void; label: string; testId: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="sheet mini glass strong"
            role="dialog"
            aria-label={label}
            data-testid={testId}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.8 }}
            onDragEnd={(_, i) => (i.offset.y > 100 || i.velocity.y > 600) && onClose()}
          >
            <div className="grab-zone">
              <div className="grab" />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Pick (or create) the file to put memos in. */
export function DeckPicker({
  open,
  title,
  current,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  current?: string | null;
  onPick: (deckId: string | null) => void;
  onClose: () => void;
}) {
  const decks = useStore((s) => s.decks);
  const items = useStore((s) => s.items);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const create = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    const id = await createDeck(name);
    setCreating(false);
    if (id) onPick(id);
  };

  return (
    <MiniSheet open={open} onClose={onClose} label={title} testId="deck-picker">
      <h3 className="mini-title">{title}</h3>
      <form
        className="deck-new"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <IconPlus />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新しいファイル"
          aria-label="新しいファイル名"
          data-testid="deck-new-name"
          maxLength={60}
          enterKeyHint="done"
        />
        <AnimatePresence>
          {name.trim() && (
            <motion.button
              type="submit"
              className="face-btn small save"
              aria-label="作成して移動"
              data-testid="deck-new-submit"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              whileTap={{ scale: 0.86 }}
            >
              {creating ? <span className="spinner" /> : <IconCheck />}
            </motion.button>
          )}
        </AnimatePresence>
      </form>
      <div className="deck-list">
        {decks.map((d, i) => (
          <motion.button
            key={d.id}
            className={`deck-row${current === d.id ? " on" : ""}`}
            data-testid="deck-option"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPick(d.id)}
          >
            <IconFolder />
            <span className="deck-row-name">{d.name}</span>
            <span className="deck-row-n">{items.filter((it) => it.deckId === d.id).length}</span>
            {current === d.id && <IconCheck className="deck-row-check" />}
          </motion.button>
        ))}
        {current !== undefined && current !== null && (
          <motion.button className="deck-row muted" data-testid="deck-option-none" whileTap={{ scale: 0.97 }} onClick={() => onPick(null)}>
            <span className="deck-row-name">ファイルから外す</span>
          </motion.button>
        )}
      </div>
    </MiniSheet>
  );
}

/** Rename or delete a file. */
export function DeckEditor({ deckId, onClose, onDeleted }: { deckId: string | null; onClose: () => void; onDeleted: () => void }) {
  const deck = useStore((s) => s.decks.find((d) => d.id === deckId));
  const count = useStore((s) => s.items.filter((i) => deckId && i.deckId === deckId).length);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!deck) return;
    setName(deck.name);
    setConfirm(false);
  }, [deckId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (deck && name.trim()) renameDeck(deck.id, name);
    onClose();
  };

  return (
    <MiniSheet open={!!deck} onClose={save} label="ファイルの編集" testId="deck-editor">
      <form
        className="deck-new"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <IconFolder />
        <input ref={input} value={name} onChange={(e) => setName(e.target.value)} aria-label="ファイル名" data-testid="deck-rename" maxLength={60} enterKeyHint="done" />
        <motion.button type="submit" className="face-btn small save" aria-label="名前を保存" data-testid="deck-rename-save" whileTap={{ scale: 0.86 }}>
          <IconCheck />
        </motion.button>
      </form>
      <p className="deck-note">{count}件のメモ</p>
      <motion.button
        className={`danger-btn${confirm ? " armed" : ""}`}
        data-testid="deck-delete"
        whileTap={{ scale: 0.97 }}
        layout
        onClick={() => {
          if (!confirm) return setConfirm(true);
          if (deck) removeDeck(deck.id);
          onDeleted();
        }}
      >
        <IconTrash style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 6 }} />
        {confirm ? "もう一度押して削除（メモは残ります）" : "ファイルを削除"}
      </motion.button>
    </MiniSheet>
  );
}
