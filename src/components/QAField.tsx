import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { imagesFrom } from "../image";
import { DraftThumbs, useDraftImages } from "./DraftImages";
import { IconCheck, IconImage, IconPen } from "./Icons";
import { Img } from "./Img";

/** One editable side (Q or A) of an item's card, shown in the detail sheet. */
export function QAField({
  itemId,
  label,
  testId,
  value,
  images,
  required,
  onSave,
}: {
  itemId: string;
  label: "Q" | "A";
  testId: string;
  value: string;
  images: string[];
  required?: boolean;
  onSave: (text: string, images: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [shake, setShake] = useState(0);
  const draftImages = useDraftImages(itemId);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const name = label === "Q" ? "問題" : "回答";

  useEffect(() => {
    if (!editing) return;
    setDraft(value);
    draftImages.reset(images);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const commit = () => {
    if (draftImages.uploading) return;
    const text = draft.trim();
    const keys = draftImages.keys();
    if (required && !text && !keys.length) {
      setShake((n) => n + 1);
      return;
    }
    const changed = text !== value || keys.length !== images.length || keys.some((k, i) => k !== images[i]);
    if (changed) onSave(text, keys);
    setEditing(false);
  };

  return (
    <motion.div
      className={`qa-box qa-field${editing ? " editing" : ""}`}
      data-testid={testId}
      layout
      animate={{ x: shake ? [0, -8, 8, -5, 5, 0] : 0 }}
      transition={{ layout: { type: "spring", stiffness: 500, damping: 38 }, x: { duration: 0.3 } }}
      onDragOver={(e) => editing && e.preventDefault()}
      onDrop={(e) => {
        if (!editing) return;
        e.preventDefault();
        draftImages.add(imagesFrom(e.dataTransfer));
      }}
    >
      <div className="qa-head">
        <small>{label}</small>
        <AnimatePresence mode="popLayout" initial={false}>
          {editing ? (
            <motion.div key="editing" className="qa-tools" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
              <motion.button
                type="button"
                className="face-btn small glass"
                aria-label={`${name}に画像を追加`}
                data-testid={`${testId}-add-image`}
                disabled={draftImages.full}
                whileTap={{ scale: 0.86 }}
                onClick={() => fileInput.current?.click()}
              >
                <IconImage />
              </motion.button>
              <motion.button
                type="button"
                className="face-btn small save"
                aria-label={`${name}を保存`}
                data-testid={`${testId}-save`}
                disabled={draftImages.uploading}
                whileTap={{ scale: 0.86 }}
                onClick={commit}
              >
                {draftImages.uploading ? <span className="spinner" /> : <IconCheck />}
              </motion.button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  draftImages.add(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </motion.div>
          ) : (
            <motion.button
              key="edit"
              type="button"
              className="face-btn small glass"
              aria-label={`${name}を編集`}
              data-testid={`${testId}-edit`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              whileTap={{ scale: 0.86 }}
              onClick={() => setEditing(true)}
            >
              <IconPen />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(6px)" }} transition={{ duration: 0.18 }}>
            <DraftThumbs draft={draftImages} testId={`${testId}-images`} />
            <textarea
              ref={focusOnMount}
              className="qa-input"
              aria-label={name}
              data-testid={`${testId}-input`}
              value={draft}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                e.stopPropagation();
                const files = imagesFrom(e.clipboardData);
                if (!files.length) return;
                e.preventDefault();
                draftImages.add(files);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") setEditing(false);
                else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commit();
                }
              }}
            />
          </motion.div>
        ) : (
          <motion.div key="view" initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(6px)" }} transition={{ duration: 0.18 }}>
            {images.length > 0 && (
              <div className="qa-imgs">
                {images.map((k) => (
                  <div key={k} className="im">
                    <Img k={k} />
                  </div>
                ))}
              </div>
            )}
            <div className="qa-text" data-testid={`${testId}-text`}>
              {value}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
