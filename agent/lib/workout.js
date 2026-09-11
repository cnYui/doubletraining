// Training-day model. Every function is pure over plain JSON objects so the
// same code runs in the Page and in Node tests.
import { addDays, dayStartMs, isKey, weekKeys } from './dates.js';

export const DEFAULT_REST_SECONDS = 90;
const DEFAULT_STEP_KG = 2.5;
const MAX_NAME_LENGTH = 24;

function strength(id, name, sets, reps, kg, step, restSec) {
  return { id, name, type: 'strength', sets, reps, kg, step, restSec, log: [] };
}

function cardio(id, name, minutes) {
  return { id, name, type: 'cardio', minutes, doneAt: null };
}

const TEMPLATES = {
  chest: () => ({
    focus: 'Chest',
    rest: false,
    items: [
      strength('bench', 'Bench Press', 5, 8, 80, 2.5, 120),
      strength('incline-db', 'Incline DB Press', 4, 10, 26, 2, 90),
      strength('pec-deck', 'Pec Deck', 3, 12, 45, 5, 60),
      strength('cable-low', 'Cable Crossover', 3, 12, 20, 2.5, 60),
      cardio('swim', 'Swim', 30)
    ]
  }),
  back: () => ({
    focus: 'Back',
    rest: false,
    items: [
      strength('pull-up', 'Pull-up', 4, 8, 0, 2.5, 120),
      strength('barbell-row', 'Barbell Row', 4, 8, 60, 2.5, 120),
      strength('lat-pulldown', 'Lat Pulldown', 3, 12, 50, 5, 90),
      strength('seated-row', 'Seated Row', 3, 12, 45, 5, 90)
    ]
  }),
  legs: () => ({
    focus: 'Legs',
    rest: false,
    items: [
      strength('squat', 'Squat', 5, 5, 100, 2.5, 150),
      strength('rdl', 'Romanian DL', 4, 8, 80, 2.5, 120),
      strength('leg-press', 'Leg Press', 3, 12, 160, 10, 90),
      strength('leg-curl', 'Leg Curl', 3, 12, 35, 5, 60),
      cardio('bike', 'Bike', 20)
    ]
  }),
  shoulders: () => ({
    focus: 'Shoulders',
    rest: false,
    items: [
      strength('ohp', 'Overhead Press', 4, 8, 40, 2.5, 120),
      strength('lateral-raise', 'Lateral Raise', 4, 15, 8, 1, 60),
      strength('face-pull', 'Face Pull', 3, 15, 20, 2.5, 60),
      strength('reverse-fly', 'Reverse Fly', 3, 15, 6, 1, 60)
    ]
  }),
  rest: () => ({ focus: 'Rest', rest: true, items: [] })
};

export const FOCUS_IDS = Object.keys(TEMPLATES);

// Fresh copy of a template day, or null for an unknown focus id.
export function templateDay(focusId) {
  const build = Object.prototype.hasOwnProperty.call(TEMPLATES, focusId) ? TEMPLATES[focusId] : null;
  return build ? build() : null;
}

export function newStrengthItem(id, name, sets, reps, kg, step, restSec) {
  return strength(id, name, sets, reps, kg, step, restSec);
}

export function newCardioItem(id, name, minutes) {
  return cardio(id, name, minutes);
}

// [offset from today, template, completion, weight overrides]
const SEED_SCHEDULE = [
  [-7, 'chest', 'done', { bench: 77.5, 'pec-deck': 40 }],
  [-6, 'back', 'done'],
  [-5, 'rest'],
  [-4, 'legs', 'done'],
  [-3, 'shoulders', 'done'],
  [-2, 'rest'],
  [-1, 'back', 'partial'],
  [0, 'chest'],
  [1, 'legs'],
  [2, 'rest'],
  [3, 'shoulders'],
  [4, 'back'],
  [5, 'rest']
];

function fillItem(item, startMs) {
  let at = startMs;
  if (item.type === 'cardio') {
    item.doneAt = at + item.minutes * 60000;
    return item.doneAt;
  }
  for (let index = item.log.length; index < item.sets; index += 1) {
    at += 3 * 60000;
    item.log.push({ reps: item.reps, kg: item.kg, at });
  }
  return at;
}

// Example plans relative to today: past days carry logged sets so the
// calendar, week counter, and "vs last time" comparison have data at once.
export function seedDays(todayKey) {
  const days = {};
  for (const [offset, template, completion, overrides] of SEED_SCHEDULE) {
    const key = addDays(todayKey, offset);
    const day = TEMPLATES[template]();
    if (overrides) {
      for (const item of day.items) {
        if (Object.prototype.hasOwnProperty.call(overrides, item.id)) {
          item.kg = overrides[item.id];
        }
      }
    }
    if (completion) {
      let at = dayStartMs(key) + 18 * 3600000;
      const last = day.items.length - 1;
      day.items.forEach((item, index) => {
        if (completion === 'partial' && index === last) {
          at += 3 * 60000;
          item.log.push({ reps: item.reps, kg: item.kg, at });
          return;
        }
        at = fillItem(item, at);
      });
    }
    days[key] = day;
  }
  return days;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntegerIn(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, MAX_NAME_LENGTH).join('');
}

function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '';
  const name = cleanName(raw.name);
  if (!id || !name) return null;
  if (raw.type === 'cardio') {
    if (!isIntegerIn(raw.minutes, 1, 600)) return null;
    return {
      id,
      name,
      type: 'cardio',
      minutes: raw.minutes,
      doneAt: isFiniteNumber(raw.doneAt) ? raw.doneAt : null
    };
  }
  if (raw.type !== 'strength') return null;
  if (!isIntegerIn(raw.sets, 1, 20) || !isIntegerIn(raw.reps, 1, 100)) return null;
  if (!isFiniteNumber(raw.kg) || raw.kg < 0 || raw.kg > 1000) return null;
  const step = isFiniteNumber(raw.step) && raw.step > 0 && raw.step <= 50 ?
    raw.step : DEFAULT_STEP_KG;
  const restSec = isIntegerIn(raw.restSec, 10, 600) ?
    raw.restSec : DEFAULT_REST_SECONDS;
  const log = Array.isArray(raw.log) ? raw.log.filter((entry) =>
    entry && isIntegerIn(entry.reps, 0, 100) && isFiniteNumber(entry.kg) &&
    entry.kg >= 0 && isFiniteNumber(entry.at)
  ).slice(0, raw.sets).map((entry) => ({
    reps: entry.reps,
    kg: entry.kg,
    at: entry.at
  })) : [];
  return { id, name, type: 'strength', sets: raw.sets, reps: raw.reps, kg: raw.kg, step, restSec, log };
}

export function sanitizeDay(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rest = raw.rest === true;
  const focus = cleanName(raw.focus) || (rest ? 'Rest' : 'Training');
  const seen = new Set();
  const items = [];
  if (!rest && Array.isArray(raw.items)) {
    for (const candidate of raw.items) {
      const item = sanitizeItem(candidate);
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }
  return { focus, rest, items };
}

export function sanitizeDays(raw) {
  const days = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return days;
  for (const key of Object.keys(raw)) {
    if (!isKey(key)) continue;
    const day = sanitizeDay(raw[key]);
    if (day) days[key] = day;
  }
  return days;
}

export function cloneDay(day) {
  return JSON.parse(JSON.stringify(day));
}

export function itemTotal(item) {
  return item.type === 'strength' ? item.sets : 1;
}

export function itemDone(item) {
  if (item.type === 'strength') return Math.min(item.log.length, item.sets);
  return item.doneAt === null ? 0 : 1;
}

export function isItemComplete(item) {
  return itemDone(item) >= itemTotal(item);
}

export function dayTotals(day) {
  const totals = { sets: 0, doneSets: 0, cardio: 0, doneCardio: 0 };
  if (!day) return totals;
  for (const item of day.items) {
    if (item.type === 'strength') {
      totals.sets += item.sets;
      totals.doneSets += itemDone(item);
    } else {
      totals.cardio += 1;
      totals.doneCardio += itemDone(item);
    }
  }
  return totals;
}

export function progressRatio(day) {
  const totals = dayTotals(day);
  const units = totals.sets + totals.cardio;
  return units === 0 ? 0 : (totals.doneSets + totals.doneCardio) / units;
}

export function dayStatus(day) {
  if (!day) return 'none';
  if (day.rest) return 'rest';
  if (day.items.length === 0) return 'none';
  const totals = dayTotals(day);
  const done = totals.doneSets + totals.doneCardio;
  if (done === 0) return 'planned';
  return done >= totals.sets + totals.cardio ? 'done' : 'partial';
}

export function isDayComplete(day) {
  return dayStatus(day) === 'done';
}

export function firstOpenIndex(day) {
  if (!day) return -1;
  return day.items.findIndex((item) => !isItemComplete(item));
}

// First incomplete item after `fromIndex`, wrapping to earlier items.
export function nextOpenIndex(day, fromIndex) {
  const count = day.items.length;
  for (let step = 1; step <= count; step += 1) {
    const index = (fromIndex + step) % count;
    if (!isItemComplete(day.items[index])) return index;
  }
  return -1;
}

export function logSet(day, index, atMs) {
  const item = day && day.items[index];
  if (!item || item.type !== 'strength' || item.log.length >= item.sets) {
    return null;
  }
  const next = cloneDay(day);
  const target = next.items[index];
  const entry = { reps: target.reps, kg: target.kg, at: atMs };
  target.log.push(entry);
  return {
    day: next,
    set: {
      itemIndex: index,
      name: target.name,
      number: target.log.length,
      kg: entry.kg,
      reps: entry.reps
    }
  };
}

export function undoLastSet(day, index) {
  const item = day && day.items[index];
  if (!item || item.type !== 'strength' || item.log.length === 0) return null;
  const next = cloneDay(day);
  next.items[index].log.pop();
  return next;
}

export function markCardioDone(day, index, atMs) {
  const item = day && day.items[index];
  if (!item || item.type !== 'cardio' || item.doneAt !== null) return null;
  const next = cloneDay(day);
  next.items[index].doneAt = atMs;
  return next;
}

function roundKg(value) {
  return Math.round(value * 100) / 100;
}

// Moves the working weight used by the next sets. Returns null at the floor.
export function adjustKg(day, index, direction) {
  const item = day && day.items[index];
  if (!item || item.type !== 'strength') return null;
  const nextKg = Math.max(0, roundKg(item.kg + direction * item.step));
  if (nextKg === item.kg) return null;
  const next = cloneDay(day);
  next.items[index].kg = nextKg;
  return next;
}

export function restSecondsFor(item) {
  return item && item.type === 'strength' ? item.restSec : DEFAULT_REST_SECONDS;
}

export function tonnage(day) {
  let total = 0;
  for (const item of day.items) {
    if (item.type !== 'strength') continue;
    for (const entry of item.log) total += entry.kg * entry.reps;
  }
  return roundKg(total);
}

export function cardioMinutes(day) {
  return day.items.reduce((sum, item) =>
    sum + (item.type === 'cardio' && item.doneAt !== null ? item.minutes : 0), 0);
}

export function durationMinutes(day) {
  const stamps = [];
  for (const item of day.items) {
    if (item.type === 'strength') {
      for (const entry of item.log) stamps.push(entry.at);
    }
  }
  if (stamps.length === 0) return 0;
  return Math.max(1, Math.round((Math.max(...stamps) - Math.min(...stamps)) / 60000));
}

function workingKg(item) {
  if (item.log.length === 0) return item.kg;
  return Math.max(...item.log.map((entry) => entry.kg));
}

function hasLoggedSets(day) {
  return day.items.some((item) => item.type === 'strength' && item.log.length > 0);
}

// Most recent earlier day with the same focus and at least one logged set.
export function previousSameFocusKey(days, key) {
  const day = days[key];
  if (!day || day.rest) return null;
  const earlier = Object.keys(days).filter((candidate) =>
    candidate < key && days[candidate].focus === day.focus &&
    !days[candidate].rest && hasLoggedSets(days[candidate])
  ).sort();
  return earlier.length ? earlier[earlier.length - 1] : null;
}

export function kgDeltas(day, previousDay) {
  const deltas = [];
  if (!day || !previousDay) return deltas;
  for (const item of day.items) {
    if (item.type !== 'strength') continue;
    const before = previousDay.items.find((candidate) =>
      candidate.id === item.id && candidate.type === 'strength');
    if (!before) continue;
    deltas.push({ name: item.name, delta: roundKg(workingKg(item) - workingKg(before)) });
  }
  return deltas;
}

// "BW" = bodyweight.
export function formatKg(kg) {
  return kg > 0 ? String(roundKg(kg)) : 'BW';
}

export function formatKgWithUnit(kg) {
  return kg > 0 ? formatKg(kg) + ' kg' : 'BW';
}

export function formatDelta(delta) {
  if (delta === 0) return 'same';
  return (delta > 0 ? '+' : '-') + formatKg(Math.abs(delta)) + ' kg';
}

export function formatThousands(value) {
  const digits = String(Math.round(Math.abs(value)));
  let out = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ',';
    out += digits[index];
  }
  return value < 0 ? '-' + out : out;
}

export function formatClock(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' +
    String(seconds % 60).padStart(2, '0');
}

export function prescription(item) {
  if (item.type === 'cardio') return item.minutes + ' min';
  return item.sets + ' × ' + item.reps + ' · ' + formatKgWithUnit(item.kg);
}

export function plural(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

export function daySummaryLabel(day) {
  const status = dayStatus(day);
  if (status === 'none') return 'Not planned';
  if (status === 'rest') return 'Rest day';
  if (status === 'done') return 'Done';
  const totals = dayTotals(day);
  if (status === 'partial') return totals.doneSets + ' / ' + plural(totals.sets, 'set');
  return plural(day.items.length, 'exercise') + ' · ' + plural(totals.sets, 'set');
}

export function focusChip(day) {
  if (!day || (!day.rest && day.items.length === 0)) return '—';
  return day.rest ? 'Rest' : day.focus;
}

export function weekProgress(days, key) {
  let planned = 0;
  let done = 0;
  for (const weekKey of weekKeys(key)) {
    const status = dayStatus(days[weekKey]);
    if (status === 'none' || status === 'rest') continue;
    planned += 1;
    if (status === 'done') done += 1;
  }
  return { planned, done };
}
