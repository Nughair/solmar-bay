// save.js — Solmar Bay keeps its progress in localStorage: cash, the story
// mission the player has reached, where they were standing and their health.
// Nothing leaves the browser.

const SAVE_KEY = 'solmar-bay-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function storeSave(state) {
  try {
    const data = {
      cash: Math.round(state.cash),
      missionIndex: state.missionIndex,
      storyDone: !!state.storyDone,
      x: Math.round(state.x * 10) / 10,
      z: Math.round(state.z * 10) / 10,
      health: Math.round(state.health),
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    /* storage full or blocked: the game simply plays on unsaved */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    /* nothing to clear */
  }
}

export function hasSave() {
  return loadSave() !== null;
}
