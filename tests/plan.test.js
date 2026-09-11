import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_TOOLS,
  addExercise,
  applyCommand,
  assignFocus,
  buildSystemPrompt,
  findItemIndex,
  localCommand,
  nudgeKg,
  removeExercise,
  resolveDayRef,
  setWeek,
  toNumber,
  updateExercise,
  weekdayKey
} from '../agent/lib/plan.js';
import { seedDays, templateDay } from '../agent/lib/workout.js';

// 2026-09-11 is a Friday; the seed puts Chest on it with nothing logged.
const TODAY = '2026-09-11';

function days() {
  return seedDays(TODAY);
}

test('weekday references resolve to the upcoming occurrence, today included', () => {
  assert.equal(weekdayKey(TODAY, 'friday'), '2026-09-11');
  assert.equal(weekdayKey(TODAY, 'saturday'), '2026-09-12');
  assert.equal(weekdayKey(TODAY, 'Monday'), '2026-09-14');
  assert.equal(weekdayKey(TODAY, 'funday'), null);
  assert.equal(resolveDayRef('tomorrow', TODAY), '2026-09-12');
  assert.equal(resolveDayRef('2026-10-01', TODAY), '2026-10-01');
  assert.equal(resolveDayRef('someday', TODAY), null);
  assert.equal(resolveDayRef('', TODAY), null);
});

test('findItemIndex tolerates spoken variants of exercise names', () => {
  const chest = templateDay('chest');
  assert.equal(findItemIndex(chest, 'bench press'), 0);
  assert.equal(findItemIndex(chest, 'Bench'), 0);
  assert.equal(findItemIndex(chest, 'incline dumbbell press'), 1);
  assert.equal(findItemIndex(chest, 'the pec deck'), 2);
  assert.equal(findItemIndex(chest, 'crossover'), 3);
  assert.equal(findItemIndex(chest, 'swimming'), 4, 'prefix of a spoken variant');
  assert.equal(findItemIndex(chest, 'swim'), 4);
  assert.equal(findItemIndex(chest, 'deadlift'), -1);
  assert.equal(findItemIndex(templateDay('legs'), 'romanian deadlift'), 1);
  assert.equal(findItemIndex(templateDay('shoulders'), 'ohp'), 0);
  assert.equal(findItemIndex(templateDay('back'), 'pullups'), 0);
  assert.equal(findItemIndex(null, 'bench'), -1);
});

test('assignFocus copies a template and refuses days with logged sets', () => {
  const result = assignFocus(days(), '2026-09-14', 'Leg day');
  assert.equal(result.ok, true);
  assert.equal(result.days['2026-09-14'].focus, 'Legs');
  assert.equal(result.days['2026-09-14'].items[0].log.length, 0);
  assert.match(result.message, /Legs assigned to Mon, Sep 14/);
  assert.equal(days()['2026-09-14'].focus, 'Shoulders', 'the seed keeps Shoulders: input is not mutated');

  const rest = assignFocus(days(), '2026-09-14', 'off');
  assert.equal(rest.days['2026-09-14'].rest, true);

  const logged = assignFocus(days(), '2026-09-04', 'back');
  assert.equal(logged.ok, false);
  assert.match(logged.message, /already has logged sets/);

  assert.equal(assignFocus(days(), '2026-09-14', 'arms').ok, false);
});

test('setWeek assigns the current Monday-first week from today on', () => {
  const result = setWeek(days(), TODAY, ['chest', 'back', 'rest', 'legs', 'shoulders', 'rest', 'rest']);
  assert.equal(result.ok, true);
  // Mon–Thu are over (Thu has logged sets too); Fri, Sat, Sun change.
  assert.equal(result.days['2026-09-11'].focus, 'Shoulders');
  assert.equal(result.days['2026-09-12'].rest, true);
  assert.equal(result.days['2026-09-13'].rest, true);
  assert.equal(result.days['2026-09-10'].focus, 'Back', 'past day untouched');
  assert.equal(result.editKey, '2026-09-11');
  assert.match(result.message, /kept Mon, Tue, Wed, Thu/);

  assert.equal(setWeek(days(), TODAY, ['chest']).ok, false);
  assert.equal(setWeek(days(), TODAY, ['chest', 'arms', 'rest', 'legs', 'shoulders', 'rest', 'rest']).ok, false);
});

test('addExercise creates strength or cardio items with unique ids', () => {
  let map = days();
  let result = addExercise(map, TODAY, { name: 'bench press', sets: 3, reps: 10, kg: '60' });
  assert.equal(result.ok, true);
  const added = result.days[TODAY].items[5];
  assert.equal(added.id, 'bench-press');
  assert.equal(added.name, 'Bench Press');
  assert.deepEqual([added.sets, added.reps, added.kg, added.step], [3, 10, 60, 2.5]);
  assert.equal(result.adjust, false);
  map = result.days;

  result = addExercise(map, TODAY, { name: 'Bench press', sets: 2, reps: 20, kg: 40 });
  assert.equal(result.days[TODAY].items[6].id, 'bench-press-2', 'same name twice gets a suffix');

  result = addExercise(map, TODAY, { name: 'row', minutes: 15 });
  assert.equal(result.days[TODAY].items[6].type, 'cardio');
  assert.equal(result.days[TODAY].items[6].minutes, 15);

  result = addExercise(map, TODAY, { name: 'dumbbell curl', sets: 3, reps: 12 });
  assert.equal(result.ok, true);
  assert.equal(result.adjust, true, 'no weight said: ask for temple adjustment');
  assert.equal(result.days[TODAY].items[6].kg, 0);
  assert.equal(result.days[TODAY].items[6].step, 2, 'dumbbell steps by 2 kg');
  assert.match(result.message, /swipe to set the weight/);

  assert.equal(addExercise(map, TODAY, { name: 'squat', sets: 3 }).ok, false);
  assert.equal(addExercise(map, TODAY, { name: '', sets: 3, reps: 5 }).ok, false);
  assert.equal(addExercise(map, TODAY, { name: 'squat', sets: 3, reps: 5, kg: 5000 }).ok, false);

  const restDay = addExercise(map, '2026-09-13', { name: 'Plank', sets: 3, reps: 1, kg: 0 });
  assert.equal(restDay.ok, true);
  assert.equal(restDay.days['2026-09-13'].rest, false, 'a rest day becomes a training day');
  assert.equal(restDay.days['2026-09-13'].focus, 'Training');
});

test('updateExercise changes only the named fields and guards logged sets', () => {
  const result = updateExercise(days(), TODAY, 'bench', { kg: 82.5, reps: '6' });
  assert.equal(result.ok, true);
  assert.equal(result.days[TODAY].items[0].kg, 82.5);
  assert.equal(result.days[TODAY].items[0].reps, 6);
  assert.equal(result.days[TODAY].items[0].sets, 5);
  assert.match(result.message, /Bench Press: reps 8 → 6, 80 kg → 82.5 kg/);

  const renamed = updateExercise(days(), TODAY, 'swim', { name: 'pool swim', minutes: 45 });
  assert.equal(renamed.days[TODAY].items[4].name, 'Pool Swim');
  assert.equal(renamed.days[TODAY].items[4].minutes, 45);

  assert.equal(updateExercise(days(), TODAY, 'deadlift', { kg: 100 }).ok, false);
  assert.equal(updateExercise(days(), TODAY, 'bench', {}).ok, false);
  // 2026-09-10 (Back, partial): the last item has one logged set.
  const partial = updateExercise(days(), '2026-09-10', 'seated row', { sets: 0 });
  assert.equal(partial.ok, false);
  assert.equal(updateExercise(days(), '2026-09-10', 'pull-up', { sets: 2 }).ok, false, 'below logged sets');
});

test('removeExercise refuses items with logged work', () => {
  const removed = removeExercise(days(), TODAY, 'cable crossover');
  assert.equal(removed.ok, true);
  assert.equal(removed.days[TODAY].items.length, 4);
  assert.equal(removeExercise(days(), '2026-09-10', 'pull up').ok, false);
  assert.equal(removeExercise(days(), TODAY, 'leg press').ok, false);
});

test('nudgeKg moves by the item step and stops at bodyweight', () => {
  const up = nudgeKg(days(), TODAY, 0, 1);
  assert.equal(up[TODAY].items[0].kg, 82.5);
  assert.equal(nudgeKg(days(), '2026-09-10', 0, -1), null, 'pull-up is already bodyweight');
  assert.equal(nudgeKg(days(), TODAY, 4, 1), null, 'cardio has no weight');
});

test('localCommand catches undo and done without the model', () => {
  assert.equal(localCommand('Undo.'), 'undo');
  assert.equal(localCommand('undo that'), 'undo');
  assert.equal(localCommand("I'm done"), 'finish');
  assert.equal(localCommand('Done!'), 'finish');
  assert.equal(localCommand('add squat'), null);
  assert.equal(localCommand(''), null);
});

test('toNumber accepts numbers and numeric strings only', () => {
  assert.equal(toNumber(82.5), 82.5);
  assert.equal(toNumber(' 100 '), 100);
  assert.equal(toNumber('eighty'), null);
  assert.equal(toNumber(Number.NaN), null);
  assert.equal(toNumber(null), null);
});

test('applyCommand routes model tool calls to the plan operations', () => {
  const context = { todayKey: TODAY, editKey: TODAY };
  let map = days();

  let outcome = applyCommand(map, context, { name: 'add_exercise', args: { name: 'Squat', sets: 5, reps: 5, kg: 100 } });
  assert.equal(outcome.kind, 'change');
  assert.equal(outcome.changedId, 'squat');
  map = outcome.days;

  outcome = applyCommand(map, context, { name: 'add_exercise', args: { name: 'Bike', minutes: 20, day: 'tomorrow' } });
  assert.equal(outcome.editKey, '2026-09-12', 'a named day moves the editor there');
  assert.equal(outcome.days['2026-09-12'].items.length, 6);
  map = outcome.days;

  outcome = applyCommand(map, context, { name: 'update_exercise', args: { name: 'squat', kg: '102.5', new_name: 'Back Squat' } });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.days[TODAY].items[5].name, 'Back Squat');
  assert.equal(outcome.days[TODAY].items[5].kg, 102.5);
  map = outcome.days;

  outcome = applyCommand(map, context, { name: 'adjust_weight', args: { name: 'back squat' } });
  assert.equal(outcome.kind, 'adjust');
  assert.equal(outcome.adjust, true);
  assert.equal(outcome.changedId, 'squat');
  assert.equal(outcome.days, map, 'adjusting changes nothing by itself');

  outcome = applyCommand(map, context, { name: 'adjust_weight', args: { name: 'swim' } });
  assert.equal(outcome.ok, false);

  outcome = applyCommand(map, context, { name: 'assign_day', args: { day: 'monday', focus: 'legs' } });
  assert.equal(outcome.days['2026-09-14'].focus, 'Legs');
  assert.equal(outcome.editKey, '2026-09-14');

  outcome = applyCommand(map, context, { name: 'set_week', args: { days: ['chest', 'back', 'rest', 'legs', 'shoulders', 'rest', 'rest'] } });
  assert.equal(outcome.kind, 'change');

  outcome = applyCommand(map, context, { name: 'remove_exercise', args: { name: 'swim' } });
  assert.equal(outcome.ok, true);

  assert.equal(applyCommand(map, context, { name: 'undo', args: {} }).kind, 'undo');
  assert.equal(applyCommand(map, context, { name: 'finish' }).kind, 'finish');
  assert.equal(applyCommand(map, context, { name: 'assign_day', args: { focus: 'legs' } }).ok, false);
  assert.equal(applyCommand(map, context, { name: 'teleport', args: {} }).ok, false);
  assert.equal(applyCommand(map, context, null).ok, false);
});

test('tool declarations and the system prompt describe the day being edited', () => {
  const names = PLAN_TOOLS.map((tool) => tool.function.name);
  assert.deepEqual(names, ['set_week', 'assign_day', 'add_exercise', 'update_exercise', 'remove_exercise', 'adjust_weight', 'undo', 'finish']);
  for (const tool of PLAN_TOOLS) {
    assert.equal(tool.type, 'function');
    assert.equal(tool.function.parameters.type, 'object');
  }
  const prompt = buildSystemPrompt({ todayKey: TODAY, editKey: TODAY, day: days()[TODAY] });
  assert.match(prompt, /Today is Fri, Sep 11 \(2026-09-11\)/);
  assert.match(prompt, /Chest: Bench Press 5 × 8 · 80 kg; Incline DB Press/);
  assert.match(prompt, /exactly one tool/);
  const empty = buildSystemPrompt({ todayKey: TODAY, editKey: '2026-10-01', day: undefined });
  assert.match(empty, /nothing planned/);
  const rest = buildSystemPrompt({ todayKey: TODAY, editKey: '2026-09-13', day: days()['2026-09-13'] });
  assert.match(rest, /rest day/);
});
