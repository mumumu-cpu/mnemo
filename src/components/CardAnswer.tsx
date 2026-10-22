import { AnimatePresence, motion } from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { imagesFrom } from "../image";
import { isolate, useNativeStop } from "../isolate";
import { setAnswer } from "../store";
import type { Item } from "../types";
import { DraftThumbs, useDraftImages } from "./DraftImages";
import { IconCheck, IconImage, IconPlus } from "./Icons";
import { Img } from "./Img";

/** The answer, written right on the home card without opening the detail sheet. */
export function CardAnswer({ item, selecting, onEditing }: { item: Item; selecting: boolean; onEditing: (v: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const shield = useNativeStop<HTMLDivElement>();
  const answer = item.answer ?? "";
  const images = item.answerImages ?? [];
  const draftImages = useDraftImages(item.id);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasAnswer = !!answer || images.length > 0;

  const open = () => {
    setDraft(answer);
    draftImages.reset(images);
    setEditing(true);
    onEditing(true);
  };
  const close = (save: boolean) => {
    if (save) {
      if (draftImages.uploading) return; // wait for pasted images to finish uploading
      const keys = draftImages.keys();
      const imagesChanged = keys.length !== images.length || keys.some((k, i) => k !== images[i]);
      if (draft.trim() !== answer.trim() || imagesChanged) setAnswer(item.id, draft.trim(), imagesChanged ? keys : undefined);
    }
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
    return hasAnswer ? (
      <div className="card-answer" data-testid="card-answer">
        <span className="card-answer-label">A</span>
        <AnswerBody text={answer} images={images} />
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
            <div className="card-answer-edit">
            <DraftThumbs draft={draftImages} testId="card-answer-images" />
            <textarea
              ref={focusOnMount}
              rows={1}
              value={draft}
              aria-label="解答"
              placeholder="解答"
              data-testid="card-answer-input"
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                const files = imagesFrom(e.clipboardData);
                if (!files.length) return;
                e.preventDefault();
                e.stopPropagation();
                draftImages.add(files);
              }}
              onBlur={(e) => {
                // Focus moving to this editor's own buttons (save, add or remove image) isn't leaving it.
                if ((e.relatedTarget as HTMLElement | null)?.closest(".card-answer.editing")) return;
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
            </div>
            <div className="card-answer-tools">
            <motion.button
              type="button"
              className="face-btn small glass"
              aria-label="解答に画像を追加"
              data-testid="card-answer-add-image"
              disabled={draftImages.full}
              whileTap={{ scale: 0.86 }}
              onClick={() => fileInput.current?.click()}
            >
              <IconImage />
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
                ta.current?.focus({ preventScroll: true });
              }}
            />
            <motion.button
              type="button"
              className="face-btn small save"
              aria-label="解答を保存"
              disabled={draftImages.uploading}
              data-testid="card-answer-save"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileTap={{ scale: 0.86 }}
              onClick={() => close(true)}
            >
              {draftImages.uploading ? <span className="spinner" /> : <IconCheck />}
            </motion.button>
            </div>
          </motion.div>
        ) : hasAnswer ? (
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
            <AnswerBody text={answer} images={images} />
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

function AnswerBody({ text, images }: { text: string; images: string[] }) {
  return (
    <span className="card-answer-body">
      {images.length > 0 && (
        <span className="card-answer-imgs" data-testid="card-answer-imgs">
          {images.slice(0, 4).map((k) => (
            <span key={k} className="im">
              <Img k={k} />
            </span>
          ))}
          {images.length > 4 && <span className="more">+{images.length - 4}</span>}
        </span>
      )}
      {text && <span className="card-answer-text">{text}</span>}
    </span>
  );
}
