import { STORAGE_KEY, defaultState } from './program.js';

export function loadProgramState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

export function saveProgramState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
