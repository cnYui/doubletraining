import test from 'node:test';
import assert from 'node:assert/strict';
import { applySetPlan, lastWeight, parseExercises, summarize } from '../agent/lib/setplan.js';
import { seedDays } from '../agent/lib/workout.js';

const TODAY = '2026-09-11';

function days() {
  return seedDays(TODAY);
}

test('parseExercises accepts arrays, JSON strings, lone objects, and string numbers', () => {
  const list = parseExercises([{ name: 'bench press', sets: '4', reps: 8, kg: '60' }, { sets: 3 }, null]);
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].name, list[0].sets, list[0].reps, list[0].kg], ['Bench Press', 4, 8, 60]);
  assert.equal(parseExercises('[{"name":"Squat","sets":5,"reps":5,"kg":100}]')[0].kg, 100);
  assert.equal(parseExercises({ name: 'Squat' })[0].name, 'Squat');
  assert.equal(parseExercises('not json').length, 0);
  assert.equal(parseExercises(undefined).length, 0);
});

test('replace swaps the day items, keeps focus, and uses a given weight', () => {
  const result = applySetPlan(days(), '2026-09-12', {
    focus: 'chest',
    exercises: [{ name: 'Bench Press', sets: 4, reps: 8, kg: 62.5 }, { name: 'Pec Deck', sets: 4, reps: 8, kg: 40 }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.focus, 'Chest');
  const day = result.days['2026-09-12'];
  assert.equal(day.items.length, 2);
  assert.equal(day.items[0].kg, 62.5);
  assert.equal(day.items[0].sets, 4);
  assert.equal(result.rows[0].detail, '4x8');
});

test('a missing weight comes from history, then the library, then is marked unknown', () => {
  const base = days();
  const history = lastWeight(base, TODAY, 'Bench Press');
  assert.equal(typeof history, 'number');
  const result = applySetPlan(base, '2026-09-20', {
    exercises: [
      { name: 'bench press', sets: 4, reps: 8 },
      { name: 'Pec Deck', sets: 3, reps: 12, useLastWeight: true },
      { name: 'Zottman Curl', sets: 3, reps: 10 }
    ]
  });
  assert.equal(result.ok, true);
  const items = result.days['2026-09-20'].items;
  assert.equal(items[0].kg > 0, true);
  assert.equal(items[1].kg > 0, true);
  assert.equal(items[2].kg, 0);
  assert.equal(result.rows[2].unknown, true);
  assert.equal(result.rows[2].kg, '?');
});

test('append adds to the day and replaces a same-name exercise', () => {
  const base = days();
  const key = TODAY;
  const before = base[key].items.length;
  const result = applySetPlan(base, key, { mode: 'append', exercises: [{ name: 'Face Pull', sets: 3, reps: 15, kg: 20 }] });
  assert.equal(result.ok, true);
  assert.equal(result.days[key].items.length, before + 1);
  const again = applySetPlan(result.days, key, { mode: 'append', exercises: [{ name: 'face pull', sets: 4, reps: 12, kg: 22.5 }] });
  assert.equal(again.days[key].items.length, before + 1);
  assert.equal(again.days[key].items.find((item) => item.name === 'Face Pull').kg, 22.5);
});

test('cardio uses minutes and nothing changes without exercises', () => {
  const result = applySetPlan(days(), '2026-09-15', { exercises: [{ name: 'Swim', minutes: 30 }] });
  assert.equal(result.days['2026-09-15'].items[0].type, 'cardio');
  assert.equal(result.rows[0].detail, '30 min');
  const empty = applySetPlan(days(), '2026-09-15', { exercises: [] });
  assert.equal(empty.ok, false);
  assert.equal(empty.message, 'No exercises received');
  assert.equal(empty.days, undefined);
});

test('a day with logged sets is not overwritten', () => {
  const base = days();
  const logged = Object.keys(base).find((key) => base[key].items.some((item) => item.log && item.log.length));
  const result = applySetPlan(base, logged, { exercises: [{ name: 'Squat', sets: 5, reps: 5, kg: 100 }] });
  assert.equal(result.ok, false);
});

test('summarize limits compact rows to three and counts the rest', () => {
  const result = applySetPlan(days(), '2026-09-14', {
    exercises: ['A1', 'B2', 'C3', 'D4', 'E5'].map((name) => ({ name, sets: 3, reps: 10, kg: 10 }))
  });
  assert.equal(result.compactRows.length, 3);
  assert.equal(result.more, 2);
  assert.equal(summarize(result.days['2026-09-14']).rows.length, 5);
});
