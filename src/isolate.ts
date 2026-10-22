import { useCallback, useRef, type SyntheticEvent } from "react";

export const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Motion listens for tap/drag with native listeners on draggable cards, which fire
 * before React's delegated handlers, so React's stopPropagation alone is too late.
 * Stop the press natively too, so controls inside the card never flip or drag it.
 */
export function useNativeStop<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);
  // A callback ref, so listeners attach even when the element mounts late (after an exit animation).
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const types = ["pointerdown", "mousedown", "touchstart"] as const;
    const halt = (e: Event) => e.stopPropagation();
    types.forEach((t) => el.addEventListener(t, halt));
    cleanup.current = () => types.forEach((t) => el.removeEventListener(t, halt));
  }, []);
}

export const isolate = {
  onPointerDown: stop,
  onPointerUp: stop,
  onMouseDown: stop,
  onTouchStart: stop,
  onClick: stop,
  onDoubleClick: stop,
  onKeyDown: stop,
  onKeyUp: stop,
};
