// Manual plan builder: a fixed state machine driven by four temple inputs
// (tap, double tap = back, swipe forward = prev, swipe back = next). No voice
// and no model: choose a body part, pick exercises from that part's library,
// set sets / reps / weight for each, save. Pure over the `days` map so the Page
// and the Node tests run the same code.
//
// Screens: part (body part picker) -> list (the day's exercises, + Add, Save)
//          -> add (library of the part, multi-pick) -> setup (one exercise at a
//          time: sets, reps, weight, then Save / Remove).
// Every change returns a new `days` object; the Page saves whenever it changes.
import { shortLabel } from './dates.js';
import { cloneDay, formatKgWithUnit, prescription } from './workout.js';
import { hasLoggedWork } from './plan.js';
import {
  CARDIO_ID,
  PARTS,
  REST_ID,
  entryById,
  exercisesFor,
  partIdForFocus,
  partLabel
} from './exercises.js';

export const VISIBLE_ROWS = 5;
const CARDIO_STEP_MIN = 5;
const LIMITS = { sets: [1, 20], reps: [1, 100], kg: [0, 1000], minutes: [1, 600] };
const FIELD_NAMES = { sets: 'Sets', reps: 'Reps', kg: 'Weight', minutes: 'Minutes' };

function wrap(index, count) {
  return count === 0 ? 0 : ((index % count) + count) % count;
}

function roundKg(value) {
  return Math.round(value * 100) / 100;
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function withDay(days, key, day) {
  const next = Object.assign({}, days);
  next[key] = day;
  return next;
}

function dayOf(state) {
  return state.days[state.key];
}

function stay(state) {
  return { state, effect: null };
}

function exit(state) {
  return { state, effect: 'exit' };
}

export function visibleRange(count, cursor) {
  if (count <= VISIBLE_ROWS) return [0, count];
  const start = Math.min(Math.max(cursor - 2, 0), count - VISIBLE_ROWS);
  return [start, start + VISIBLE_ROWS];
}

// ---- rows --------------------------------------------------------------

// The list screen exists once the day has a body part or any exercise.
function listAvailable(day) {
  return Boolean(day && !day.rest && (day.items.length > 0 || partIdForFocus(day.focus)));
}

function currentPartId(day) {
  if (!day) return null;
  return day.rest ? REST_ID : partIdForFocus(day.focus);
}

function partRows(state) {
  const current = currentPartId(dayOf(state));
  const rows = PARTS.map((part) => ({
    k: 'p-' + part.id, kind: 'part', id: part.id, label: part.label,
    detail: part.id === current ? 'current' : '', mark: part.id === current ? 'cur' : 'none'
  }));
  rows.push({
    k: 'p-rest', kind: 'part', id: REST_ID, label: 'Rest day',
    detail: current === REST_ID ? 'current' : '', mark: current === REST_ID ? 'cur' : 'none'
  });
  return rows;
}

function listRows(state) {
  const day = dayOf(state);
  const rows = [];
  if (!state.locked) {
    rows.push({ k: 'part', kind: 'part', label: 'Body part', detail: day.focus || 'Not set', mark: 'none' });
  }
  day.items.forEach((item, index) => {
    rows.push({ k: 'i-' + item.id, kind: 'item', index, label: item.name, detail: prescription(item), mark: 'none' });
  });
  if (!state.locked) rows.push({ k: 'add', kind: 'add', label: '+ Add exercise', detail: '', mark: 'none' });
  rows.push({ k: 'save', kind: 'save', label: state.locked ? 'Back' : 'Save', detail: '', mark: 'none' });
  return rows;
}

function addRows(state) {
  const day = dayOf(state);
  const rows = exercisesFor(state.addPart).map((entry) => {
    const inPlan = day.items.some((item) => item.id === entry.id);
    const picked = state.picks.indexOf(entry.id) >= 0;
    return {
      k: 'e-' + entry.id, kind: 'ex', id: entry.id, label: entry.name,
      detail: inPlan ? 'in plan' : '', mark: inPlan ? 'in' : (picked ? 'on' : 'off')
    };
  });
  const own = partIdForFocus(day.focus);
  if (own && own !== CARDIO_ID) {
    rows.push({
      k: 'switch', kind: 'switch', mark: 'none', detail: '',
      label: state.addPart === CARDIO_ID ? 'Show ' + partLabel(own) + ' list' : 'Show cardio list'
    });
  }
  rows.push({ k: 'save', kind: 'save', label: 'Save (' + state.picks.length + ')', detail: '', mark: 'none' });
  return rows;
}

export function rowsFor(state) {
  if (state.screen === 'part') return partRows(state);
  if (state.screen === 'add') return addRows(state);
  return listRows(state);
}

function listCursor(state, where) {
  const rows = listRows(state);
  let index = -1;
  if (where === 'part') index = rows.findIndex((row) => row.kind === 'part');
  else if (where === 'add') index = rows.findIndex((row) => row.kind === 'add');
  else if (where === 'save') index = rows.findIndex((row) => row.kind === 'save');
  else if (where === 'first') index = rows.findIndex((row) => row.kind === 'item');
  else if (typeof where === 'object' && where !== null) {
    index = rows.findIndex((row) => row.kind === 'item' && row.index === where.item);
  }
  if (index < 0) index = rows.findIndex((row) => row.kind === 'add');
  return index < 0 ? 0 : index;
}

function toList(state, where, notice) {
  const next = Object.assign({}, state, {
    screen: 'list', setup: null, queue: [], queueTotal: 0, queueDone: 0, picks: [], notice: notice || ''
  });
  next.cursor = listCursor(next, where);
  return next;
}

function toPart(state, notice) {
  const next = Object.assign({}, state, { screen: 'part', notice: notice || '' });
  const current = currentPartId(dayOf(state));
  const rows = partRows(next);
  const index = rows.findIndex((row) => row.id === current);
  next.cursor = index < 0 ? 0 : index;
  return next;
}

// ---- start ----------------------------------------------------------------

export function initState(days, key) {
  const day = days[key];
  const locked = hasLoggedWork(day);
  const hasList = listAvailable(day);
  const base = {
    key, days, locked, screen: 'part', cursor: 0, addPart: null, picks: [], setup: null,
    queue: [], queueTotal: 0, queueDone: 0,
    notice: locked ? 'Sets are already logged; the plan is locked' : ''
  };
  if (!hasList) return toPart(base, base.notice);
  return toList(base, day.items.length > 0 ? 'first' : 'add', base.notice);
}

// ---- library -> plan items ----------------------------------------------------

// Setup of the last earlier day that held this exercise, or null.
export function previousItem(days, key, id, name) {
  const keys = Object.keys(days).filter((other) => other < key).sort().reverse();
  const wanted = String(name || '').toLowerCase();
  for (const other of keys) {
    const day = days[other];
    if (!day || day.rest) continue;
    const found = day.items.find((item) => item.id === id || item.name.toLowerCase() === wanted);
    if (found) return found;
  }
  return null;
}

function lastUsedKg(item) {
  const last = item.log && item.log.length ? item.log[item.log.length - 1] : null;
  return last && isNumber(last.kg) ? last.kg : item.kg;
}

// New plan item: the previous session's setup when this exercise was done or
// planned before, else the library default.
export function makeItem(entry, previous) {
  if (entry.type === 'cardio') {
    const minutes = previous && Number.isInteger(previous.minutes) ? previous.minutes : entry.minutes;
    return { id: entry.id, name: entry.name, type: 'cardio', minutes, doneAt: null };
  }
  const use = previous && previous.type === 'strength' ? previous : null;
  return {
    id: entry.id,
    name: entry.name,
    type: 'strength',
    sets: use && Number.isInteger(use.sets) ? use.sets : entry.sets,
    reps: use && Number.isInteger(use.reps) ? use.reps : entry.reps,
    kg: use && isNumber(lastUsedKg(use)) ? lastUsedKg(use) : entry.kg,
    step: entry.step,
    restSec: entry.restSec,
    log: []
  };
}

// ---- setup ---------------------------------------------------------------------

function openSetup(state, id, isNew) {
  const item = dayOf(state).items.find((candidate) => candidate.id === id);
  if (!item) return toList(state, 'save');
  const entry = entryById(item.id);
  const fields = item.type === 'cardio' ? ['minutes'] : ['sets', 'reps', 'kg'];
  return Object.assign({}, state, {
    screen: 'setup',
    setup: {
      id,
      isNew,
      type: item.type,
      fields,
      stage: 0,
      option: 0,
      streak: 0,
      dir: 0,
      step: item.type === 'strength' ? item.step : CARDIO_STEP_MIN,
      repStep: entry && entry.repStep ? entry.repStep : 1,
      values: item.type === 'cardio' ?
        { minutes: item.minutes } : { sets: item.sets, reps: item.reps, kg: item.kg }
    }
  });
}

function multiplier(field, streak) {
  if (field !== 'kg' && field !== 'minutes') return 1;
  if (streak >= 9) return 4;
  return streak >= 5 ? 2 : 1;
}

// Swipes in a row in one direction grow the weight / minutes step.
export function stepNow(setup) {
  const field = setup.fields[setup.stage];
  if (!field) return 0;
  const streak = setup.streak + 1;
  const base = field === 'sets' ? 1 : field === 'reps' ? setup.repStep : setup.step;
  return roundKg(base * multiplier(field, streak));
}

function adjust(state, dir) {
  const setup = state.setup;
  const field = setup.fields[setup.stage];
  const streak = dir === setup.dir ? setup.streak + 1 : 1;
  const base = field === 'sets' ? 1 : field === 'reps' ? setup.repStep : setup.step;
  const limits = LIMITS[field];
  const before = setup.values[field];
  const after = Math.min(limits[1], Math.max(limits[0], roundKg(before + dir * base * multiplier(field, streak))));
  const values = Object.assign({}, setup.values);
  values[field] = after;
  let notice = '';
  if (after === before) {
    notice = field === 'kg' && dir < 0 ? 'Already bodyweight' : 'Limit reached';
  }
  return stay(Object.assign({}, state, {
    notice,
    setup: Object.assign({}, setup, { values, streak, dir })
  }));
}

function commitSetup(state) {
  const setup = state.setup;
  const day = cloneDay(dayOf(state));
  const item = day.items.find((candidate) => candidate.id === setup.id);
  if (item) {
    if (item.type === 'cardio') {
      item.minutes = setup.values.minutes;
    } else {
      item.sets = setup.values.sets;
      item.reps = setup.values.reps;
      item.kg = setup.values.kg;
      // A shorter set count drops no logs: nothing is logged before training.
      item.log = item.log.slice(0, item.sets);
    }
  }
  return Object.assign({}, state, { days: withDay(state.days, state.key, day) });
}

function removeFromPlan(state) {
  const setup = state.setup;
  const day = cloneDay(dayOf(state));
  day.items = day.items.filter((candidate) => candidate.id !== setup.id);
  return Object.assign({}, state, { days: withDay(state.days, state.key, day) });
}

// After Save / Remove: next queued exercise, else back to the list.
function afterSetup(state, finished, removed) {
  const setup = state.setup;
  if (state.queue.length > 0) {
    const id = state.queue[0];
    const next = openSetup(Object.assign({}, state, {
      queue: state.queue.slice(1), queueDone: state.queueDone + 1
    }), id, true);
    const item = dayOf(next).items.find((candidate) => candidate.id === id);
    next.notice = (removed ? 'Removed · ' : 'Saved · ') + 'next ' + (item ? item.name : '');
    return next;
  }
  const notice = removed ? 'Removed ' + finished : 'Saved ' + finished;
  if (setup.isNew) return toList(state, 'save', notice);
  if (removed) return toList(state, 'first', notice);
  const index = dayOf(state).items.findIndex((candidate) => candidate.id === setup.id);
  return toList(state, index < 0 ? 'first' : { item: index }, notice);
}

function setupHandler(state, input) {
  const setup = state.setup;
  const confirm = setup.stage >= setup.fields.length;
  if (input === 'prev' || input === 'next') {
    if (confirm) {
      const option = wrap(setup.option + (input === 'prev' ? -1 : 1), 2);
      return stay(Object.assign({}, state, { notice: '', setup: Object.assign({}, setup, { option }) }));
    }
    return adjust(state, input === 'prev' ? 1 : -1);
  }
  if (input === 'tap') {
    if (!confirm) {
      return stay(Object.assign({}, state, {
        notice: '', setup: Object.assign({}, setup, { stage: setup.stage + 1, streak: 0, dir: 0 })
      }));
    }
    const name = (dayOf(state).items.find((candidate) => candidate.id === setup.id) || { name: '' }).name;
    if (setup.option === 0) return stay(afterSetup(commitSetup(state), name, false));
    return stay(afterSetup(removeFromPlan(state), name, true));
  }
  // back: one step back, or leave the setup at the first field
  if (setup.stage > 0) {
    return stay(Object.assign({}, state, {
      notice: '', setup: Object.assign({}, setup, { stage: setup.stage - 1, streak: 0, dir: 0, option: 0 })
    }));
  }
  const index = dayOf(state).items.findIndex((candidate) => candidate.id === setup.id);
  return stay(toList(state, index < 0 ? 'save' : { item: index }, ''));
}

// ---- add (library) -------------------------------------------------------------

function saveAdd(state) {
  if (state.picks.length === 0) return stay(toList(state, 'add', 'Nothing picked'));
  const day = cloneDay(dayOf(state));
  const ids = [];
  state.picks.forEach((id) => {
    const entry = entryById(id);
    if (!entry || day.items.some((item) => item.id === id) || day.items.length >= 20) return;
    day.items.push(makeItem(entry, previousItem(state.days, state.key, entry.id, entry.name)));
    ids.push(id);
  });
  if (ids.length === 0) return stay(toList(state, 'add', 'Already in the plan'));
  const withItems = Object.assign({}, state, {
    days: withDay(state.days, state.key, day), queue: ids.slice(1), queueTotal: ids.length, queueDone: 0, picks: []
  });
  return stay(openSetup(withItems, ids[0], true));
}

function addHandler(state, input) {
  const rows = addRows(state);
  if (input === 'prev' || input === 'next') {
    return stay(Object.assign({}, state, {
      notice: '', cursor: wrap(state.cursor + (input === 'prev' ? -1 : 1), rows.length)
    }));
  }
  if (input === 'back') return stay(toList(state, 'add', state.picks.length ? 'Selection cancelled' : ''));
  const row = rows[state.cursor];
  if (row.kind === 'save') return saveAdd(state);
  if (row.kind === 'switch') {
    const own = partIdForFocus(dayOf(state).focus);
    return stay(Object.assign({}, state, {
      notice: '', cursor: 0, addPart: state.addPart === CARDIO_ID ? own : CARDIO_ID
    }));
  }
  if (row.mark === 'in') return stay(Object.assign({}, state, { notice: row.label + ' is already in the plan' }));
  const picks = state.picks.indexOf(row.id) >= 0 ?
    state.picks.filter((id) => id !== row.id) : state.picks.concat([row.id]);
  return stay(Object.assign({}, state, { notice: '', picks }));
}

// ---- list ----------------------------------------------------------------------

function listHandler(state, input) {
  const rows = listRows(state);
  if (input === 'prev' || input === 'next') {
    return stay(Object.assign({}, state, {
      notice: '', cursor: wrap(state.cursor + (input === 'prev' ? -1 : 1), rows.length)
    }));
  }
  if (input === 'back') return exit(state);
  const row = rows[state.cursor];
  if (row.kind === 'save') return exit(state);
  if (state.locked) return stay(Object.assign({}, state, { notice: 'Sets are already logged; the plan is locked' }));
  if (row.kind === 'part') return stay(toPart(state, ''));
  if (row.kind === 'item') return stay(openSetup(Object.assign({}, state, { notice: '' }), dayOf(state).items[row.index].id, false));
  // add
  const partId = partIdForFocus(dayOf(state).focus);
  if (!partId) return stay(toPart(state, 'Pick a body part first'));
  if (dayOf(state).items.length >= 20) return stay(Object.assign({}, state, { notice: 'A day holds up to 20 exercises' }));
  return stay(Object.assign({}, state, { screen: 'add', addPart: partId, picks: [], cursor: 0, notice: '' }));
}

// ---- part ----------------------------------------------------------------------

function partHandler(state, input) {
  const rows = partRows(state);
  if (input === 'prev' || input === 'next') {
    return stay(Object.assign({}, state, {
      notice: '', cursor: wrap(state.cursor + (input === 'prev' ? -1 : 1), rows.length)
    }));
  }
  const day = dayOf(state);
  const hasList = listAvailable(day);
  if (input === 'back') return hasList ? stay(toList(state, 'part', '')) : exit(state);
  if (state.locked) return stay(Object.assign({}, state, { notice: 'Sets are already logged; the plan is locked' }));
  const row = rows[state.cursor];
  if (row.id === REST_ID) {
    const rest = { focus: 'Rest', rest: true, items: [] };
    return exit(Object.assign({}, state, { days: withDay(state.days, state.key, rest), notice: '' }));
  }
  const label = partLabel(row.id);
  if (!day || day.rest || partIdForFocus(day.focus) !== row.id) {
    const hadItems = Boolean(day && !day.rest && day.items.length);
    const fresh = { focus: label, rest: false, items: [] };
    const changed = Object.assign({}, state, { days: withDay(state.days, state.key, fresh) });
    return stay(toList(changed, 'add', label + ' set' + (hadItems ? '; old exercises cleared' : '')));
  }
  return stay(toList(state, 'add', ''));
}

const HANDLERS = { part: partHandler, list: listHandler, add: addHandler, setup: setupHandler };

// input: 'tap' | 'back' | 'prev' | 'next'. Returns { state, effect } where
// effect is 'exit' (leave the builder) or null.
export function press(state, input) {
  return HANDLERS[state.screen](Object.assign({}, state, { notice: '' }), input);
}

// ---- view model ------------------------------------------------------------------

function hintPairs(pairs) {
  const parts = [];
  pairs.forEach((pair, index) => {
    parts.push({ k: index + 'k', t: pair[0], key: true });
    parts.push({ k: index + 't', t: ' ' + pair[1] + (index < pairs.length - 1 ? ' · ' : ''), key: false });
  });
  return parts;
}

function setupLine(state) {
  const setup = state.setup;
  if (setup.stage >= setup.fields.length) return 'Save this exercise, or remove it';
  const field = setup.fields[setup.stage];
  if (field === 'kg') {
    const step = stepNow(setup);
    return 'Weight · swipe forward +' + step + ' kg, back -' + step + ' kg';
  }
  if (field === 'minutes') {
    const step = stepNow(setup);
    return 'Minutes · swipe forward +' + step + ', back -' + step;
  }
  return FIELD_NAMES[field] + ' · swipe forward +' + stepNow(setup) + ', back -' + stepNow(setup);
}

function setupView(state) {
  const setup = state.setup;
  const item = dayOf(state).items.find((candidate) => candidate.id === setup.id);
  const name = item ? item.name : '';
  const confirm = setup.stage >= setup.fields.length;
  const v = setup.values;
  let cells;
  if (setup.type === 'cardio') {
    cells = [{ k: 'minutes', label: 'MINUTES', value: v.minutes + ' min', on: setup.stage === 0 }];
  } else {
    cells = [
      { k: 'sets', label: 'SETS', value: String(v.sets), on: setup.stage === 0 },
      { k: 'reps', label: setup.repStep > 1 ? 'SECONDS' : 'REPS', value: String(v.reps), on: setup.stage === 1 },
      { k: 'kg', label: 'WEIGHT', value: formatKgWithUnit(v.kg), on: setup.stage === 2 }
    ];
  }
  const summary = setup.type === 'cardio' ? v.minutes + ' min' :
    v.sets + ' × ' + v.reps + ' · ' + formatKgWithUnit(v.kg);
  const eyebrow = setup.isNew && state.queueTotal > 0 ?
    'SET UP ' + (state.queueDone + 1) + ' / ' + state.queueTotal : 'EDIT EXERCISE';
  return {
    screen: 'setup',
    eyebrow,
    meta: shortLabel(state.key),
    rows: [],
    setup: {
      name,
      cells,
      line: setupLine(state),
      options: [
        { k: 'save', label: 'Save', on: confirm && setup.option === 0 },
        { k: 'remove', label: 'Remove', on: confirm && setup.option === 1 }
      ],
      confirm
    },
    hint: hintPairs(confirm ?
      [['Swipe', 'choose'], ['Tap', 'confirm'], ['Double-tap', 'back']] :
      [['Swipe', 'change'], ['Tap', 'next'], ['Double-tap', 'back']]),
    notice: state.notice,
    compact: { title: eyebrow, main: name, sub: confirm ? (setup.option === 0 ? 'Save' : 'Remove') + ' · ' + summary : summary }
  };
}

export function view(state) {
  if (state.screen === 'setup') return setupView(state);
  const rows = rowsFor(state);
  const range = visibleRange(rows.length, state.cursor);
  const shown = [];
  for (let index = range[0]; index < range[1]; index += 1) {
    shown.push(Object.assign({}, rows[index], { focus: index === state.cursor }));
  }
  const current = rows[state.cursor] || { label: '', detail: '' };
  const position = (state.cursor + 1) + ' / ' + rows.length;
  const day = dayOf(state);
  let eyebrow;
  let meta;
  let hint;
  if (state.screen === 'part') {
    eyebrow = 'BODY PART · ' + shortLabel(state.key);
    meta = position;
    hint = hintPairs([['Swipe', 'choose'], ['Tap', 'select'], ['Double-tap', listAvailable(day) ? 'back' : 'exit']]);
  } else if (state.screen === 'add') {
    eyebrow = 'ADD · ' + partLabel(state.addPart).toUpperCase();
    meta = position + ' · ' + state.picks.length + ' picked';
    hint = hintPairs([['Swipe', 'move'], ['Tap', 'pick'], ['Double-tap', 'cancel']]);
  } else {
    eyebrow = 'PLAN · ' + shortLabel(state.key);
    meta = day.focus + ' · ' + day.items.length + (day.items.length === 1 ? ' exercise' : ' exercises');
    hint = hintPairs([['Swipe', 'move'], ['Tap', 'open'], ['Double-tap', 'back']]);
  }
  return {
    screen: state.screen,
    eyebrow,
    meta,
    rows: shown,
    setup: null,
    hint,
    notice: state.notice,
    compact: { title: eyebrow, main: current.label, sub: current.detail || position }
  };
}
