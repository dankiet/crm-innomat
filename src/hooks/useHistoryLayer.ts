import { useEffect, useRef } from "react";
import { pushHistoryLayer } from "@/lib/history-layer";

/**
 * While `active` is true, push a history entry so Android / browser Back
 * invokes `onClose` instead of navigating away from the page.
 *
 * Use for controlled overlays (dialogs, drawers, side panels).
 * Skip when the overlay already owns URL/history (e.g. Thư viện `?c` / `?v`).
 */
export function useHistoryLayer(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    return pushHistoryLayer(() => {
      onCloseRef.current();
    });
  }, [active]);
}
