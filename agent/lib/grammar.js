// Local grammar for the plan editor: the common spoken commands become tool
// calls without a model round trip (Studio's model took 7–90 s per answer).
// Anything the grammar does not match goes to the language model.
import { WEEKDAY_NAMES, findItemIndex, normalizeFocus } from './plan.js';

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const FOCUS_WORDS = 'chest|back|legs?|shoulders?|rest|off|push|pull|delts';
const NUMBER = '(\\d+(?:\\.\\d+)?)';
const KG = '(?:\\s*(?:kg|kilos?|kilograms?))?';

function isDigitWord(token) {
  return Object.prototype.hasOwnProperty.call(UNITS, token) && UNITS[token] <= 9;
}

// Replaces spoken numbers with digits: "eighty two point five" → "82.5",
// "a hundred and five" → "105", "five" → "5". Other words are untouched.
export function numberize(text) {
  const tokens = String(text || '').toLowerCase().replace(/[,;:!?。！？]/g, ' , ').replace(/\s+/g, ' ').trim().split(' ');
  const out = [];
  let index = 0;
  while (index < tokens.length) {
    const start = index;
    let value = 0;
    let current = 0;
    let seen = false;
    let fraction = '';
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === 'a' && tokens[index + 1] === 'hundred') { index += 1; continue; }
      if (Object.prototype.hasOwnProperty.call(UNITS, token)) {
        current += UNITS[token]; seen = true; index += 1;
      } else if (Object.prototype.hasOwnProperty.call(TENS, token)) {
        current += TENS[token]; seen = true; index += 1;
      } else if (token === 'hundred') {
        current = (current || 1) * 100; seen = true; index += 1;
      } else if (token === 'and' && seen && index + 1 < tokens.length &&
        (Object.prototype.hasOwnProperty.call(UNITS, tokens[index + 1]) || Object.prototype.hasOwnProperty.call(TENS, tokens[index + 1]))) {
        index += 1;
      } else if (token === 'point' && seen && index + 1 < tokens.length && isDigitWord(tokens[index + 1])) {
        index += 1;
        while (index < tokens.length && isDigitWord(tokens[index])) {
          fraction += String(UNITS[tokens[index]]);
          index += 1;
        }
        break;
      } else {
        break;
      }
    }
    if (seen) {
      value = current;
      out.push(String(value) + (fraction ? '.' + fraction : ''));
      continue;
    }
    out.push(tokens[start]);
    index = start + 1;
  }
  return out.join(' ').replace(/\s*,\s*/g, ', ').trim();
}

function clean(text) {
  return numberize(text).replace(/[.]+$/, '').replace(/\bx\b/g, 'x').trim();
}

function number(value) {
  return Number(value);
}

function stripArticles(name) {
  return name.replace(/^(?:the|my|a|an)\s+/, '').replace(/\s+(?:exercise|lift)$/, '').trim();
}

function known(day, name) {
  return findItemIndex(day, name) >= 0;
}

// Returns { name, args } for a recognised command, else null.
// `day` is the day being edited; it disambiguates "bench 82.5" from noise.
export function parseCommand(transcript, day) {
  const text = clean(transcript);
  if (!text) return null;
  let match;

  match = /^(?:my )?(?:week|this week|next week)(?: is| will be|:)?\s+(.+)$/.exec(text);
  if (match) {
    const parts = match[1].split(/\s*,\s*|\s+(?:and|then)\s+/).map((part) => part.trim()).filter(Boolean);
    const focuses = parts.map((part) => normalizeFocus(part.replace(/\s+day$/, '')));
    if (focuses.length === 7 && focuses.every(Boolean)) return { name: 'set_week', args: { days: focuses } };
    return null;
  }

  match = new RegExp('^(?:set|make)\\s+(today|tomorrow|' + WEEKDAY_NAMES.join('|') + ')\\s+(?:as|to|a|an)?\\s*(' + FOCUS_WORDS + ')(?:\\s+day)?$').exec(text);
  if (match) {
    const focus = normalizeFocus(match[2]);
    return focus ? { name: 'assign_day', args: { day: match[1], focus } } : null;
  }
  match = new RegExp('^(today|tomorrow|' + WEEKDAY_NAMES.join('|') + ')\\s+(?:is|will be)\\s+(?:a|an)?\\s*(' + FOCUS_WORDS + ')(?:\\s+day)?$').exec(text);
  if (match) {
    const focus = normalizeFocus(match[2]);
    return focus ? { name: 'assign_day', args: { day: match[1], focus } } : null;
  }

  match = new RegExp('^(?:add|put in|put)\\s+(.+?),?\\s+' + NUMBER + '\\s*(?:sets?\\s+of|sets?\\s+by|by|x|×|times)\\s*' + NUMBER +
    '(?:\\s*(?:reps?))?(?:,?\\s+(?:at|with|using)\\s+' + NUMBER + KG + ')?$').exec(text);
  if (match) {
    const args = { name: stripArticles(match[1]), sets: number(match[2]), reps: number(match[3]) };
    if (match[4] !== undefined) args.kg = number(match[4]);
    return { name: 'add_exercise', args };
  }
  match = new RegExp('^(?:add|put in|put)\\s+(.+?),?\\s+' + NUMBER + '\\s*(?:min|mins|minutes)(?:\\s+of\\s+cardio)?$').exec(text);
  if (match) return { name: 'add_exercise', args: { name: stripArticles(match[1]), minutes: number(match[2]) } };

  match = /^(?:remove|delete|drop|take out)\s+(.+)$/.exec(text);
  if (match) return { name: 'remove_exercise', args: { name: stripArticles(match[1]) } };

  match = /^(?:adjust|tune|tweak|change)\s+(?:the\s+)?(.+?)(?:\s+weight)?$/.exec(text);
  if (match && !/\d/.test(match[1])) return { name: 'adjust_weight', args: { name: stripArticles(match[1]) } };

  match = new RegExp('^(?:change\\s+|set\\s+)?(.+?)\\s+(?:to\\s+|at\\s+)?' + NUMBER + '\\s*(?:reps?)$').exec(text);
  if (match && known(day, stripArticles(match[1]))) {
    return { name: 'update_exercise', args: { name: stripArticles(match[1]), reps: number(match[2]) } };
  }
  match = new RegExp('^(?:change\\s+|set\\s+)?(.+?)\\s+(?:to\\s+|at\\s+)?' + NUMBER + '\\s*(?:sets?)$').exec(text);
  if (match && known(day, stripArticles(match[1]))) {
    return { name: 'update_exercise', args: { name: stripArticles(match[1]), sets: number(match[2]) } };
  }
  match = new RegExp('^(?:change\\s+|set\\s+)?(.+?)\\s+(?:to\\s+|at\\s+)?' + NUMBER + KG + '$').exec(text);
  if (match && known(day, stripArticles(match[1]))) {
    return { name: 'update_exercise', args: { name: stripArticles(match[1]), kg: number(match[2]) } };
  }
  match = new RegExp('^(?:change\\s+|set\\s+)?(.+?)\\s+(?:to\\s+)?' + NUMBER + '\\s*(?:min|mins|minutes)$').exec(text);
  if (match && known(day, stripArticles(match[1]))) {
    return { name: 'update_exercise', args: { name: stripArticles(match[1]), minutes: number(match[2]) } };
  }
  return null;
}
