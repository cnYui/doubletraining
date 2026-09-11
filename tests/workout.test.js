import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustKg,
  cardioMinutes,
  dayStatus,
  daySummaryLabel,
  dayTotals,
  durationMinutes,
  firstOpenIndex,
  focusChip,
  formatClock,
  formatDelta,
  formatKg,
  formatThousands,
  kgDeltas,
  logSet,
  markCardioDone,
  nextOpenIndex,
  prescription,
  previousSameFocusKey,
  progressRatio,
  sanitizeDay,
  sanitizeDays,
  seedDays,
  tonnage,
  undoLastSet,
  weekProgress
} from '../agent/lib/workout.js';

const TODAY = '2026-09-11';

function completeDay(day) {
  let current = day;
  let at = Date.UTC(2026, 8, 11, 9, 0);
  current.items.forEach((item, index) => {
    if (item.type === 'cardio') {
      current = markCardioDone(current, index, at);
      return;
    }
    for (let set = 0; set < item.sets; set += 1) {
      at += 180000;
      current = logSet(current, index, at).day;
    }
  });
  return current;
}

test('seed places a chest day today and history around it', () => {
  const days = seedDays(TODAY);
  const today = days[TODAY];
  assert.equal(today.focus, 'Chest');
  assert.deepEqual(today.items.map((item) => item.name),
    ['Bench Press', 'Incline DB Press', 'Pec Deck', 'Cable Crossover', 'Swim']);
  assert.equal(dayStatus(today), 'planned');
  assert.equal(daySummaryLabel(today), '5 exercises · 15 sets');
  assert.equal(dayStatus(days['2026-09-04']), 'done');
  assert.equal(daySummaryLabel(days['2026-09-04']), 'Done');
  assert.equal(days['2026-09-04'].items[0].kg, 77.5);
  assert.equal(dayStatus(days['2026-09-10']), 'partial');
  assert.equal(daySummaryLabel(days['2026-09-10']), '12 / 14 sets');
  assert.equal(dayStatus(days['2026-09-09']), 'rest');
  assert.equal(daySummaryLabel(days['2026-09-09']), 'Rest day');
  assert.equal(focusChip(days['2026-09-09']), 'Rest');
  assert.equal(dayStatus(days['2026-09-17']), 'none');
  assert.equal(daySummaryLabel(undefined), 'Not planned');
  assert.equal(focusChip(undefined), '—');
});

test('summary labels use singular forms for one', () => {
  const single = {
    focus: 'Core',
    rest: false,
    items: [{ id: 'plank', name: 'Plank', type: 'strength', sets: 1, reps: 1, kg: 0,
      step: 2.5, restSec: 60, log: [] }]
  };
  assert.equal(daySummaryLabel(single), '1 exercise · 1 set');
});

test('week progress counts planned training days Monday to Sunday', () => {
  assert.deepEqual(weekProgress(seedDays(TODAY), TODAY), { planned: 5, done: 2 });
});

test('logSet records plan values immutably and stops at the set count', () => {
  const day = seedDays(TODAY)[TODAY];
  assert.equal(firstOpenIndex(day), 0);
  const first = logSet(day, 0, 1000);
  assert.deepEqual(first.set, { itemIndex: 0, name: 'Bench Press', number: 1, kg: 80, reps: 8 });
  assert.equal(day.items[0].log.length, 0, 'original day is untouched');
  let current = first.day;
  for (let set = 2; set <= 5; set += 1) current = logSet(current, 0, set * 1000).day;
  assert.equal(logSet(current, 0, 9000), null);
  assert.equal(nextOpenIndex(current, 0), 1);
  assert.equal(logSet(current, 4, 9000), null, 'cardio is not logged as a set');
  assert.equal(dayTotals(current).doneSets, 5);
});

test('undo, weight steps, and cardio completion', () => {
  const day = seedDays(TODAY)[TODAY];
  const logged = logSet(day, 0, 1000).day;
  assert.equal(undoLastSet(logged, 0).items[0].log.length, 0);
  assert.equal(undoLastSet(day, 0), null);
  assert.equal(adjustKg(day, 0, 1).items[0].kg, 82.5);
  assert.equal(adjustKg(day, 1, -1).items[1].kg, 24);
  const back = seedDays(TODAY)['2026-09-15'];
  assert.equal(back.items[0].name, 'Pull-up');
  assert.equal(adjustKg(back, 0, -1), null, 'bodyweight cannot go below zero');
  const swum = markCardioDone(day, 4, 5000);
  assert.equal(swum.items[4].doneAt, 5000);
  assert.equal(markCardioDone(swum, 4, 6000), null);
});

test('nextOpenIndex wraps to skipped earlier items', () => {
  let day = seedDays(TODAY)[TODAY];
  day = markCardioDone(day, 4, 1);
  for (let set = 0; set < 3; set += 1) day = logSet(day, 3, set).day;
  assert.equal(nextOpenIndex(day, 3), 0);
});

test('a completed chest day summarises tonnage and compares with last week', () => {
  const days = seedDays(TODAY);
  const done = completeDay(days[TODAY]);
  assert.equal(dayStatus(done), 'done');
  assert.equal(progressRatio(done), 1);
  assert.equal(tonnage(done), 6580);
  assert.equal(cardioMinutes(done), 30);
  assert.equal(durationMinutes(done), 42);
  days[TODAY] = done;
  const previousKey = previousSameFocusKey(days, TODAY);
  assert.equal(previousKey, '2026-09-04');
  assert.deepEqual(kgDeltas(done, days[previousKey]), [
    { name: 'Bench Press', delta: 2.5 },
    { name: 'Incline DB Press', delta: 0 },
    { name: 'Pec Deck', delta: 5 },
    { name: 'Cable Crossover', delta: 0 }
  ]);
});

test('formatting helpers', () => {
  assert.equal(formatKg(0), 'BW');
  assert.equal(formatKg(77.5), '77.5');
  assert.equal(formatKg(80), '80');
  assert.equal(formatDelta(0), 'same');
  assert.equal(formatDelta(2.5), '+2.5 kg');
  assert.equal(formatDelta(-5), '-5 kg');
  assert.equal(formatThousands(6580), '6,580');
  assert.equal(formatThousands(1234567), '1,234,567');
  assert.equal(formatThousands(999), '999');
  assert.equal(formatClock(90000), '01:30');
  assert.equal(formatClock(89001), '01:30');
  assert.equal(formatClock(-5), '00:00');
  const days = seedDays(TODAY);
  assert.equal(prescription(days[TODAY].items[0]), '5 × 8 · 80 kg');
  assert.equal(prescription(days['2026-09-15'].items[0]), '4 × 8 · BW');
  assert.equal(prescription(days[TODAY].items[4]), '30 min');
});

test('sanitizeDay drops malformed items and clamps untrusted data', () => {
  const clean = sanitizeDay({
    focus: 'Chest'.repeat(10),
    items: [
      { id: 'a', name: 'Bench Press', type: 'strength', sets: 2, reps: 8, kg: 60, step: 0, restSec: 5,
        log: [{ reps: 8, kg: 60, at: 1 }, { reps: 8, kg: 60, at: 2 }, { reps: 8, kg: 60, at: 3 }] },
      { id: 'a', name: 'Duplicate', type: 'strength', sets: 1, reps: 1, kg: 1 },
      { id: 'b', name: '', type: 'strength', sets: 1, reps: 1, kg: 1 },
      { id: 'c', name: 'Bad data', type: 'strength', sets: 0, reps: 1, kg: 1 },
      { id: 'd', name: 'Run', type: 'cardio', minutes: 20, doneAt: 'x' },
      { id: 'e', name: 'Magic', type: 'spell' },
      null
    ]
  });
  assert.equal(Array.from(clean.focus).length, 24);
  assert.deepEqual(clean.items.map((item) => item.id), ['a', 'd']);
  assert.equal(clean.items[0].log.length, 2);
  assert.equal(clean.items[0].step, 2.5);
  assert.equal(clean.items[0].restSec, 90);
  assert.equal(clean.items[1].doneAt, null);
  assert.deepEqual(sanitizeDay({ rest: true, items: [{ id: 'x' }] }),
    { focus: 'Rest', rest: true, items: [] });
  assert.equal(sanitizeDay('nope'), null);
  assert.deepEqual(Object.keys(sanitizeDays({ '2026-09-11': {}, 'bad': {}, '2026-02-30': {} })),
    ['2026-09-11']);
});
