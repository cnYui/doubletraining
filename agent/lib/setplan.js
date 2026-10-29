// One-shot "set today's plan" write used by the setplan Page. The host AI
// negotiates the plan in chat and passes the final exercise list once.
// Pure over the `days` map so it runs unchanged in Node tests.
import { diffDays, shortLabel } from './dates.js';
import { FOCUS_IDS, cloneDay, newCardioItem, newStrengthItem, templateDay } from './workout.js';
import {
  cleanName,
  findItemIndex,
  hasLoggedWork,
  normalizeFocus,
  slug,
  stepFor,
  titleCase,
  toInteger,
  toKg,
  toNumber,
  trainingDay
} from './plan.js';

const MAX_EXERCISES = 12;
const DEFAULT_SETS = 3;
const DEFAULT_REPS = 10;
const DEFAULT_REST_SECONDS = 90;
const COMPACT_ROWS = 3;

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

// exercises may arrive as an array, a JSON string, or a lone object.
export function parseExercises(value) {
  let list = value;
  if (typeof list === 'string') list = parseJson(list.trim());
  if (list && !Array.isArray(list) && typeof list === 'object') {
    list = Array.isArray(list.exercises) ? list.exercises : [list];
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const name = titleCase(cleanName(raw.name));
    if (!name) continue;
    const kgValue = raw.kg === undefined || raw.kg === null || raw.kg === '' ? null : toKg(raw.kg);
    out.push({
      name,
      sets: toInteger(raw.sets, 1, 20),
      reps: toInteger(raw.reps, 1, 100),
      kg: kgValue,
      minutes: toInteger(raw.minutes, 1, 600),
      useLastWeight: raw.useLastWeight === true || raw.useLastWeight === 'true'
    });
  }
  return out.slice(0, MAX_EXERCISES);
}

// Most recent weight for an exercise before `key`: the last logged set, else
// the planned weight. Returns null when the exercise never appeared.
export function lastWeight(days, key, name) {
  const keys = Object.keys(days).filter((other) => other !== key && diffDays(other, key) > 0).sort().reverse();
  for (const other of keys) {
    const day = days[other];
    if (!day || day.rest) continue;
    const index = findItemIndex(day, name);
    if (index < 0 || day.items[index].type !== 'strength') continue;
    const item = day.items[index];
    const logged = item.log && item.log.length ? item.log[item.log.length - 1].kg : null;
    const kg = toNumber(logged) !== null ? toNumber(logged) : item.kg;
    if (typeof kg === 'number') return kg;
  }
  return null;
}

// Library default (the example templates), or null.
export function libraryEntry(name) {
  for (const id of FOCUS_IDS) {
    const day = templateDay(id);
    const index = findItemIndex(day, name);
    if (index >= 0) return day.items[index];
  }
  return null;
}

function uniqueId(items, name) {
  const base = slug(name);
  let id = base;
  let counter = 2;
  while (items.some((item) => item.id === id)) {
    id = base + '-' + counter;
    counter += 1;
  }
  return id;
}

// args: { exercises, focus, mode }. Returns { ok, message, days?, key, focus, rows, more }.
export function applySetPlan(days, key, args) {
  const exercises = parseExercises(args && args.exercises);
  if (!exercises.length) return { ok: false, message: 'No exercises received', key };
  const existing = days[key];
  if (hasLoggedWork(existing)) {
    return { ok: false, message: shortLabel(key) + ' already has logged sets; plan not changed', key };
  }
  const append = args && String(args.mode).toLowerCase() === 'append';
  const focusId = normalizeFocus(args && args.focus);
  const base = append || !existing || existing.rest ? trainingDay(days, key) : { focus: existing.focus, rest: false, items: [] };
  let focusLabel = base.focus;
  if (focusId && focusId !== 'rest') focusLabel = templateDay(focusId).focus;
  const items = append ? base.items : [];
  for (const spec of exercises) {
    const known = libraryEntry(spec.name);
    const duplicate = findItemIndex({ items }, spec.name);
    const id = uniqueId(items, spec.name);
    let item;
    if (spec.minutes !== null && spec.sets === null) {
      item = newCardioItem(id, spec.name, spec.minutes);
    } else {
      let kg = spec.kg;
      if (kg === null) {
        const last = lastWeight(days, key, spec.name);
        if (last !== null) kg = last;
        else if (known && known.type === 'strength') kg = known.kg;
      }
      const unknown = kg === null;
      const weight = unknown ? 0 : kg;
      item = newStrengthItem(
        id, spec.name, spec.sets === null ? DEFAULT_SETS : spec.sets,
        spec.reps === null ? DEFAULT_REPS : spec.reps, weight, stepFor(spec.name, weight), DEFAULT_REST_SECONDS
      );
      if (unknown) item.unknownKg = true;
    }
    if (append && duplicate >= 0) items[duplicate] = item;
    else items.push(item);
  }
  const day = { focus: focusLabel, rest: false, items };
  const next = Object.assign({}, days);
  next[key] = cloneDay(day);
  return Object.assign({ ok: true, message: 'Saved', days: next, key }, summarize(day));
}

function kgText(item) {
  if (item.unknownKg) return '?';
  return item.kg > 0 ? String(item.kg) + ' kg' : 'BW';
}

// Display rows for the table; `more` counts rows past the compact limit.
export function summarize(day) {
  const rows = day.items.map((item, index) => ({
    k: index + ':' + item.id,
    name: item.name,
    detail: item.type === 'cardio' ? item.minutes + ' min' : item.sets + 'x' + item.reps,
    kg: item.type === 'cardio' ? '' : kgText(item),
    unknown: Boolean(item.unknownKg)
  }));
  return {
    focus: day.focus,
    rows,
    compactRows: rows.slice(0, COMPACT_ROWS),
    more: Math.max(0, rows.length - COMPACT_ROWS)
  };
}
