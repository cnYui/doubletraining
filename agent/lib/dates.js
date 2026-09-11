// Calendar helpers. Keys are "YYYY-MM-DD".
//
// All calendar math is integer arithmetic on day numbers (days since
// 1970-01-01, proleptic Gregorian). In the AIUI Studio 1.1.0 simulator,
// Date objects built from components and moved with setDate() drifted by
// weeks to months between calls, so nothing here constructs a Date from a
// year/month/day; "today" comes only from Date.now() and the UTC offset.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

const RELATIVE_OFFSETS = {
  today: 0,
  tomorrow: 1,
  yesterday: -1
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

// Howard Hinnant's days_from_civil / civil_from_days.
function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = (month + 9) % 12;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days) {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) +
    Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

function parseKey(key) {
  const match = typeof key === 'string' ? KEY_PATTERN.exec(key) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

export function isKey(value) {
  return parseKey(value) !== null;
}

export function dayNumber(key) {
  const parts = parseKey(key);
  return daysFromCivil(parts.year, parts.month, parts.day);
}

export function keyFromDayNumber(days) {
  const parts = civilFromDays(days);
  return String(parts.year).padStart(4, '0') + '-' + pad2(parts.month) + '-' +
    pad2(parts.day);
}

// Real offsets lie within UTC-12..UTC+14, i.e. -840..720 minutes. The Studio
// /debug chat card put "today" exactly 20 days ahead, which matches UTC+8
// reported in seconds (-28800) instead of minutes (-480). A whole number of
// minutes written in seconds is converted; anything else out of range falls
// back to UTC.
const MAX_OFFSET_MINUTES = 840;

export function normalizeOffsetMinutes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (Math.abs(value) <= MAX_OFFSET_MINUTES) return value;
  const minutes = value / 60;
  if (Number.isInteger(minutes) && Math.abs(minutes) <= MAX_OFFSET_MINUTES) return minutes;
  return 0;
}

// `offsetMinutes` follows Date#getTimezoneOffset: UTC = local + offset.
export function keyFromClock(nowMs, offsetMinutes) {
  const offset = normalizeOffsetMinutes(offsetMinutes);
  return keyFromDayNumber(Math.floor((nowMs - offset * 60000) / DAY_MS));
}

export function todayKey() {
  let offset = 0;
  try {
    offset = new Date().getTimezoneOffset();
  } catch (error) {
    offset = 0;
  }
  return keyFromClock(Date.now(), offset);
}

// Midnight UTC of the key's day; used for synthetic example timestamps.
export function dayStartMs(key) {
  return dayNumber(key) * DAY_MS;
}

export function addDays(key, count) {
  return keyFromDayNumber(dayNumber(key) + count);
}

export function diffDays(fromKeyValue, toKeyValue) {
  return dayNumber(toKeyValue) - dayNumber(fromKeyValue);
}

// Accepts undefined, relative words, or a real calendar date.
// Invalid input falls back to today and reports valid: false.
export function resolveDateInput(value, today) {
  if (value === undefined || value === null || value === '') {
    return { key: today, valid: true };
  }
  if (typeof value !== 'string') return { key: today, valid: false };
  const normalized = value.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(RELATIVE_OFFSETS, normalized)) {
    return { key: addDays(today, RELATIVE_OFFSETS[normalized]), valid: true };
  }
  if (isKey(normalized)) return { key: normalized, valid: true };
  return { key: today, valid: false };
}

export function clampKey(key, today, rangeDays) {
  const offset = diffDays(today, key);
  if (offset > rangeDays) return addDays(today, rangeDays);
  if (offset < -rangeDays) return addDays(today, -rangeDays);
  return key;
}

// 0 = Sunday; 1970-01-01 was a Thursday.
function weekdayIndex(key) {
  return (((dayNumber(key) + 4) % 7) + 7) % 7;
}

export function weekdayLabel(key) {
  return WEEKDAYS[weekdayIndex(key)];
}

export function dayNumberLabel(key) {
  return pad2(parseKey(key).day);
}

export function monthLabel(key) {
  return MONTHS[parseKey(key).month - 1];
}

// "Sep 2026"
export function yearMonthLabel(key) {
  const parts = parseKey(key);
  return MONTHS[parts.month - 1] + ' ' + parts.year;
}

// "Fri, Sep 11"
export function shortLabel(key) {
  const parts = parseKey(key);
  return WEEKDAYS[weekdayIndex(key)] + ', ' + MONTHS[parts.month - 1] + ' ' + parts.day;
}

// "Sep 11"
export function monthDayLabel(key) {
  const parts = parseKey(key);
  return MONTHS[parts.month - 1] + ' ' + parts.day;
}

// Monday-first week containing `key`.
export function weekKeys(key) {
  const monday = addDays(key, -((weekdayIndex(key) + 6) % 7));
  const keys = [];
  for (let index = 0; index < 7; index += 1) keys.push(addDays(monday, index));
  return keys;
}
