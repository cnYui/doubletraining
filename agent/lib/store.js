// Persistence over any Web Storage-shaped object (localStorage in the Page,
// an in-memory fake in tests). Failures degrade to an unsaved session.
import { isKey } from './dates.js';
import { sanitizeDays, seedDays } from './workout.js';

export const STORAGE_KEY = 'doubletraining.days';
// 2: reseed data written by the Date-object build, whose keys drifted in Studio.
// 3: reseed the example plan with English exercise names and labels.
export const SEED_VERSION = 3;

function readRaw(storage) {
  if (!storage) return null;
  try {
    return storage.getItem(STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

export function saveDays(storage, days) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ seedVersion: SEED_VERSION, days }));
    return true;
  } catch (error) {
    return false;
  }
}

// The day the plan editor worked on last, so "add squat" without a date goes
// to the same day as the previous command.
export const LAST_EDITED_KEY = 'doubletraining.lastEdited';

export function loadLastEdited(storage) {
  if (!storage) return null;
  try {
    const value = storage.getItem(LAST_EDITED_KEY);
    return isKey(value) ? value : null;
  } catch (error) {
    return null;
  }
}

export function saveLastEdited(storage, key) {
  if (!storage || !isKey(key)) return false;
  try {
    storage.setItem(LAST_EDITED_KEY, key);
    return true;
  } catch (error) {
    return false;
  }
}

// Returns { days, persisted, seeded }. Missing, corrupt, or outdated data is
// replaced by the example plan so the Page always has something to show.
export function loadDays(storage, todayKey) {
  const raw = readRaw(storage);
  if (typeof raw === 'string' && raw) {
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      parsed = null;
    }
    if (
      parsed && parsed.seedVersion === SEED_VERSION && parsed.days &&
      typeof parsed.days === 'object' && !Array.isArray(parsed.days)
    ) {
      return { days: sanitizeDays(parsed.days), persisted: true, seeded: false };
    }
  }
  const days = seedDays(todayKey);
  return { days, persisted: saveDays(storage, days), seeded: true };
}
