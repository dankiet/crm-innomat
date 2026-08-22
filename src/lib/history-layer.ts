/**
 * Stack-based browser history layers for overlays (dialogs, drawers).
 * Android / browser Back closes the topmost layer instead of leaving the page.
 *
 * TanStack Router monkey-patches `window.history.pushState` and notifies on
 * every call. A bare push while opening a dialog was treated as a real
 * navigation and remounted the page — wiping React state so mobile taps on
 * products appeared to do nothing.
 *
 * We therefore:
 * 1. Call the **native** `History.prototype.pushState` (not the patched
 *    instance method) so the router is not notified on open.
 * 2. Merge previous `history.state` and bump `__TSR_index` so when the user
 *    later presses Back, TanStack's popstate handler still sees a sane delta.
 */

type HistoryLayer = {
  id: string;
  close: () => void;
};

const layers: HistoryLayer[] = [];
let listening = false;
/** popstate events to ignore after programmatic history.back */
let skipPop = 0;

const TSR_INDEX = "__TSR_index";
const TSR_KEY = "__TSR_key";

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

function randomKey(): string {
  return (Math.random() + 1).toString(36).substring(7);
}

function stateLayerId(state: unknown): string | undefined {
  if (state == null || typeof state !== "object") return undefined;
  const id = (state as { __crmHistoryLayer?: unknown }).__crmHistoryLayer;
  return typeof id === "string" ? id : undefined;
}

function readTsrIndex(state: unknown): number {
  if (state == null || typeof state !== "object") return 0;
  const n = (state as Record<string, unknown>)[TSR_INDEX];
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Native pushState — bypasses TanStack Router's instance monkey-patch. */
function nativePushState(state: object, url?: string | null) {
  History.prototype.pushState.call(window.history, state, "", url ?? null);
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

  // URL at open time. If it changed by dispose time a client navigation
  // consumed/replaced entries — rewinding then would undo the navigation
  // (mobile drawer tap: menu closed but route never changed).
  const hrefAtOpen = window.location.href;

  const prev = window.history.state;
  const prevObj =
    prev != null && typeof prev === "object"
      ? (prev as Record<string, unknown>)
      : {};
  const key = randomKey();

  // Same URL, new state entry. Native push avoids router remount; TSR fields
  // keep Back delta math correct if the router still observes popstate.
  nativePushState({
    ...prevObj,
    __crmHistoryLayer: id,
    [TSR_INDEX]: readTsrIndex(prev) + 1,
    [TSR_KEY]: key,
    key,
  });

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

    // Only rewind when we are still the active history entry (topmost layer,
    // no client navigation replaced state, same URL as when opened). Buried
    // layers only drop tracking so a still-open child keeps its Back handler.
    if (isTop && window.location.href === hrefAtOpen && stateLayerId(window.history.state) === id) {
      skipPop += 1;
      window.history.back();
    }
    // Else: navigation happened while the layer was open — leave the stale
    // entry in place (Back from the new page lands on the previous page URL,
    // which reads as normal Back). Never rewind across a navigation.
  };
}
