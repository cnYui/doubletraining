import test from 'node:test';
import assert from 'node:assert/strict';
import { initState, press, rowsFor, stepNow, view, VISIBLE_ROWS } from '../agent/lib/build.js';
import { logSet, sanitizeDays, seedDays } from '../agent/lib/workout.js';

const TODAY = '2026-09-12';
const KEY = '2026-09-14';

function send(state, inputs) {
  let current = state;
  let effect = null;
  for (const input of inputs) {
    const result = press(current, input);
    current = result.state;
    effect = result.effect;
  }
  return { state: current, effect };
}

// Swipe (prev/next, whichever is shorter on the wrapped list) until the cursor
// row matches.
function moveTo(state, predicate) {
  let current = state;
  for (let guard = 0; guard < 80; guard += 1) {
    const rows = rowsFor(current);
    if (predicate(rows[current.cursor])) return current;
    current = press(current, 'next').state;
  }
  throw new Error('row not found');
}

function tapRow(state, predicate) {
  return press(moveTo(state, predicate), 'tap');
}

const byLabel = (label) => (row) => row.label === label;
const byKind = (kind) => (row) => row.kind === kind;

function emptyDays() {
  return {};
}

test('a day without a plan opens the body part picker with every part and rest', () => {
  const state = initState(emptyDays(), KEY);
  assert.equal(state.screen, 'part');
  const labels = rowsFor(state).map((row) => row.label);
  assert.deepEqual(labels.slice(0, 3), ['Chest', 'Back', 'Legs']);
  assert.equal(labels[labels.length - 1], 'Rest day');
  assert.ok(labels.includes('Cardio') && labels.includes('Abs') && labels.includes('Glutes'));
  assert.equal(press(state, 'back').effect, 'exit');
});

test('choosing a body part creates an empty day for it and lands on + Add', () => {
  let state = initState(emptyDays(), KEY);
  const result = tapRow(state, byLabel('Legs'));
  assert.equal(result.effect, null);
  state = result.state;
  assert.equal(state.screen, 'list');
  assert.deepEqual(state.days[KEY], { focus: 'Legs', rest: false, items: [] });
  assert.equal(rowsFor(state)[state.cursor].kind, 'add');
  assert.match(state.notice, /Legs set/);
});

test('rest day: saved as a rest day and leaves the builder', () => {
  const result = tapRow(initState(emptyDays(), KEY), byLabel('Rest day'));
  assert.equal(result.effect, 'exit');
  assert.deepEqual(result.state.days[KEY], { focus: 'Rest', rest: true, items: [] });
});

test('chest: pick bench, incline, decline, pec deck, then set each and save', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state; // + Add
  assert.equal(state.screen, 'add');
  assert.equal(state.addPart, 'chest');
  const names = rowsFor(state).filter((row) => row.kind === 'ex').map((row) => row.label);
  assert.ok(names.includes('Bench Press') && names.includes('Pec Deck'));
  assert.ok(!names.includes('Squat'));

  for (const name of ['Bench Press', 'Incline Bench Press', 'Decline Bench Press', 'Pec Deck']) {
    state = tapRow(state, byLabel(name)).state;
  }
  assert.deepEqual(state.picks, ['bench', 'incline-bench', 'decline-bench', 'pec-deck']);
  assert.equal(rowsFor(state).find(byKind('save')).label, 'Save (4)');

  // Save: the four exercises join the plan with defaults and set-up starts.
  state = tapRow(state, byKind('save')).state;
  assert.equal(state.screen, 'setup');
  assert.equal(state.days[KEY].items.length, 4);
  assert.equal(view(state).eyebrow, 'SET UP 1 / 4');
  assert.equal(view(state).setup.name, 'Bench Press');

  // Bench: sets 4 -> 5, reps 8 -> 6, weight 60 -> 65 (two swipes up), Save.
  state = send(state, ['prev', 'tap']).state; // sets 5
  state = send(state, ['next', 'next', 'tap']).state; // reps 6
  state = send(state, ['prev', 'prev', 'tap']).state; // 65 kg, confirm stage
  assert.equal(view(state).setup.confirm, true);
  state = press(state, 'tap').state; // Save
  assert.equal(state.screen, 'setup');
  assert.equal(view(state).eyebrow, 'SET UP 2 / 4');
  assert.match(state.notice, /Saved · next Incline Bench Press/);

  // The rest keep their defaults: Save straight through.
  for (let index = 0; index < 3; index += 1) {
    state = send(state, ['tap', 'tap', 'tap', 'tap']).state;
  }
  assert.equal(state.screen, 'list');
  assert.equal(rowsFor(state)[state.cursor].kind, 'save');
  const items = state.days[KEY].items;
  assert.deepEqual(items.map((item) => item.name),
    ['Bench Press', 'Incline Bench Press', 'Decline Bench Press', 'Pec Deck']);
  assert.deepEqual([items[0].sets, items[0].reps, items[0].kg], [5, 6, 65]);
  assert.deepEqual([items[3].sets, items[3].reps, items[3].kg], [3, 12, 45]);

  // Save leaves the builder; everything stays valid for the day Page.
  const done = press(state, 'tap');
  assert.equal(done.effect, 'exit');
  const stored = sanitizeDays(done.state.days);
  assert.deepEqual(stored[KEY], done.state.days[KEY]);
  assert.equal(stored[KEY].focus, 'Chest');
});

test('weight steps grow with a run of swipes and reset when the direction flips', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Bench Press')).state;
  state = tapRow(state, byKind('save')).state;
  state = send(state, ['tap', 'tap']).state; // stage: weight (60 kg, step 2.5)
  const weights = [];
  for (let index = 0; index < 10; index += 1) {
    state = press(state, 'prev').state;
    weights.push(state.setup.values.kg);
  }
  assert.deepEqual(weights, [62.5, 65, 67.5, 70, 75, 80, 85, 90, 100, 110]);
  assert.equal(stepNow(state.setup), 10);
  state = press(state, 'next').state;
  assert.equal(state.setup.values.kg, 107.5);
  assert.equal(stepNow(state.setup), 2.5);
});

test('weight stops at bodyweight; sets and reps keep to their limits', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Back')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Pull-up')).state;
  state = tapRow(state, byKind('save')).state;
  assert.equal(view(state).setup.cells[2].value, 'BW');
  state = send(state, ['tap', 'tap', 'next']).state;
  assert.equal(state.setup.values.kg, 0);
  assert.equal(state.notice, 'Already bodyweight');
  state = press(state, 'back').state; // reps
  state = press(state, 'back').state; // sets
  for (let index = 0; index < 30; index += 1) state = press(state, 'prev').state;
  assert.equal(state.setup.values.sets, 20);
  assert.equal(state.notice, 'Limit reached');
});

test('double tap steps back inside the setup and leaves it at the first field', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Bench Press')).state;
  state = tapRow(state, byKind('save')).state;
  state = send(state, ['tap', 'tap']).state;
  assert.equal(state.setup.stage, 2);
  state = press(state, 'back').state;
  assert.equal(state.setup.stage, 1);
  state = send(state, ['back', 'back']).state;
  assert.equal(state.screen, 'list');
  // The exercise keeps its library defaults.
  assert.deepEqual(state.days[KEY].items.map((item) => [item.id, item.sets, item.reps, item.kg]),
    [['bench', 4, 8, 60]]);
});

test('edit changes an exercise; leaving without Save discards the change', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Pec Deck')).state;
  state = send(tapRow(state, byKind('save')).state, ['tap', 'tap', 'tap', 'tap']).state;
  const list = press(state, 'back').state; // nothing was queued: back is exit on the list
  assert.ok(list);

  state = tapRow(state, byLabel('Pec Deck')).state;
  assert.equal(state.screen, 'setup');
  assert.equal(view(state).eyebrow, 'EDIT EXERCISE');
  state = send(state, ['prev', 'prev', 'prev']).state; // sets 6
  state = send(state, ['back']).state; // leave without saving
  assert.equal(state.screen, 'list');
  assert.equal(state.days[KEY].items[0].sets, 3);

  state = tapRow(state, byLabel('Pec Deck')).state;
  state = send(state, ['prev', 'tap', 'tap', 'tap', 'tap']).state; // sets 4, Save
  assert.equal(state.screen, 'list');
  assert.equal(state.days[KEY].items[0].sets, 4);
  assert.equal(rowsFor(state)[state.cursor].label, 'Pec Deck');
  assert.match(state.notice, /Saved Pec Deck/);
});

test('remove deletes the exercise from the plan', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Pec Deck')).state;
  state = tapRow(state, byLabel('DB Fly')).state;
  state = tapRow(state, byKind('save')).state;
  // First exercise: choose Remove at the confirm step.
  state = send(state, ['tap', 'tap', 'tap', 'next', 'tap']).state;
  assert.match(state.notice, /Removed/);
  assert.equal(state.screen, 'setup'); // next queued exercise
  assert.deepEqual(state.days[KEY].items.map((item) => item.name), ['DB Fly']);
});

test('an exercise already in the plan cannot be picked twice; nothing picked goes back', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Bench Press')).state;
  state = send(tapRow(state, byKind('save')).state, ['tap', 'tap', 'tap', 'tap']).state;
  state = tapRow(state, byKind('add')).state;
  const bench = rowsFor(state).find((row) => row.label === 'Bench Press');
  assert.equal(bench.mark, 'in');
  state = tapRow(state, byLabel('Bench Press')).state;
  assert.deepEqual(state.picks, []);
  assert.match(state.notice, /already in the plan/);
  state = tapRow(state, byKind('save')).state;
  assert.equal(state.screen, 'list');
  assert.equal(state.notice, 'Nothing picked');
  assert.equal(state.days[KEY].items.length, 1);
});

test('double tap in the library cancels the selection', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Bench Press')).state;
  state = press(state, 'back').state;
  assert.equal(state.screen, 'list');
  assert.equal(state.days[KEY].items.length, 0);
  assert.equal(state.notice, 'Selection cancelled');
});

test('cardio can be added to a strength day through the switch row', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Show cardio list')).state;
  assert.equal(state.addPart, 'cardio');
  assert.ok(rowsFor(state).filter((row) => row.kind === 'ex').every((row) => /Run|Bike|Swim|Walk|Row|Jump|HIIT|Climber|Elliptical|Hiking|Cycling|Ropes|Boxing|Yoga|Stretch|Mobility|Cool/.test(row.label)));
  state = tapRow(state, byLabel('Swim')).state;
  state = tapRow(state, byLabel('Show Chest list')).state;
  assert.equal(state.addPart, 'chest');
  state = tapRow(state, byLabel('Bench Press')).state;
  assert.deepEqual(state.picks, ['swim', 'bench']);
  state = tapRow(state, byKind('save')).state;
  assert.equal(view(state).setup.name, 'Swim');
  assert.equal(view(state).setup.cells.length, 1);
  state = send(state, ['prev', 'prev', 'tap']).state; // 30 -> 40 min
  state = press(state, 'tap').state; // Save
  const swim = state.days[KEY].items.find((item) => item.id === 'swim');
  assert.deepEqual([swim.type, swim.minutes, swim.doneAt], ['cardio', 40, null]);
  assert.equal(view(state).setup.name, 'Bench Press');
});

test('a Cardio day lists only cardio and has no switch row', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Cardio')).state;
  state = press(state, 'tap').state;
  assert.ok(rowsFor(state).every((row) => row.kind !== 'switch'));
});

test('a new exercise starts from its last planned or logged weight and counts', () => {
  const days = {};
  days['2026-09-07'] = {
    focus: 'Chest', rest: false,
    items: [{
      id: 'bench', name: 'Bench Press', type: 'strength', sets: 5, reps: 5, kg: 80, step: 2.5, restSec: 120,
      log: [{ reps: 5, kg: 82.5, at: 1 }, { reps: 5, kg: 85, at: 2 }]
    }]
  };
  let state = tapRow(initState(days, KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Bench Press')).state;
  state = tapRow(state, byKind('save')).state;
  const item = state.days[KEY].items[0];
  assert.deepEqual([item.sets, item.reps, item.kg], [5, 5, 85]);
  assert.deepEqual(item.log, []);
});

test('changing the body part clears the old exercises; re-picking the same keeps them', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Bench Press')).state;
  state = send(tapRow(state, byKind('save')).state, ['tap', 'tap', 'tap', 'tap']).state;

  let same = tapRow(state, byKind('part')).state;
  assert.equal(same.screen, 'part');
  same = tapRow(same, byLabel('Chest')).state;
  assert.equal(same.days[KEY].items.length, 1);

  let changed = tapRow(state, byKind('part')).state;
  changed = tapRow(changed, byLabel('Back')).state;
  assert.equal(changed.days[KEY].focus, 'Back');
  assert.deepEqual(changed.days[KEY].items, []);
  assert.match(changed.notice, /old exercises cleared/);
});

test('a planned day opens on its first exercise; the part row changes the part', () => {
  const days = seedDays(TODAY);
  const state = initState(days, TODAY);
  assert.equal(state.screen, 'list');
  const rows = rowsFor(state);
  assert.equal(rows[0].kind, 'part');
  assert.equal(rows[0].detail, 'Chest');
  assert.equal(rows[state.cursor].label, 'Bench Press');
  assert.equal(rows[rows.length - 1].kind, 'save');
  // The example plan's cardio row is editable as minutes.
  const swim = tapRow(state, byLabel('Swim')).state;
  assert.equal(view(swim).setup.cells[0].label, 'MINUTES');
});

test('a day with logged sets is locked', () => {
  const days = seedDays(TODAY);
  days[TODAY] = logSet(days[TODAY], 0, 5).day;
  let state = initState(days, TODAY);
  assert.equal(state.locked, true);
  assert.match(state.notice, /locked/);
  const rows = rowsFor(state);
  assert.ok(rows.every((row) => row.kind === 'item' || row.kind === 'save'));
  state = tapRow(state, byLabel('Bench Press')).state;
  assert.equal(state.screen, 'list');
  assert.match(state.notice, /locked/);
  assert.equal(tapRow(state, byKind('save')).effect, 'exit');
});

test('swiping wraps around both ends of a list', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Chest')).state;
  state = press(state, 'tap').state;
  const count = rowsFor(state).length;
  state = press(state, 'prev').state;
  assert.equal(state.cursor, count - 1);
  assert.equal(rowsFor(state)[state.cursor].kind, 'save');
  state = press(state, 'next').state;
  assert.equal(state.cursor, 0);
});

test('the view shows a window of five rows around the cursor', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Back')).state;
  state = press(state, 'tap').state;
  const shown = view(state);
  assert.equal(shown.rows.length, VISIBLE_ROWS);
  assert.equal(shown.rows.filter((row) => row.focus).length, 1);
  assert.match(shown.eyebrow, /^ADD · BACK$/);
  assert.match(shown.meta, /1 \/ \d+ · 0 picked/);
  assert.equal(shown.compact.main, 'Pull-up');
  const moved = send(state, ['next', 'next', 'next', 'next', 'next']).state;
  assert.equal(view(moved).rows.filter((row) => row.focus)[0].label, rowsFor(moved)[5].label);
});

test('press never changes the state it was given', () => {
  const days = seedDays(TODAY);
  const before = JSON.stringify(days);
  let state = initState(days, TODAY);
  const snapshot = JSON.stringify(state);
  state = tapRow(state, byLabel('Pec Deck')).state;
  state = send(state, ['prev', 'tap', 'tap', 'tap', 'tap']).state;
  assert.equal(JSON.stringify(days), before);
  assert.notEqual(JSON.stringify(state), snapshot);
});

test('timed holds are set in seconds', () => {
  let state = tapRow(initState(emptyDays(), KEY), byLabel('Abs')).state;
  state = press(state, 'tap').state;
  state = tapRow(state, byLabel('Plank (sec)')).state;
  state = tapRow(state, byKind('save')).state;
  state = send(state, ['tap']).state;
  assert.equal(view(state).setup.cells[1].label, 'SECONDS');
  state = press(state, 'prev').state;
  assert.equal(state.setup.values.reps, 50);
});
