/**
 * Stack-based browser history layers for overlays (dialogs, drawers).
 * Android / browser Back closes the topmost layer instead of leaving the page.
 *
 * Nested layers are supported: each push adds one history entry; Back pops one.
 * Closing via UI (X / onOpenChange(false)) removes the entry with history.back
 * and ignores the matching popstate so onClose is not double-fired.
 *
 * If the user navigates to another route while a layer is open, dispose only
 * drops tracking (no history.go) so the new navigation is not undone.
 */

type HistoryLayer = {
  id: string;
  close: () => void;
};

const layers: HistoryLayer[] = [];
let listening = false;
/** popstate events to ignore after programmatic history.back */
let skipPop = 0;

function ensureListener() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("popstate", () => {
    if (skipPop > 0) {
      skipPop -= 1;
      return;
    }
    const top = layers.pop();
    if (top) top.close();
  });
}

function nextId(): string {
  return `crm-hl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function stateLayerId(state: unknown): string | undefined {
  if (state == null || typeof state !== "object") return undefined;
  const id = (state as { __crmHistoryLayer?: unknown }).__crmHistoryLayer;
  return typeof id === "string" ? id : undefined;
}

/**
 * Push a history entry while an overlay is open.
 * @returns dispose — call when the overlay closes via UI or unmounts
 *          (no-op if already closed by system Back).
 */
export function pushHistoryLayer(close: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  ensureListener();
  const id = nextId();
  layers.push({ id, close });
  window.history.pushState({ __crmHistoryLayer: id }, "");

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const idx = layers.findIndex((layer) => layer.id === id);
    if (idx === -1) {
      // Already removed by popstate (system Back)
      return;
    }

    const isTop = idx === layers.length - 1;
    layers.splice(idx, 1);

    // Only rewind when we are still the active history entry (topmost layer
    // and no client navigation replaced state). Buried layers only drop
    // tracking so a still-open child keeps its Back handler.
    if (isTop && stateLayerId(window.history.state) === id) {
      skipPop += 1;
      window.history.back();
    }
  };
}
