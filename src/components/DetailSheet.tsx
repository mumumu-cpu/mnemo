import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { imagesFrom } from "../image";
import { addImages, moveItems, removeItem, runAI, setAnswer, setBody, setMarked, setStatus, useStore } from "../store";
import { STATUS, type Status } from "../types";
import { burst } from "./Burst";
import { DeckPicker } from "./DeckSheets";
import { IconFlag, IconFolder, IconImage, IconList, IconTrash } from "./Icons";
import { Img } from "./Img";
import { QAField } from "./QAField";

const sameKeys = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

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
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const controls = useDragControls();
  const saved = useRef(item?.body ?? "");
  const [uploading, setUploading] = useState(0);
  const [picking, setPicking] = useState(false);
  const deckName = useStore((s) => s.decks.find((d) => d.id === live?.deckId)?.name);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const attach = async (files: File[]) => {
    const room = 12 - item.images.length - uploading;
    const picked = files.slice(0, Math.max(0, room));
    if (!picked.length) return;
    setUploading((n) => n + picked.length);
    await addImages(id, picked);
    setUploading((n) => n - picked.length);
  };

  // The memo above is the card's question; only the answer lives here.
  const answerImages = item.answerImages ?? [];

  const summarize = async () => {
    setBusy(true);
    const res = await runAI(id, "summary");
    setBusy(false);
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
          <h4 className="first">Q</h4>
          <textarea
            aria-label="メモ本文"
            placeholder="問題"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const files = imagesFrom(e.clipboardData);
              if (!files.length) return;
              e.preventDefault();
              attach(files);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const files = imagesFrom(e.dataTransfer);
              if (!files.length) return;
              e.preventDefault();
              attach(files);
            }}
            rows={4}
          />

          <h4>画像</h4>
          <div className="gallery" data-testid="sheet-gallery">
            <AnimatePresence initial={false}>
              {item.images.map((k) => (
                <motion.button
                  key={k}
                  className="im"
                  aria-label="画像を拡大"
                  style={{ position: "relative" }}
                  onClick={() => onView(k)}
                  whileTap={{ scale: 0.95 }}
                  layout
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <Img k={k} />
                </motion.button>
              ))}
              {Array.from({ length: uploading }, (_, i) => (
                <motion.div key={`up-${i}`} className="im skel" style={{ padding: 0, position: "relative" }} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <b style={{ position: "absolute", inset: 0, height: "100%", borderRadius: 0 }} />
                </motion.div>
              ))}
            </AnimatePresence>
            {item.images.length + uploading < 12 && (
              <motion.button className="im add-tile" aria-label="画像を追加" data-testid="sheet-add-image" whileTap={{ scale: 0.92 }} onClick={() => fileInput.current?.click()}>
                <IconImage />
              </motion.button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                attach(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>

          <h4>A</h4>
          <QAField
            itemId={id}
            label="A"
            testId="qa-answer"
            value={item.answer ?? ""}
            images={answerImages}
            placeholder="回答を入力"
            onSave={(a, imgs) => setAnswer(id, a, sameKeys(imgs, answerImages) ? undefined : imgs)}
          />

          <h4>ファイル</h4>
          <motion.button className="deck-row in-sheet" data-testid="sheet-deck" whileTap={{ scale: 0.97 }} onClick={() => setPicking(true)}>
            <IconFolder />
            <span className="deck-row-name">{deckName ?? "なし"}</span>
          </motion.button>

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
          <motion.button
            className={`mark-toggle${item.marked ? " on" : ""}`}
            aria-pressed={!!item.marked}
            data-testid="sheet-mark"
            whileTap={{ scale: 0.96 }}
            onClick={() => setMarked(id, !item.marked)}
          >
            <motion.span key={String(!!item.marked)} style={{ display: "grid" }} initial={{ scale: 0.4, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 600, damping: 18 }}>
              <IconFlag />
            </motion.span>
            {item.marked ? "印あり" : "印をつける"}
          </motion.button>

          <h4>AI</h4>
          <motion.button className={`ai-btn wide${busy ? " busy" : ""}`} data-testid="ai-summary-btn" disabled={busy} whileTap={{ scale: 0.97 }} onClick={summarize}>
            {busy ? <span className="spinner" /> : <IconList />} 要点
          </motion.button>
          <AnimatePresence mode="popLayout">
            {busy && (
              <motion.div key="ai-skel" className="skel" style={{ padding: "14px 4px 0" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <b style={{ width: "70%" }} />
                <b style={{ width: "92%" }} />
                <b style={{ width: "55%" }} />
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
      <DeckPicker
        open={picking}
        title="ファイルへ移動"
        current={item.deckId ?? null}
        onClose={() => setPicking(false)}
        onPick={(target) => {
          moveItems([id], target);
          setPicking(false);
        }}
      />
    </>
  );
}
