// Tiny app-wide signal so that, after any mutation, the notifications center and
// whatever page is open both refetch and stay in sync.
const EVENT = "rivo:data-changed";

export function emitDataChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function onDataChanged(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
