import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useImageSrc } from "../store";

export function ImageViewer({ k, onClose }: { k: string | null; onClose: () => void }) {
  return <AnimatePresence>{k && <View k={k} onClose={onClose} />}</AnimatePresence>;
}

function View({ k, onClose }: { k: string; onClose: () => void }) {
  const src = useImageSrc(k);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <motion.div className="viewer" data-testid="image-viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        drag
        dragSnapToOrigin
        dragElastic={0.6}
        onDragEnd={(_, i) => Math.abs(i.offset.y) > 120 && onClose()}
        style={{ display: "grid", placeItems: "center", maxHeight: "100%", maxWidth: "100%" }}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        {src && <img src={src} alt="" draggable={false} />}
      </motion.div>
    </motion.div>
  );
}
