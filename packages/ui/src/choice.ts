import { useStore, type ChoiceOption } from "./store.js";

// Like `showPrompt`, but for a modal with several labelled buttons. Resolves to the chosen
// option's `value`, or null if dismissed (Esc / overlay click). Rendered by <ChoiceDialogHost/>.
export function showChoice(title: string, message: string, options: ChoiceOption[]): Promise<string | null> {
  return new Promise((resolve) => {
    useStore.getState().requestChoice({ title, message, options }, resolve);
  });
}
