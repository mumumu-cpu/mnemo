import { motion } from "motion/react";
import { useStore } from "../store";
import { IconFolder, IconMore, IconPlus, IconSelect } from "./Icons";

export type DeckFilter = "all" | string;

export function DeckBar({
  value,
  onChange,
  onAdd,
  onEdit,
  selecting,
  onToggleSelect,
}: {
  value: DeckFilter;
  onChange: (v: DeckFilter) => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  selecting: boolean;
  onToggleSelect: () => void;
}) {
  const decks = useStore((s) => s.decks);
  const items = useStore((s) => s.items);
  const chips = [{ id: "all", name: "すべて", n: items.length }, ...decks.map((d) => ({ id: d.id, name: d.name, n: items.filter((i) => i.deckId === d.id).length }))];

  return (
    <div className="deckbar" role="tablist" aria-label="ファイル">
      <div className="deckbar-scroll">
        {chips.map((c) => {
          const on = value === c.id;
          return (
            <motion.button
              key={c.id}
              role="tab"
              aria-selected={on}
              className={`deck-chip glass${on ? " on" : ""}`}
              data-testid={c.id === "all" ? "deck-all" : "deck-chip"}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              onClick={() => (on && c.id !== "all" ? onEdit(c.id) : onChange(c.id))}
            >
              {on && <motion.span layoutId="deck-pill" className="deck-pill" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
              {c.id !== "all" && <IconFolder />}
              <span className="deck-chip-name">{c.name}</span>
              <span className="deck-chip-n">{c.n}</span>
              {on && c.id !== "all" && <IconMore className="deck-chip-more" aria-label="ファイルを編集" />}
            </motion.button>
          );
        })}
        <motion.button className="deck-chip glass add" aria-label="新しいファイル" data-testid="deck-add" whileTap={{ scale: 0.9 }} onClick={onAdd}>
          <IconPlus />
        </motion.button>
      </div>
      <motion.button
        className={`deck-chip glass select${selecting ? " on" : ""}`}
        aria-pressed={selecting}
        aria-label="まとめて選択"
        data-testid="select-toggle"
        whileTap={{ scale: 0.9 }}
        onClick={onToggleSelect}
      >
        <IconSelect />
      </motion.button>
    </div>
  );
}
