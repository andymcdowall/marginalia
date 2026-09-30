// Lets non-editor code (saving/switching ideas) ask the mounted editor to write its pending
// changes to disk first, without importing the EditorPane component.
export const editorBridge: { flush: (() => Promise<void>) | null } = { flush: null };
