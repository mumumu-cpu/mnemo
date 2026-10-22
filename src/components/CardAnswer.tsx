import { AnimatePresence, motion } from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { isolate, useNativeStop } from "../isolate";
import { setAnswer } from "../store";
import type { Item } from "../types";
import { IconCheck, IconPlus } from "./Icons";

/** The answer, written right on the home card without opening the detail sheet. */
export function CardAnswer({ item, selecting, onEditing }: { item: Item; selecting: boolean; onEditing: (v: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const shield = useNativeStop<HTMLDivElement>();
  const answer = item.answer ?? "";

  const open = () => {
    setDraft(answer);
    setEditing(true);
    onEditing(true);
  };
  const close = (save: boolean) => {
    if (save && draft.trim() !== answer.trim()) setAnswer(item.id, draft.trim());
    setEditing(false);
    onEditing(false);
  };

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
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  // In selection mode a tap anywhere on the card selects it, so the answer is just text.
  if (selecting) {
    return answer ? (
      <div className="card-answer" data-testid="card-answer">
        <span className="card-answer-label">A</span>
        <span className="card-answer-text">{answer}</span>
      </div>
    ) : null;
  }

  return (
    <div ref={shield} className="card-answer-wrap" {...isolate}>
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div
            key="edit"
            className="card-answer editing"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            <span className="card-answer-label">A</span>
            <textarea
              ref={focusOnMount}
              rows={1}
              value={draft}
              aria-label="解答"
              placeholder="解答"
              data-testid="card-answer-input"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => {
                // Tapping the save button also blurs; let its click do the saving.
                if ((e.relatedTarget as HTMLElement | null)?.dataset.save) return;
                close(true);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") close(false);
                else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  close(true);
                }
              }}
            />
            <motion.button
              type="button"
              className="face-btn small save"
              aria-label="解答を保存"
              data-save="1"
              data-testid="card-answer-save"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileTap={{ scale: 0.86 }}
              onClick={() => close(true)}
            >
              <IconCheck />
            </motion.button>
          </motion.div>
        ) : answer ? (
          <motion.button
            key="view"
            type="button"
            className="card-answer"
            aria-label="解答を編集"
            data-testid="card-answer"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16 }}
            whileTap={{ scale: 0.98 }}
            onClick={open}
          >
            <span className="card-answer-label">A</span>
            <span className="card-answer-text">{answer}</span>
          </motion.button>
        ) : (
          <motion.button
            key="add"
            type="button"
            className="answer-add"
            data-testid="card-answer-add"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.16 }}
            whileTap={{ scale: 0.94 }}
            onClick={open}
          >
            <IconPlus />
            解答
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
