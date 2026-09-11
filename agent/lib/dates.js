// Local-calendar date helpers. Keys are "YYYY-MM-DD" in the device's local time.

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

const RELATIVE_OFFSETS = {
  today: 0,
  tomorrow: 1,
  yesterday: -1,
  '今天': 0,
  '明天': 1,
  '后天': 2,
  '昨天': -1,
  '前天': -2
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function toKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' +
    pad2(date.getDate());
}

export function isKey(value) {
  if (typeof value !== 'string') return false;
  const match = KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month &&
    date.getDate() === day;
}

export function fromKey(key) {
  const match = KEY_PATTERN.exec(key);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDays(key, count) {
  const date = fromKey(key);
  date.setDate(date.getDate() + count);
  return toKey(date);
}

// Whole days from `fromKeyValue` to `toKeyValue`; rounding absorbs DST shifts.
export function diffDays(fromKeyValue, toKeyValue) {
  return Math.round((fromKey(toKeyValue).getTime() -
    fromKey(fromKeyValue).getTime()) / DAY_MS);
}

// Accepts undefined, relative words, or a real calendar date.
// Invalid input falls back to today and reports valid: false.
export function resolveDateInput(value, todayKey) {
  if (value === undefined || value === null || value === '') {
    return { key: todayKey, valid: true };
  }
  if (typeof value !== 'string') return { key: todayKey, valid: false };
  const normalized = value.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(RELATIVE_OFFSETS, normalized)) {
    return { key: addDays(todayKey, RELATIVE_OFFSETS[normalized]), valid: true };
  }
  if (isKey(normalized)) return { key: normalized, valid: true };
  return { key: todayKey, valid: false };
}

export function clampKey(key, todayKey, rangeDays) {
  const offset = diffDays(todayKey, key);
  if (offset > rangeDays) return addDays(todayKey, rangeDays);
  if (offset < -rangeDays) return addDays(todayKey, -rangeDays);
  return key;
}

export function weekdayLabel(key) {
  return WEEKDAYS[fromKey(key).getDay()];
}

export function dayNumberLabel(key) {
  return pad2(fromKey(key).getDate());
}

export function monthLabel(key) {
  const date = fromKey(key);
  return (date.getMonth() + 1) + ' 月';
}

export function yearMonthLabel(key) {
  const date = fromKey(key);
  return date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月';
}

export function shortLabel(key) {
  const date = fromKey(key);
  return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' +
    WEEKDAYS[date.getDay()];
}

export function monthDayLabel(key) {
  const date = fromKey(key);
  return (date.getMonth() + 1) + '月' + date.getDate() + '日';
}

// Monday-first week containing `key`.
export function weekKeys(key) {
  const offset = (fromKey(key).getDay() + 6) % 7;
  const monday = addDays(key, -offset);
  const keys = [];
  for (let index = 0; index < 7; index += 1) keys.push(addDays(monday, index));
  return keys;
}
