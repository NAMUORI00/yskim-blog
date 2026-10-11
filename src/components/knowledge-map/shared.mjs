// Browser-only helpers shared by the knowledge-map components.
import { createInputTracker } from "../../lib/graph/attention.mjs";

let tracker = null;

/** One input-modality tracker per page, shared by the rail and the dialog. */
export function sharedTracker() {
  if (!tracker) tracker = createInputTracker(document);
  return tracker;
}

export function safeStorage() {
  try {
    const storage = window.localStorage;
    const probe = "__km";
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function isFocusVisible(element) {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

export function prefersCoarsePointer() {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

let uid = 0;
export function nextId(prefix) {
  uid += 1;
  return `${prefix}-${uid}`;
}

export const HINT_TEXT =
  "Tab으로 들어가 화살표로 화면에서 가까운 카테고리로 옮깁니다. 가리키거나 초점을 옮기면 미리 보고, Enter나 누르기로 그 카테고리를 주제와 글 층으로 펼칩니다. 끌거나 Shift+화살표로 구를 돌립니다. 펼친 뒤에는 화살표로 옮기고 Enter로 고정하며, Esc는 고정을 풀고 한 번 더 누르면 전체 보기로 돌아갑니다.";

export const EXPLORER_HINT = "끌어서 돌리기, 휠이나 두 손가락으로 확대, Shift를 누르고 끌어서 옮기기";
