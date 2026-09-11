import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  clampKey,
  dayNumberLabel,
  diffDays,
  isKey,
  resolveDateInput,
  shortLabel,
  weekKeys,
  weekdayLabel,
  yearMonthLabel
} from '../agent/lib/dates.js';

test('isKey accepts only real calendar dates', () => {
  assert.equal(isKey('2026-09-11'), true);
  assert.equal(isKey('2028-02-29'), true);
  assert.equal(isKey('2026-02-30'), false);
  assert.equal(isKey('2026-9-11'), false);
  assert.equal(isKey(20260911), false);
});

test('addDays and diffDays cross month and year boundaries', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-09-11', '2026-11-10'), 60);
  assert.equal(diffDays('2026-09-11', '2026-09-04'), -7);
});

test('resolveDateInput maps relative words and rejects junk', () => {
  const today = '2026-09-11';
  assert.deepEqual(resolveDateInput(undefined, today), { key: today, valid: true });
  assert.deepEqual(resolveDateInput('', today), { key: today, valid: true });
  assert.deepEqual(resolveDateInput('tomorrow', today), { key: '2026-09-12', valid: true });
  assert.deepEqual(resolveDateInput(' 昨天 ', today), { key: '2026-09-10', valid: true });
  assert.deepEqual(resolveDateInput('TODAY', today), { key: today, valid: true });
  assert.deepEqual(resolveDateInput('2026-10-01', today), { key: '2026-10-01', valid: true });
  assert.deepEqual(resolveDateInput('2026-02-30', today), { key: today, valid: false });
  assert.deepEqual(resolveDateInput('next friday', today), { key: today, valid: false });
  assert.deepEqual(resolveDateInput(42, today), { key: today, valid: false });
});

test('clampKey keeps the date wheel inside +/-60 days', () => {
  assert.equal(clampKey('2026-12-31', '2026-09-11', 60), '2026-11-10');
  assert.equal(clampKey('2026-01-01', '2026-09-11', 60), '2026-07-13');
  assert.equal(clampKey('2026-09-20', '2026-09-11', 60), '2026-09-20');
});

test('labels and Monday-first weeks', () => {
  assert.equal(shortLabel('2026-09-11'), '9月11日 周五');
  assert.equal(yearMonthLabel('2026-09-11'), '2026 年 9 月');
  assert.equal(dayNumberLabel('2026-09-01'), '01');
  assert.equal(weekdayLabel('2026-09-13'), '周日');
  assert.deepEqual(weekKeys('2026-09-13'), [
    '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
    '2026-09-11', '2026-09-12', '2026-09-13'
  ]);
  assert.deepEqual(weekKeys('2026-09-07')[0], '2026-09-07');
});
