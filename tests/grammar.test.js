import test from 'node:test';
import assert from 'node:assert/strict';
import { numberize, parseCommand } from '../agent/lib/grammar.js';
import { templateDay } from '../agent/lib/workout.js';

const CHEST = templateDay('chest');

test('numberize turns spoken numbers into digits and leaves words alone', () => {
  assert.equal(numberize('eighty two point five'), '82.5');
  assert.equal(numberize('a hundred'), '100');
  assert.equal(numberize('one hundred and five kilos'), '105 kilos');
  assert.equal(numberize('five sets of five at a hundred kilos'), '5 sets of 5 at 100 kilos');
  assert.equal(numberize('Bench press twelve reps'), 'bench press 12 reps');
  assert.equal(numberize('add squat 5x5 at 100'), 'add squat 5x5 at 100');
  assert.equal(numberize('point five'), 'point 5');
  assert.equal(numberize('my week is chest, back, rest'), 'my week is chest, back, rest');
});

test('add commands with sets, reps, optional weight, or minutes', () => {
  assert.deepEqual(parseCommand('Add squat, five sets of five at a hundred kilos', CHEST),
    { name: 'add_exercise', args: { name: 'squat', sets: 5, reps: 5, kg: 100 } });
  assert.deepEqual(parseCommand('add the dumbbell curl three by twelve', CHEST),
    { name: 'add_exercise', args: { name: 'dumbbell curl', sets: 3, reps: 12 } });
  assert.deepEqual(parseCommand('add leg press 4 x 10 with 160 kg', CHEST),
    { name: 'add_exercise', args: { name: 'leg press', sets: 4, reps: 10, kg: 160 } });
  assert.deepEqual(parseCommand('add bike twenty minutes', CHEST),
    { name: 'add_exercise', args: { name: 'bike', minutes: 20 } });
  assert.equal(parseCommand('add squat', CHEST), null, 'no sets and reps: let the model ask');
});

test('update commands only match exercises on the day', () => {
  assert.deepEqual(parseCommand('bench press eighty two point five', CHEST),
    { name: 'update_exercise', args: { name: 'bench press', kg: 82.5 } });
  assert.deepEqual(parseCommand('Bench press to 85 kg.', CHEST),
    { name: 'update_exercise', args: { name: 'bench press', kg: 85 } });
  assert.deepEqual(parseCommand('pec deck 15 reps', CHEST),
    { name: 'update_exercise', args: { name: 'pec deck', reps: 15 } });
  assert.deepEqual(parseCommand('change incline dumbbell press to four sets', CHEST),
    { name: 'update_exercise', args: { name: 'incline dumbbell press', sets: 4 } });
  assert.deepEqual(parseCommand('swim forty five minutes', CHEST),
    { name: 'update_exercise', args: { name: 'swim', minutes: 45 } });
  assert.equal(parseCommand('deadlift 140', CHEST), null, 'unknown exercise goes to the model');
  assert.equal(parseCommand('bench press', CHEST), null);
});

test('remove, adjust, assign, and week commands', () => {
  assert.deepEqual(parseCommand('remove cable crossover', CHEST),
    { name: 'remove_exercise', args: { name: 'cable crossover' } });
  assert.deepEqual(parseCommand('Adjust squat', CHEST),
    { name: 'adjust_weight', args: { name: 'squat' } });
  assert.deepEqual(parseCommand('tune the bench press weight', CHEST),
    { name: 'adjust_weight', args: { name: 'bench press' } });
  assert.deepEqual(parseCommand('set Monday as leg day', CHEST),
    { name: 'assign_day', args: { day: 'monday', focus: 'legs' } });
  assert.deepEqual(parseCommand('tomorrow is a rest day', CHEST),
    { name: 'assign_day', args: { day: 'tomorrow', focus: 'rest' } });
  assert.deepEqual(parseCommand('make Wednesday shoulders', CHEST),
    { name: 'assign_day', args: { day: 'wednesday', focus: 'shoulders' } });
  assert.deepEqual(parseCommand('My week is chest, back, rest, legs, shoulders, rest and rest', CHEST),
    { name: 'set_week', args: { days: ['chest', 'back', 'rest', 'legs', 'shoulders', 'rest', 'rest'] } });
  assert.equal(parseCommand('my week is chest, back', CHEST), null);
  assert.equal(parseCommand('what should I do today', CHEST), null);
  assert.equal(parseCommand('', CHEST), null);
});
