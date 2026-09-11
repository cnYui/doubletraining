import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  clampKey,
  dayNumber,
  dayNumberLabel,
  diffDays,
  isKey,
  keyFromClock,
  keyFromDayNumber,
  normalizeOffsetMinutes,
  resolveDateInput,
  shortLabel,
  weekKeys,
  weekdayLabel,
  yearMonthLabel
} from '../agent/lib/dates.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

test('day numbers match UTC calendar arithmetic', () => {
  for (const key of ['1969-12-31', '1970-01-01', '2000-02-29', '2026-09-11',
    '2026-12-31', '2100-03-01']) {
    const [year, month, day] = key.split('-').map(Number);
    assert.equal(dayNumber(key), Date.UTC(year, month - 1, day) / 86400000, key);
    assert.equal(keyFromDayNumber(dayNumber(key)), key);
  }
});

test('addDays and weekdays agree with the UTC calendar day by day', () => {
  for (let offset = -400; offset <= 400; offset += 1) {
    const expected = new Date(Date.UTC(2026, 8, 11 + offset));
    const key = addDays('2026-09-11', offset);
    assert.equal(key, expected.toISOString().slice(0, 10));
    assert.equal(weekdayLabel(key), WEEKDAYS[expected.getUTCDay()]);
  }
});

test('keyFromClock applies the device UTC offset', () => {
  const now = Date.UTC(2026, 8, 11, 1, 45);
  assert.equal(keyFromClock(now, 0), '2026-09-11');
  assert.equal(keyFromClock(now, -540), '2026-09-11');
  assert.equal(keyFromClock(now, 420), '2026-09-10');
  assert.equal(keyFromClock(now, Number.NaN), '2026-09-11');
  assert.equal(keyFromClock(now, undefined), '2026-09-11');
});

test('normalizeOffsetMinutes keeps real offsets and converts whole-minute seconds', () => {
  assert.equal(normalizeOffsetMinutes(0), 0);
  assert.equal(normalizeOffsetMinutes(-480), -480);
  assert.equal(normalizeOffsetMinutes(-840), -840);
  assert.equal(normalizeOffsetMinutes(720), 720);
  assert.equal(normalizeOffsetMinutes(-28800), -480);
  assert.equal(normalizeOffsetMinutes(-20700), -345);
  assert.equal(normalizeOffsetMinutes(-50460), 0);
  assert.equal(normalizeOffsetMinutes(-50401), 0);
  assert.equal(normalizeOffsetMinutes(1e9), 0);
  assert.equal(normalizeOffsetMinutes(Number.NaN), 0);
  assert.equal(normalizeOffsetMinutes('-480'), 0);
});

test('keyFromClock survives an offset reported in seconds', () => {
  // 12:23 on Sep 11 in UTC+8, when the chat card opened on Oct 1.
  const noon = Date.UTC(2026, 8, 11, 4, 23);
  assert.equal(keyFromClock(noon, -28800), '2026-09-11');
  assert.equal(keyFromClock(noon, -480), '2026-09-11');
  // 01:00 on Sep 11 in UTC+8 is still Sep 10 in UTC.
  const night = Date.UTC(2026, 8, 10, 17, 0);
  assert.equal(keyFromClock(night, -28800), '2026-09-11');
  assert.equal(keyFromClock(night, 0), '2026-09-10');
});

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
  assert.deepEqual(resolveDateInput(' Yesterday ', today), { key: '2026-09-10', valid: true });
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
  assert.equal(shortLabel('2026-09-11'), 'Fri, Sep 11');
  assert.equal(yearMonthLabel('2026-09-11'), 'Sep 2026');
  assert.equal(dayNumberLabel('2026-09-01'), '01');
  assert.equal(weekdayLabel('2026-09-13'), 'Sun');
  assert.deepEqual(weekKeys('2026-09-13'), [
    '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
    '2026-09-11', '2026-09-12', '2026-09-13'
  ]);
  assert.deepEqual(weekKeys('2026-09-07')[0], '2026-09-07');
});
