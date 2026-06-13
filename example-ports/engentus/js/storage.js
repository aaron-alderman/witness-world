/**
 * storage.js — localStorage persistence.
 *
 * Registers a save callback with the store so that every setState
 * schedules an auto-save after 400 ms. loadState() directly initialises
 * the store (bypassing subscribers) so no spurious save is triggered.
 */
import { getState, _initState, DEFAULT_STATE, deepMerge, onSave } from './store.js';

const KEY = 'linersense_mc_v7';

export function saveState() {
  try { localStorage.setItem(KEY, JSON.stringify(getState())); } catch (e) {}
}

export function loadState() {
  try {
    // Try current version first, then migrate from v6
    const raw = localStorage.getItem(KEY) || localStorage.getItem('linersense_mc_v6');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s?.version === 7 || s?.version === 6) {
      const merged = deepMerge(DEFAULT_STATE, s);
      merged.version = 7;
      merged.ui.scrubber.playing = false;  // never restore mid-play — RAF is gone after reload
      // millSim.metrics is always recomputed at runtime, never persisted as stale
      if (merged.millSim) merged.millSim.metrics = null;
      _initState(merged);
    }
  } catch (e) {}
}

// Register the save callback with the store immediately on import.
onSave(saveState);
