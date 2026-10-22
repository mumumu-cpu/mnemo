import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { removeItem, runAI, setBody, setStatus, useStore } from "../store";
import { STATUS, type Status } from "../types";
import { burst } from "./Burst";
import { IconList, IconSpark, IconTrash } from "./Icons";
import { Img } from "./Img";

export function DetailSheet({ id, onClose, onView }: { id: string | null; onClose: () => void; onView: (k: string) => void }) {
  return (
    <AnimatePresence>
      {id && <Sheet key={id} id={id} onClose={onClose} onView={onView} />}
    </AnimatePresence>
  );
}

function Sheet({ id, onClose, onView }: { id: string; onClose: () => void; onView: (k: string) => void }) {
  const live = useStore((s) => s.items.find((i) => i.id === id));
  // Keep rendering the last known item while the sheet animates out after a delete.
  const last = useRef(live);
  if (live) last.current = live;
  const item = live ?? last.current;
  const [text, setText] = useState(item?.body ?? "");
  const [busy, setBusy] = useState<null | "quiz" | "summary">(null);
  const [summary, setSummary] = useState<string | null>(null);
  const controls = useDragControls();
  const saved = useRef(item?.body ?? "");

  // Debounced autosave; no save button needed.
  useEffect(() => {
    if (text === saved.current) return;
    const t = setTimeout(() => {
      saved.current = text;
      setBody(id, text);
    }, 500);
    return () => clearTimeout(t);
  }, [text, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!live) onClose();
  }, [live, onClose]);
  if (!item) return null;

  const close = () => {
    if (text !== saved.current) setBody(id, text);
    onClose();
  };

  const ai = async (mode: "quiz" | "summary") => {
    setBusy(mode);
    const res = await runAI(id, mode);
    setBusy(null);
    if (res?.summary) setSummary(res.summary);
  };

  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <motion.div
        className="sheet glass strong"
        role="dialog"
        aria-label="メモの詳細"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.05, bottom: 0.8 }}
        onDragEnd={(_, i) => (i.offset.y > 120 || i.velocity.y > 600) && close()}
      >
        <div className="grab-zone" onPointerDown={(e) => controls.start(e)}>
          <div className="grab" />
        </div>
        <div className="sheet-scroll">
          <textarea aria-label="メモ本文" value={text} onChange={(e) => setText(e.target.value)} rows={4} />

          {item.images.length > 0 && (
            <>
              <h4>画像</h4>
              <div className="gallery">
                {item.images.map((k) => (
                  <motion.button key={k} className="im" aria-label="画像を拡大" style={{ position: "relative" }} onClick={() => onView(k)} whileTap={{ scale: 0.95 }}>
                    <Img k={k} />
                  </motion.button>
                ))}
              </div>
            </>
          )}

          <h4>ステータス</h4>
          <div className="status-pick">
            {STATUS.map((s, i) => (
              <motion.button
                key={s.label}
                aria-pressed={item.status === i}
                whileTap={{ scale: 0.94 }}
                onClick={(e) => {
                  if (i === 2 && item.status !== 2) burst(e.clientX, e.clientY);
                  setStatus(id, i as Status);
                  navigator.vibrate?.(8);
                }}
              >
                <AnimatePresence initial={false}>
                  {item.status === i && (
                    <motion.span
                      className="fill"
                      style={{ background: s.color }}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ type: "spring", stiffness: 520, damping: 30 }}
                    />
                  )}
                </AnimatePresence>
                <i style={{ background: s.color }} />
                {s.label}
              </motion.button>
            ))}
          </div>

          <h4>AI</h4>
          <div className="ai-row">
            <motion.button className={`ai-btn${busy === "quiz" ? " busy" : ""}`} disabled={!!busy} whileTap={{ scale: 0.96 }} onClick={() => ai("quiz")}>
              {busy === "quiz" ? <span className="spinner" /> : <IconSpark />} 問題を作る
            </motion.button>
            <motion.button className={`ai-btn${busy === "summary" ? " busy" : ""}`} disabled={!!busy} whileTap={{ scale: 0.96 }} onClick={() => ai("summary")}>
              {busy === "summary" ? <span className="spinner" /> : <IconList />} 要点
            </motion.button>
          </div>

          <AnimatePresence mode="popLayout">
            {busy && (
              <motion.div key="ai-skel" className="skel" style={{ padding: "14px 4px 0" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <b style={{ width: "70%" }} />
                <b style={{ width: "92%" }} />
                <b style={{ width: "55%" }} />
              </motion.div>
            )}
            {!busy && item.question && (
              <motion.div key={`qa-${item.question}`} style={{ marginTop: 12 }} initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}>
                <div className="qa-box" data-testid="qa-question">
                  <small>Q</small>
                  {item.question}
                </div>
                <div className="qa-box" data-testid="qa-answer">
                  <small>A</small>
                  {item.answer}
                </div>
              </motion.div>
            )}
            {!busy && summary && (
              <motion.div key="summary" className="qa-box" data-testid="ai-summary" style={{ marginTop: 8 }} initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}>
                {summary}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            className="danger-btn"
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              removeItem(id);
              onClose();
            }}
          >
            <IconTrash style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 6 }} />
            削除
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}
