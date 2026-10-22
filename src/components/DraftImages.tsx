import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { stageImages } from "../store";
import { IconX } from "./Icons";
import { Img } from "./Img";

export const MAX_FACE_IMAGES = 6;

type DraftImage = { id: string; key?: string; url?: string };

/** Images being edited for a question/answer: existing keys plus pasted files that upload in the background. */
export function useDraftImages(itemId: string, max = MAX_FACE_IMAGES) {
  const [list, setList] = useState<DraftImage[]>([]);

  const reset = useCallback((keys: string[]) => setList(keys.map((key) => ({ id: key, key }))), []);

  const add = (files: File[]) => {
    const room = max - list.length;
    if (!files.length || room <= 0) return;
    files.slice(0, room).forEach((file) => {
      const id = crypto.randomUUID();
      setList((cur) => [...cur, { id, url: URL.createObjectURL(file) }]);
      stageImages(itemId, [file]).then((keys) =>
        setList((cur) => (keys?.[0] ? cur.map((d) => (d.id === id ? { ...d, key: keys[0] } : d)) : cur.filter((d) => d.id !== id))),
      );
    });
  };

  const remove = (id: string) => setList((cur) => cur.filter((d) => d.id !== id));

  return {
    list,
    reset,
    add,
    remove,
    full: list.length >= max,
    uploading: list.some((d) => !d.key),
    keys: () => list.flatMap((d) => (d.key ? [d.key] : [])),
  };
}

export function DraftThumbs({ draft, testId }: { draft: ReturnType<typeof useDraftImages>; testId?: string }) {
  return (
    <AnimatePresence initial={false}>
      {draft.list.length > 0 && (
        <motion.div className="edit-thumbs" data-testid={testId} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
          <AnimatePresence initial={false}>
            {draft.list.map((d) => (
              <motion.div
                key={d.id}
                className="thumb"
                layout
                initial={{ opacity: 0, scale: 0.4, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              >
                {d.url ? <img src={d.url} alt="" /> : <Img k={d.key!} />}
                {!d.key && (
                  <span className="thumb-busy">
                    <span className="spinner" />
                  </span>
                )}
                <button
                  type="button"
                  className="x"
                  aria-label="画像を外す"
                  onClick={(e) => {
                    e.stopPropagation();
                    draft.remove(d.id);
                  }}
                >
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
