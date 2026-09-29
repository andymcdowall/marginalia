// core has no "dom" or "node" lib (SPEC.md §2.2: no window/document, no node:*), but both
// runtimes provide a real global `crypto.getRandomValues` — declare just enough of it.
declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};
