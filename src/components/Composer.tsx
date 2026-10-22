import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addItem } from "../store";
import { imagesFrom } from "../image";
import { IconImage, IconUp, IconX } from "./Icons";

type Draft = { id: string; file: File; url: string };
const DRAFT_KEY = "mnemo-draft";
const ANSWER_DRAFT_KEY = "mnemo-draft-answer";

const readDraft = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}

export function Composer({ deckId = null }: { deckId?: string | null }) {
  const [text, setText] = useState(() => readDraft(DRAFT_KEY));
  const [answer, setAnswer] = useState(() => readDraft(ANSWER_DRAFT_KEY));
  const [imgs, setImgs] = useState<Draft[]>([]);
  const [answerImgs, setAnswerImgs] = useState<Draft[]>([]);
  const [drag, setDrag] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const answerTa = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const answerFileInput = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => autoGrow(ta.current), [text]);
  useLayoutEffect(() => autoGrow(answerTa.current), [answer]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, text);
      localStorage.setItem(ANSWER_DRAFT_KEY, answer);
    } catch {}
  }, [text, answer]);

  // Focus the moment the app opens.
  useEffect(() => {
    ta.current?.focus({ preventScroll: true });
  }, []);

  /** Images go to the question unless they were pasted or dropped on the answer. */
  const addFiles = (files: File[], side: "question" | "answer" = "question") => {
    if (!files.length) return;
    const drafts = files.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    if (side === "answer") setAnswerImgs((cur) => [...cur, ...drafts].slice(0, 6));
    else setImgs((cur) => [...cur, ...drafts].slice(0, 12));
  };

  // Images pasted anywhere on the page land in the composer.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFrom(e.clipboardData);
      if (!files.length) return;
      const t = e.target as HTMLElement | null;
      const inComposer = t === ta.current || t === answerTa.current;
      if (t && !inComposer && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      // Behind an open sheet or review, the composer isn't what the user is looking at.
      if (document.querySelector(".sheet, .review")) return;
      e.preventDefault();
      addFiles(files, t === answerTa.current ? "answer" : "question");
      if (!inComposer) ta.current?.focus({ preventScroll: true });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const canSend = text.trim().length > 0 || imgs.length > 0;

  const submitOnCmdEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    if (!canSend) return;
    addItem(text.trim(), imgs.map((d) => d.file), deckId, answer.trim(), answerImgs.map((d) => d.file));
    navigator.vibrate?.(8);
    setText("");
    setAnswer("");
    setImgs([]);
    setAnswerImgs([]);
    ta.current?.focus({ preventScroll: true });
  };

  return (
    <motion.form
      className={`composer glass strong${drag ? " drag" : ""}`}
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const onAnswer = !!(e.target as HTMLElement).closest(".composer-answer, .answer-thumbs");
        addFiles(imagesFrom(e.dataTransfer), onAnswer ? "answer" : "question");
      }}
    >
      <textarea
        ref={ta}
        aria-label="問題"
        placeholder="問題"
        rows={2}
        value={text}
        enterKeyHint="enter"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={submitOnCmdEnter}
      />
      <Thumbs list={imgs} onRemove={(id) => setImgs((c) => c.filter((x) => x.id !== id))} />
      <label className="composer-answer">
        <span className="composer-answer-label">A</span>
        <textarea
          ref={answerTa}
          aria-label="解答"
          placeholder="解答"
          data-testid="composer-answer"
          rows={1}
          value={answer}
          enterKeyHint="enter"
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={submitOnCmdEnter}
        />
        <motion.button
          type="button"
          className="icon-btn small"
          aria-label="解答に画像を追加"
          data-testid="composer-answer-image"
          whileTap={{ scale: 0.85 }}
          onClick={(e) => {
            e.preventDefault();
            answerFileInput.current?.click();
          }}
        >
          <IconImage />
        </motion.button>
        <input
          ref={answerFileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []), "answer");
            e.target.value = "";
          }}
        />
      </label>
      <Thumbs list={answerImgs} className="answer-thumbs" testId="composer-answer-thumbs" onRemove={(id) => setAnswerImgs((c) => c.filter((x) => x.id !== id))} />
      <div className="composer-row">
        <motion.button type="button" className="icon-btn" aria-label="画像を追加" whileTap={{ scale: 0.85 }} onClick={() => fileInput.current?.click()}>
          <IconImage />
        </motion.button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="spacer" />
        <motion.button
          type="submit"
          className="send"
          aria-label="保存"
          disabled={!canSend}
          whileTap={{ scale: 0.88 }}
          animate={{ scale: canSend ? 1 : 0.92 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        >
          <IconUp />
        </motion.button>
      </div>
    </motion.form>
  );
}

function Thumbs({ list, onRemove, className = "", testId }: { list: Draft[]; onRemove: (id: string) => void; className?: string; testId?: string }) {
  return (
    <AnimatePresence initial={false}>
      {list.length > 0 && (
        <motion.div
          className={`thumbs ${className}`}
          data-testid={testId}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
        >
          <AnimatePresence initial={false}>
            {list.map((d) => (
              <motion.div
                key={d.id}
                className="thumb"
                layout
                initial={{ opacity: 0, scale: 0.4, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              >
                <img src={d.url} alt="" />
                <button type="button" className="x" aria-label="画像を外す" onClick={() => onRemove(d.id)}>
                  <IconX />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
