// Plan editing: pure operations over the `days` map plus the voice command
// contract (LLM tool declarations, system prompt, and command application).
// Everything here runs unchanged in Node tests.
import { addDays, isKey, resolveDateInput, shortLabel, weekKeys, weekdayLabel } from './dates.js';
import {
  FOCUS_IDS,
  adjustKg,
  cloneDay,
  formatKgWithUnit,
  itemDone,
  newCardioItem,
  newStrengthItem,
  prescription,
  templateDay
} from './workout.js';

export const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MAX_ITEMS = 12;
const MAX_NAME_LENGTH = 24;

const FOCUS_ALIASES = {
  chest: 'chest', push: 'chest',
  back: 'back', pull: 'back',
  legs: 'legs', leg: 'legs',
  shoulders: 'shoulders', shoulder: 'shoulders', delts: 'shoulders',
  rest: 'rest', off: 'rest', 'rest day': 'rest', 'day off': 'rest', none: 'rest'
};

// Token spellings that mean the same exercise.
const TOKEN_ALIASES = {
  dumbbell: 'db', dumbbells: 'db', dumbell: 'db',
  deadlift: 'dl', deadlifts: 'dl',
  pullup: 'pull up', pullups: 'pull up', chinup: 'pull up',
  ohp: 'overhead press', pushdown: 'pushdown',
  flye: 'fly', flyes: 'fly', flies: 'fly',
  presses: 'press', rows: 'row', squats: 'squat', curls: 'curl', raises: 'raise'
};
const WEAK_TOKENS = new Set(['press', 'row', 'curl', 'raise', 'fly', 'db', 'dl', 'up', 'cable', 'machine', 'seated', 'incline']);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Model output may carry numbers as strings ("82.5"); nothing else is accepted.
export function toNumber(value) {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

function toInteger(value, min, max) {
  const number = toNumber(value);
  if (number === null || !Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

function toKg(value) {
  const number = toNumber(value);
  if (number === null || number < 0 || number > 1000) return null;
  return Math.round(number * 100) / 100;
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, MAX_NAME_LENGTH).join('');
}

function titleCase(name) {
  return name.split(' ').map((word) =>
    /^[a-z]/.test(word) ? word[0].toUpperCase() + word.slice(1) : word).join(' ');
}

function canonical(name) {
  const tokens = String(name || '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim().split(' ')
    .filter(Boolean)
    .map((token) => (Object.prototype.hasOwnProperty.call(TOKEN_ALIASES, token) ? TOKEN_ALIASES[token] : token));
  return tokens.join(' ').split(' ').filter(Boolean);
}

function slug(name) {
  return canonical(name).join('-').replace(/[^a-z0-9-]/g, '') || 'item';
}

export function normalizeFocus(value) {
  const text = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (Object.prototype.hasOwnProperty.call(FOCUS_ALIASES, text)) return FOCUS_ALIASES[text];
  const word = text.replace(/ day$/, '');
  return Object.prototype.hasOwnProperty.call(FOCUS_ALIASES, word) ? FOCUS_ALIASES[word] : null;
}

// Upcoming occurrence of a weekday; today counts as upcoming.
export function weekdayKey(todayKey, weekdayName) {
  const index = WEEKDAY_NAMES.indexOf(String(weekdayName || '').toLowerCase());
  if (index < 0) return null;
  const key = weekKeys(todayKey)[index];
  return key < todayKey ? addDays(key, 7) : key;
}

// today / tomorrow / yesterday / a weekday / YYYY-MM-DD → key, else null.
export function resolveDayRef(ref, todayKey) {
  if (ref === undefined || ref === null || ref === '') return null;
  const text = String(ref).trim().toLowerCase();
  const byWeekday = weekdayKey(todayKey, text);
  if (byWeekday) return byWeekday;
  const input = resolveDateInput(text, todayKey);
  return input.valid ? input.key : null;
}

export function hasLoggedWork(day) {
  if (!day || day.rest) return false;
  return day.items.some((item) => itemDone(item) > 0);
}

// Best row for a spoken exercise name, or -1. Exact canonical match first,
// then prefix/containment, then shared distinctive tokens.
export function findItemIndex(day, name) {
  if (!day || !day.items.length) return -1;
  const wanted = canonical(name);
  if (!wanted.length) return -1;
  const wantedText = wanted.join(' ');
  const rows = day.items.map((item, index) => ({ index, tokens: canonical(item.name) }));
  const exact = rows.find((row) => row.tokens.join(' ') === wantedText);
  if (exact) return exact.index;
  const contained = rows.find((row) => {
    const text = row.tokens.join(' ');
    return text.startsWith(wantedText) || wantedText.startsWith(text) ||
      text.includes(' ' + wantedText) || wantedText.includes(' ' + text);
  });
  if (contained) return contained.index;
  let best = { index: -1, score: 0 };
  for (const row of rows) {
    const score = wanted.filter((token) => !WEAK_TOKENS.has(token) && row.tokens.includes(token)).length;
    if (score > best.score) best = { index: row.index, score };
  }
  return best.index;
}

function withDay(days, key, day) {
  const next = Object.assign({}, days);
  next[key] = day;
  return next;
}

function trainingDay(days, key) {
  const day = days[key];
  if (day && !day.rest) return cloneDay(day);
  return { focus: 'Training', rest: false, items: [] };
}

function uniqueId(day, name) {
  const base = slug(name);
  let id = base;
  let counter = 2;
  while (day.items.some((item) => item.id === id)) {
    id = base + '-' + counter;
    counter += 1;
  }
  return id;
}

function stepFor(name, kg) {
  const tokens = canonical(name);
  if (tokens.includes('db')) return 2;
  if (kg > 0 && kg < 15) return 1;
  return 2.5;
}

export function assignFocus(days, key, focusValue) {
  const focusId = normalizeFocus(focusValue);
  if (!focusId) return { ok: false, message: 'Unknown focus; say chest, back, legs, shoulders, or rest' };
  if (hasLoggedWork(days[key])) {
    return { ok: false, message: shortLabel(key) + ' already has logged sets; pick another day' };
  }
  const day = templateDay(focusId);
  return {
    ok: true,
    days: withDay(days, key, day),
    editKey: key,
    message: (day.rest ? 'Rest day' : day.focus) + ' assigned to ' + shortLabel(key)
  };
}

// Monday-first list of focus values for the week containing today. Days that
// are already over, or hold logged sets, keep their plan.
export function setWeek(days, todayKey, focusValues) {
  if (!Array.isArray(focusValues) || focusValues.length !== 7) {
    return { ok: false, message: 'Say seven focuses, Monday to Sunday' };
  }
  const focusIds = focusValues.map(normalizeFocus);
  if (focusIds.some((id) => !id)) {
    return { ok: false, message: 'Unknown focus; use chest, back, legs, shoulders, or rest' };
  }
  let next = days;
  const skipped = [];
  const assigned = [];
  weekKeys(todayKey).forEach((key, index) => {
    if (key < todayKey || hasLoggedWork(days[key])) {
      skipped.push(weekdayLabel(key));
      return;
    }
    next = withDay(next, key, templateDay(focusIds[index]));
    assigned.push(weekdayLabel(key) + ' ' + (focusIds[index] === 'rest' ? 'rest' : templateDay(focusIds[index]).focus));
  });
  if (!assigned.length) return { ok: false, message: 'This week is over; nothing to set' };
  return {
    ok: true,
    days: next,
    editKey: weekKeys(todayKey).find((key) => key >= todayKey && !hasLoggedWork(days[key])) || todayKey,
    message: 'Week set: ' + assigned.join(' · ') + (skipped.length ? ' (kept ' + skipped.join(', ') + ')' : '')
  };
}

// spec: { name, sets, reps, kg, minutes }. Cardio when minutes is given
// without sets. A missing weight becomes bodyweight and asks for adjustment.
export function addExercise(days, key, spec) {
  const name = titleCase(cleanName(spec && spec.name));
  if (!name) return { ok: false, message: 'Which exercise? Say its name' };
  const day = trainingDay(days, key);
  if (day.items.length >= MAX_ITEMS) return { ok: false, message: 'This day already has ' + MAX_ITEMS + ' exercises' };
  const minutes = toInteger(spec.minutes, 1, 600);
  const sets = toInteger(spec.sets, 1, 20);
  const reps = toInteger(spec.reps, 1, 100);
  const id = uniqueId(day, name);
  let item;
  let needsKg = false;
  if (minutes !== null && sets === null) {
    item = newCardioItem(id, name, minutes);
  } else {
    if (sets === null || reps === null) {
      return { ok: false, message: 'Say sets and reps, like "' + name + ' three sets of ten"' };
    }
    const kg = spec.kg === undefined || spec.kg === null ? null : toKg(spec.kg);
    if (spec.kg !== undefined && spec.kg !== null && kg === null) {
      return { ok: false, message: 'Weight must be between 0 and 1000 kg' };
    }
    needsKg = kg === null;
    const weight = kg === null ? 0 : kg;
    item = newStrengthItem(id, name, sets, reps, weight, stepFor(name, weight), 90);
  }
  day.items.push(item);
  return {
    ok: true,
    days: withDay(days, key, day),
    editKey: key,
    changedId: id,
    adjust: needsKg,
    message: 'Added ' + name + ' · ' + prescription(item) + ' to ' + shortLabel(key) +
      (needsKg ? ' — swipe to set the weight' : '')
  };
}

// patch: { name, sets, reps, kg, minutes }; undefined fields stay unchanged.
export function updateExercise(days, key, name, patch) {
  const day = days[key];
  const index = findItemIndex(day, name);
  if (index < 0) return { ok: false, message: 'No "' + cleanName(name) + '" on ' + shortLabel(key) };
  const next = cloneDay(day);
  const item = next.items[index];
  const changes = [];
  const source = patch || {};
  if (source.name !== undefined) {
    const newName = titleCase(cleanName(source.name));
    if (!newName) return { ok: false, message: 'New name is empty' };
    changes.push(item.name + ' → ' + newName);
    item.name = newName;
  }
  if (item.type === 'strength') {
    if (source.sets !== undefined) {
      const sets = toInteger(source.sets, 1, 20);
      if (sets === null) return { ok: false, message: 'Sets must be 1 to 20' };
      if (sets < item.log.length) return { ok: false, message: item.log.length + ' sets are already logged' };
      changes.push('sets ' + item.sets + ' → ' + sets);
      item.sets = sets;
    }
    if (source.reps !== undefined) {
      const reps = toInteger(source.reps, 1, 100);
      if (reps === null) return { ok: false, message: 'Reps must be 1 to 100' };
      changes.push('reps ' + item.reps + ' → ' + reps);
      item.reps = reps;
    }
    if (source.kg !== undefined) {
      const kg = toKg(source.kg);
      if (kg === null) return { ok: false, message: 'Weight must be between 0 and 1000 kg' };
      changes.push(formatKgWithUnit(item.kg) + ' → ' + formatKgWithUnit(kg));
      item.kg = kg;
    }
  } else if (source.minutes !== undefined) {
    const minutes = toInteger(source.minutes, 1, 600);
    if (minutes === null) return { ok: false, message: 'Minutes must be 1 to 600' };
    changes.push(item.minutes + ' → ' + minutes + ' min');
    item.minutes = minutes;
  }
  if (!changes.length) return { ok: false, message: 'Nothing to change on ' + item.name };
  return {
    ok: true,
    days: withDay(days, key, next),
    editKey: key,
    changedId: item.id,
    message: item.name + ': ' + changes.join(', ')
  };
}

export function removeExercise(days, key, name) {
  const day = days[key];
  const index = findItemIndex(day, name);
  if (index < 0) return { ok: false, message: 'No "' + cleanName(name) + '" on ' + shortLabel(key) };
  if (itemDone(day.items[index]) > 0) {
    return { ok: false, message: day.items[index].name + ' has logged sets; keep it' };
  }
  const next = cloneDay(day);
  const [removed] = next.items.splice(index, 1);
  return {
    ok: true,
    days: withDay(days, key, next),
    editKey: key,
    message: 'Removed ' + removed.name + ' from ' + shortLabel(key)
  };
}

// One plate step up or down on the working weight of a strength item.
export function nudgeKg(days, key, index, direction) {
  const day = days[key];
  const next = adjustKg(day, index, direction);
  if (!next) return null;
  return withDay(days, key, next);
}

// Words the Page handles itself, with no model round trip.
export function localCommand(transcript) {
  const text = String(transcript || '').trim().toLowerCase().replace(/[.!?。！？]+$/, '');
  if (/^(undo|undo that|undo it|revert|go back|cancel that)$/.test(text)) return 'undo';
  if (/^(done|i'm done|finish|finished|that's it|that is it|save|save it|ok done)$/.test(text)) return 'finish';
  return null;
}

const FOCUS_ENUM = FOCUS_IDS.slice();

export const PLAN_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_week',
      description: 'Plan the whole week: one focus per day, Monday first, seven entries.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'array',
            minItems: 7,
            maxItems: 7,
            items: { type: 'string', enum: FOCUS_ENUM },
            description: 'Focus for Monday, Tuesday, ... Sunday'
          }
        },
        required: ['days']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assign_day',
      description: 'Give one day a focus template (chest, back, legs, shoulders) or make it a rest day.',
      parameters: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'today, tomorrow, a weekday name, or YYYY-MM-DD' },
          focus: { type: 'string', enum: FOCUS_ENUM }
        },
        required: ['day', 'focus']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_exercise',
      description: 'Add one exercise to the day being edited. Strength: sets and reps, weight in kg if said. Cardio: minutes only.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exercise name as said, e.g. Bench Press' },
          sets: { type: 'integer' },
          reps: { type: 'integer' },
          kg: { type: 'number', description: 'Weight in kilograms. Omit when not said; 0 means bodyweight.' },
          minutes: { type: 'integer', description: 'Cardio duration in minutes' },
          day: { type: 'string', description: 'Only when the user names a day: today, tomorrow, a weekday, or YYYY-MM-DD' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_exercise',
      description: 'Change sets, reps, weight (kg), minutes, or the name of an exercise already on the day being edited. Include only the fields that change.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Existing exercise to change' },
          sets: { type: 'integer' },
          reps: { type: 'integer' },
          kg: { type: 'number' },
          minutes: { type: 'integer' },
          new_name: { type: 'string' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_exercise',
      description: 'Remove an exercise from the day being edited.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'adjust_weight',
      description: 'Start adjusting the weight of an exercise with temple swipes, when the user asks to adjust, tune, or change a weight without saying a number.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'undo',
      description: 'Undo the previous change.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'The user is done editing: save and leave the editor.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

export function describeDay(day) {
  if (!day) return 'nothing planned';
  if (day.rest) return 'rest day';
  if (!day.items.length) return day.focus + ', no exercises yet';
  return day.focus + ': ' + day.items.map((item) => item.name + ' ' + prescription(item)).join('; ');
}

// context: { todayKey, editKey, day }
export function buildSystemPrompt(context) {
  const lines = [
    'You edit a workout plan on smart glasses. The user speaks one short command at a time.',
    'Respond only by calling exactly one tool; never answer in prose. If the request is unclear, still pick the closest tool.',
    'Today is ' + shortLabel(context.todayKey) + ' (' + context.todayKey + ').',
    'The day being edited is ' + shortLabel(context.editKey) + ' (' + context.editKey + '): ' + describeDay(context.day) + '.',
    'Weights are kilograms. "five by eight" means 5 sets of 8 reps. "at eighty" means 80 kg. A weight said without an exercise refers to the last exercise mentioned.',
    'Use update_exercise for an exercise already on the day, add_exercise for a new one, adjust_weight when the user wants to tune a weight without saying a number.',
    'Focus names: chest, back, legs, shoulders, rest.'
  ];
  return lines.join('\n');
}

function argsOf(command) {
  const args = command && command.args;
  return args && typeof args === 'object' ? args : {};
}

function targetKey(args, context) {
  if (args.day === undefined || args.day === null || args.day === '') return context.editKey;
  return resolveDayRef(args.day, context.todayKey);
}

// Applies one model tool call. Returns { ok, kind, days, editKey, message,
// changedId, adjust }; `kind` tells the Page what happened.
export function applyCommand(days, context, command) {
  const name = command && command.name;
  const args = argsOf(command);
  if (name === 'undo') return { ok: true, kind: 'undo' };
  if (name === 'finish') return { ok: true, kind: 'finish' };
  if (name === 'set_week') {
    const result = setWeek(days, context.todayKey, args.days);
    return result.ok ? Object.assign({ kind: 'change' }, result) : result;
  }
  if (name === 'assign_day') {
    const key = resolveDayRef(args.day, context.todayKey);
    if (!key) return { ok: false, message: 'Which day? Say today, tomorrow, or a weekday' };
    const result = assignFocus(days, key, args.focus);
    return result.ok ? Object.assign({ kind: 'change' }, result) : result;
  }
  if (name === 'add_exercise') {
    const key = targetKey(args, context);
    if (!key) return { ok: false, message: 'Which day? Say today, tomorrow, or a weekday' };
    const result = addExercise(days, key, args);
    return result.ok ? Object.assign({ kind: 'change' }, result) : result;
  }
  if (name === 'update_exercise') {
    const patch = {};
    for (const field of ['sets', 'reps', 'kg', 'minutes']) {
      if (args[field] !== undefined && args[field] !== null) patch[field] = args[field];
    }
    if (args.new_name !== undefined && args.new_name !== null) patch.name = args.new_name;
    const result = updateExercise(days, context.editKey, args.name, patch);
    return result.ok ? Object.assign({ kind: 'change' }, result) : result;
  }
  if (name === 'remove_exercise') {
    const result = removeExercise(days, context.editKey, args.name);
    return result.ok ? Object.assign({ kind: 'change' }, result) : result;
  }
  if (name === 'adjust_weight') {
    const day = days[context.editKey];
    const index = findItemIndex(day, args.name);
    if (index < 0 || day.items[index].type !== 'strength') {
      return { ok: false, message: 'No "' + cleanName(args.name) + '" to adjust on ' + shortLabel(context.editKey) };
    }
    return {
      ok: true,
      kind: 'adjust',
      days,
      editKey: context.editKey,
      changedId: day.items[index].id,
      adjust: true,
      message: 'Swipe to adjust ' + day.items[index].name + ' · ' + formatKgWithUnit(day.items[index].kg)
    };
  }
  return { ok: false, message: "Didn't understand; try \"add squat, five sets of five at a hundred\"" };
}

export function isEditableKey(key) {
  return isKey(key);
}
