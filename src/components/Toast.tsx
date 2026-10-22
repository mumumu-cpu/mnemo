import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../store";

export function Toast() {
  const toast = useStore((s) => s.toast);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          role="status"
          className="toast glass strong"
          initial={{ opacity: 0, y: -24, x: "-50%", scale: 0.8 }}
          animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
          exit={{ opacity: 0, y: -16, x: "-50%", scale: 0.9 }}
          transition={{ type: "spring", stiffness: 520, damping: 30 }}
        >
          {toast.text}
          {toast.action && (
            <button className="toast-action" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
