import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addItem } from "../store";
import { imagesFrom } from "../image";
import { IconImage, IconUp, IconX } from "./Icons";

type Draft = { id: string; file: File; url: string };
const DRAFT_KEY = "mnemo-draft";

export function Composer() {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [imgs, setImgs] = useState<Draft[]>([]);
  const [drag, setDrag] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const el = ta.current!;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, text);
    } catch {}
  }, [text]);

  // Focus the moment the app opens.
  useEffect(() => {
    ta.current?.focus({ preventScroll: true });
  }, []);

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    setImgs((cur) => [...cur, ...files.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))].slice(0, 12));
  };

  // Images pasted anywhere on the page land in the composer.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFrom(e.clipboardData);
      if (!files.length) return;
      const t = e.target as HTMLElement | null;
      if (t && t !== ta.current && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      e.preventDefault();
      addFiles(files);
      ta.current?.focus({ preventScroll: true });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const canSend = text.trim().length > 0 || imgs.length > 0;

  const submit = () => {
    if (!canSend) return;
    addItem(text.trim(), imgs.map((d) => d.file));
    navigator.vibrate?.(8);
    setText("");
    setImgs([]);
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
        addFiles(imagesFrom(e.dataTransfer));
      }}
    >
      <textarea
        ref={ta}
        aria-label="メモ"
        placeholder="メモ"
        rows={2}
        value={text}
        enterKeyHint="enter"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <AnimatePresence initial={false}>
        {imgs.length > 0 && (
          <motion.div className="thumbs" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <AnimatePresence initial={false}>
              {imgs.map((d) => (
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
                  <button type="button" className="x" aria-label="画像を外す" onClick={() => setImgs((c) => c.filter((x) => x.id !== d.id))}>
                    <IconX />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
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
