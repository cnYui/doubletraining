import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDIO_ID,
  MAX_NAME_LENGTH,
  PARTS,
  allExerciseIds,
  entryById,
  exercisesFor,
  partIdForFocus,
  partLabel
} from '../agent/lib/exercises.js';
import { sanitizeDay } from '../agent/lib/workout.js';
import { makeItem } from '../agent/lib/build.js';

test('every body part has a library list; labels map back to ids', () => {
  assert.ok(PARTS.length >= 11);
  for (const part of PARTS) {
    assert.ok(exercisesFor(part.id).length >= 8, part.id + ' has too few exercises');
    assert.equal(partIdForFocus(part.label), part.id);
    assert.equal(partLabel(part.id), part.label);
  }
  assert.equal(partIdForFocus('chest'), 'chest');
  assert.equal(partIdForFocus('Training'), null);
  assert.equal(partIdForFocus('Rest'), null);
  assert.deepEqual(exercisesFor('nope'), []);
});

test('ids are unique inside a part and entries are well formed', () => {
  for (const part of PARTS) {
    const ids = exercisesFor(part.id).map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length, part.id + ' repeats an id');
  }
  for (const id of allExerciseIds()) {
    const entry = entryById(id);
    assert.ok(entry.name.length > 0 && entry.name.length <= MAX_NAME_LENGTH, id + ' name length');
    assert.match(entry.id, /^[a-z0-9-]+$/);
    if (entry.type === 'cardio') {
      assert.ok(Number.isInteger(entry.minutes) && entry.minutes >= 1 && entry.minutes <= 600, id);
    } else {
      assert.equal(entry.type, 'strength');
      assert.ok(Number.isInteger(entry.sets) && entry.sets >= 1 && entry.sets <= 20, id);
      assert.ok(Number.isInteger(entry.reps) && entry.reps >= 1 && entry.reps <= 100, id);
      assert.ok(entry.kg >= 0 && entry.kg <= 1000, id);
      assert.ok(entry.step > 0 && entry.step <= 50, id);
      assert.ok(entry.restSec >= 10 && entry.restSec <= 600, id);
    }
  }
});

test('a library entry shared by two parts is the same exercise in both', () => {
  const inLegs = exercisesFor('legs').find((entry) => entry.id === 'standing-calf');
  const inCalves = exercisesFor('calves').find((entry) => entry.id === 'standing-calf');
  assert.deepEqual(inLegs, inCalves);
  const arms = exercisesFor('arms').map((entry) => entry.id);
  for (const id of ['bb-curl', 'pushdown', 'wrist-curl']) assert.ok(arms.includes(id), id);
});

test('the chest list covers bench, incline, decline, and fly movements', () => {
  const names = exercisesFor('chest').map((entry) => entry.name);
  for (const wanted of [
    'Bench Press', 'Incline Bench Press', 'Decline Bench Press', 'Incline DB Press',
    'Pec Deck', 'Cable Crossover', 'DB Fly', 'Push-up', 'Chest Dip'
  ]) {
    assert.ok(names.includes(wanted), wanted + ' missing from chest');
  }
  // Nothing from another body part leaks into the chest list.
  assert.ok(!names.includes('Squat') && !names.includes('Barbell Curl') && !names.includes('Lat Pulldown'));
});

test('lists cover the staples of each body part', () => {
  const need = {
    back: ['Pull-up', 'Lat Pulldown', 'Barbell Row', 'Seated Row', 'Deadlift'],
    legs: ['Squat', 'Leg Press', 'Leg Extension', 'Leg Curl', 'Romanian DL', 'Walking Lunge'],
    shoulders: ['Overhead Press', 'Lateral Raise', 'Reverse Fly', 'Face Pull', 'Arnold Press'],
    biceps: ['Barbell Curl', 'Hammer Curl', 'Preacher Curl'],
    triceps: ['Triceps Pushdown', 'Skull Crusher', 'Close-Grip Bench Press'],
    glutes: ['Hip Thrust', 'Glute Bridge', 'Cable Glute Kickback'],
    calves: ['Standing Calf Raise', 'Seated Calf Raise'],
    abs: ['Crunch', 'Hanging Leg Raise', 'Ab Wheel Rollout', 'Plank (sec)'],
    cardio: ['Treadmill Run', 'Stationary Bike', 'Swim', 'Rowing Machine']
  };
  for (const id of Object.keys(need)) {
    const names = exercisesFor(id).map((entry) => entry.name);
    for (const wanted of need[id]) assert.ok(names.includes(wanted), wanted + ' missing from ' + id);
  }
  assert.ok(exercisesFor(CARDIO_ID).every((entry) => entry.type === 'cardio'));
});

test('exercisesFor returns copies the caller can change', () => {
  const first = exercisesFor('chest');
  first[0].name = 'Changed';
  assert.equal(exercisesFor('chest')[0].name, 'Bench Press');
  const entry = entryById('bench');
  entry.kg = 999;
  assert.equal(entryById('bench').kg, 60);
});

test('every library entry becomes a plan item that survives sanitizing', () => {
  const items = allExerciseIds().map((id) => makeItem(entryById(id), null));
  const day = sanitizeDay({ focus: 'Test', rest: false, items });
  assert.equal(day.items.length, items.length);
  day.items.forEach((item, index) => {
    const source = items[index];
    assert.equal(item.id, source.id);
    assert.equal(item.name, source.name);
    if (item.type === 'strength') {
      assert.equal(item.sets, source.sets);
      assert.equal(item.kg, source.kg);
    } else {
      assert.equal(item.minutes, source.minutes);
    }
  });
});

test('timed holds count seconds in steps of five', () => {
  assert.equal(entryById('plank').repStep, 5);
  assert.equal(entryById('bench').repStep, 1);
});
