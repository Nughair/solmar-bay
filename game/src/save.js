// The save file: cash, story progress and lifetime earnings in localStorage, so a
// returning player picks up Nilo's career where they left it.

const SAVE_KEY = 'solmar-bay-save-v4';

/** A fresh career: forty dollars and Vera's first errand waiting. */
export function freshSave() {
  return { cash: 40, missionIndex: 0, totalEarned: 0, finishedStory: false };
}

/** The stored career, or null when there is none (or it is unreadable). */
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return { ...freshSave(), ...data };
  } catch {
    return null;
  }
}

/** Store the career; failures (private mode, quota) are ignored by design. */
export function storeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // A game that cannot save still plays; it just forgets.
  }
}

/** Wipe the career so New Game really starts over. */
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
