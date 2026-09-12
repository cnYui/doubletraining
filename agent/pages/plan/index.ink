<script def>
{
  "navigationBarTitleText": "Double Training",
  "description": "Edit the training plan by voice: plan the week, give a day a focus (chest, back, legs, shoulders, rest), add, change, or remove exercises, and tune weights. Invoke when the user wants to set up, change, or edit their plan or an exercise; pass the day as date when one is mentioned.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "maxLength": 10,
          "description": "Day to edit: today, tomorrow, yesterday, or YYYY-MM-DD. Defaults to the day edited last, then today."
        }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { clampKey, diffDays, resolveDateInput, shortLabel, todayKey } from '../../lib/dates.js';
import { formatKgWithUnit, plural, prescription } from '../../lib/workout.js';
import { loadDays, loadLastEdited, saveDays, saveLastEdited } from '../../lib/store.js';
import { createTempleInput } from '../../lib/temple.js';
import {
  PLAN_TOOLS,
  applyCommand,
  buildSystemPrompt,
  localCommand,
  nudgeKg
} from '../../lib/plan.js';
import { interpretUtterance } from '../../lib/interpret.js';
import { parseCommand } from '../../lib/grammar.js';

const RANGE_DAYS = 60;
const VISIBLE_ROWS = 5;
const LISTEN_TIMEOUT_MS = 12000;
// Studio's model answered in 7–35 s; give it room before reporting a failure.
const THINK_TIMEOUT_MS = 60000;
const MAX_HISTORY = 20;
const MAX_NOTICE = 96;
const EMPTY_HINT = 'Say what to add, e.g. "add squat, five sets of five at a hundred"';

function pageStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (error) {
    return null;
  }
}

function hintParts(pairs) {
  const parts = [];
  pairs.forEach((pair, index) => {
    parts.push({ k: index + 'k', t: pair[0], key: true });
    parts.push({
      k: index + 't',
      t: ' ' + pair[1] + (index < pairs.length - 1 ? ' · ' : ''),
      key: false
    });
  });
  return parts;
}

function visibleRange(count, cursor) {
  if (count <= VISIBLE_ROWS) return [0, count];
  const start = Math.min(Math.max(cursor - 2, 0), count - VISIBLE_ROWS);
  return [start, start + VISIBLE_ROWS];
}

function clip(text) {
  const value = String(text || '');
  return value.length > MAX_NOTICE ? value.slice(0, MAX_NOTICE - 1) + '…' : value;
}

function speechRecognitionClass() {
  return typeof SpeechRecognition === 'undefined' ? null : SpeechRecognition;
}

function languageModel() {
  return typeof LanguageModel === 'undefined' ? null : LanguageModel;
}

export default {
  data: {
    title: '',
    meta: '',
    metaTone: '',
    rows: [],
    notice: '',
    hint: [],
    compactTitle: '',
    compactMeta: '',
    compactValue: ''
  },

  onLoad(query) {
    this._alive = true;
    this._isVisible = false;
    this._storage = pageStorage();
    this._todayKey = todayKey();
    const requested = query ? query.date : undefined;
    const input = resolveDateInput(requested, this._todayKey);
    let editKey = input.key;
    if (requested === undefined || requested === null || requested === '') {
      const last = loadLastEdited(this._storage);
      if (last && Math.abs(diffDays(this._todayKey, last)) <= RANGE_DAYS) editKey = last;
    }
    this._editKey = clampKey(editKey, this._todayKey, RANGE_DAYS);
    this._notice = input.valid ? '' : "Didn't catch the date; editing today";
    const loaded = loadDays(this._storage, this._todayKey);
    this._days = loaded.days;
    this._persisted = loaded.persisted;
    this._cursor = 0;
    this._history = [];
    this._highlightId = null;
    this._mode = 'idle';
    this._asr = null;
    this._listenTimer = null;
    this._thinkSeq = 0;
    this._adjustDirty = false;
    this._input = createTempleInput({
      now: () => Date.now(),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timerId) => clearTimeout(timerId),
      onLoneGlobalHook: () => this._primary()
    });
    this._id = Math.random().toString(36).slice(2, 6);
    console.log('[doubletraining] plan onLoad ' + this._id + ' query=' + JSON.stringify(query) +
      ' edit=' + this._editKey + ' asr=' + (speechRecognitionClass() ? 'yes' : 'no') +
      ' llm=' + (languageModel() ? 'yes' : 'no'));
    this._render();
  },

  onShow() {
    this._isVisible = true;
    console.log('[doubletraining] plan onShow ' + this._id);
  },

  onHide() {
    console.log('[doubletraining] plan onHide ' + this._id);
    this._isVisible = false;
    this._input.dispose();
    this._abortListening();
  },

  onUnload() {
    console.log('[doubletraining] plan onUnload ' + this._id);
    this._alive = false;
    this._isVisible = false;
    this._input.dispose();
    this._abortListening();
  },

  // Wake word or the temple's AI button: the Page listens instead of the host.
  onVoiceWakeup(event) {
    if (!this._isVisible) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (this._mode === 'idle' || this._mode === 'adjust') this._listen();
    else if (this._mode === 'thinking') this._stillThinking();
  },

  onKeyDown(event) {
    if (!event || !this._isVisible) return;
    if (
      event.code === 'Enter' || event.code === 'Backspace' ||
      event.code === 'ArrowUp' || event.code === 'ArrowDown'
    ) {
      this._input.gestureKeyDown();
    }
  },

  onKeyUp(event) {
    if (!event || !this._isVisible) return;
    if (event.code === 'GlobalHook') {
      this._input.globalHookUp();
      return;
    }
    let owned = false;
    if (event.code === 'Enter') {
      this._input.gestureKeyUp();
      owned = this._primary();
    } else if (event.code === 'Backspace') {
      this._input.gestureKeyUp();
      owned = this._back();
    } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      this._input.gestureKeyUp();
      owned = this._step(event.code === 'ArrowUp' ? -1 : 1);
    }
    if (owned && typeof event.preventDefault === 'function') event.preventDefault();
  },

  // Tap: speak, stop listening, or keep the adjusted weight.
  _primary() {
    if (this._mode === 'idle') {
      this._listen();
    } else if (this._mode === 'listening') {
      this._stopListening();
    } else if (this._mode === 'adjust') {
      this._exitAdjust();
    } else if (this._mode === 'thinking') {
      this._stillThinking();
    }
    return true;
  },

  // Double tap: cancel what is in progress, otherwise finish editing.
  _back() {
    if (this._mode === 'listening') {
      this._abortListening();
      this._notice = 'Cancelled';
      this._setMode('idle');
      this._render();
      return true;
    }
    if (this._mode === 'adjust') {
      this._exitAdjust();
      return true;
    }
    if (this._mode === 'thinking') {
      // The pending answer is dropped when it arrives.
      this._thinkSeq += 1;
      this._notice = 'Cancelled';
      this._setMode('idle');
      this._render();
      return true;
    }
    this._finish();
    return true;
  },

  _stillThinking() {
    this._notice = 'Still thinking… double-tap to cancel';
    this._render();
  },

  // Swipes: move between rows, or nudge the weight while adjusting.
  _step(delta) {
    const items = this._items();
    if (this._mode === 'adjust') {
      // Swipe forward (ArrowUp) = heavier, swipe back = lighter, as on the rest screen.
      const next = nudgeKg(this._days, this._editKey, this._cursor, -delta);
      if (!next) {
        this._notice = "Can't go lower";
      } else {
        if (!this._adjustDirty) {
          this._pushHistory();
          this._adjustDirty = true;
        }
        this._days = next;
        this._notice = '';
      }
      this._render();
      return true;
    }
    if (this._mode !== 'idle' || !items.length) return true;
    this._cursor = Math.min(items.length - 1, Math.max(0, this._cursor + delta));
    this._highlightId = null;
    this._render();
    return true;
  },

  _listen() {
    const Recognition = speechRecognitionClass();
    if (!Recognition) {
      this._notice = 'Speech recognition is not available here';
      this._render();
      return;
    }
    if (this._mode === 'adjust') this._exitAdjust(true);
    this._setMode('listening');
    this._notice = '';
    const recognition = new Recognition();
    let heard = '';
    recognition.onresult = (event) => {
      if (this._asr !== recognition) return;
      try {
        const results = event.results;
        const last = results[results.length - 1];
        if (last && last[0] && (last.isFinal === undefined || last.isFinal)) {
          heard = String(last[0].transcript || '').trim();
        }
      } catch (error) {
        heard = '';
      }
      if (!heard) return;
      this._asr = null;
      this._clearListenTimer();
      this._handleTranscript(heard);
    };
    recognition.onerror = (event) => {
      if (this._asr !== recognition) return;
      this._asr = null;
      this._clearListenTimer();
      if (this._mode !== 'listening') return;
      this._notice = "Didn't catch that" + (event && event.error ? ' (' + event.error + ')' : '');
      this._setMode('idle');
      this._render();
    };
    recognition.onend = () => {
      if (this._asr !== recognition) return;
      this._asr = null;
      this._clearListenTimer();
      if (this._mode !== 'listening') return;
      this._notice = "Didn't hear anything; tap and try again";
      this._setMode('idle');
      this._render();
    };
    this._asr = recognition;
    try {
      recognition.start();
    } catch (error) {
      this._asr = null;
      this._notice = "Couldn't start listening";
      this._setMode('idle');
      this._render();
      return;
    }
    this._listenTimer = setTimeout(() => this._stopListening(), LISTEN_TIMEOUT_MS);
    this._render();
  },

  _stopListening() {
    this._clearListenTimer();
    const recognition = this._asr;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (error) {
      this._asr = null;
      this._setMode('idle');
      this._render();
    }
  },

  _abortListening() {
    this._clearListenTimer();
    const recognition = this._asr;
    this._asr = null;
    if (!recognition) return;
    try {
      if (typeof recognition.abort === 'function') recognition.abort();
      else recognition.stop();
    } catch (error) {
      /* already stopped */
    }
  },

  _clearListenTimer() {
    if (this._listenTimer !== null) {
      clearTimeout(this._listenTimer);
      this._listenTimer = null;
    }
  },

  _handleTranscript(text) {
    console.log('[doubletraining] plan heard ' + this._id + ' ' + JSON.stringify(text));
    const local = localCommand(text);
    if (local === 'undo') {
      this._setMode('idle');
      this._undo();
      return;
    }
    if (local === 'finish') {
      this._setMode('idle');
      this._finish();
      return;
    }
    // Common phrasings are parsed here; the model handles everything else.
    const parsed = parseCommand(text, this._days[this._editKey]);
    if (parsed) {
      console.log('[doubletraining] plan grammar ' + this._id + ' ' + JSON.stringify(parsed));
      this._applyCalls({ calls: [parsed], error: null }, text);
      return;
    }
    this._think(text);
  },

  _think(text) {
    this._setMode('thinking');
    this._notice = '"' + clip(text) + '"';
    this._thinkStartedAt = Date.now();
    this._render();
    this._thinkSeq += 1;
    const token = this._thinkSeq;
    this._tickThinking(token);
    const context = { todayKey: this._todayKey, editKey: this._editKey, day: this._days[this._editKey] };
    interpretUtterance(text, {
      model: languageModel(),
      systemPrompt: buildSystemPrompt(context),
      tools: PLAN_TOOLS,
      timeoutMs: THINK_TIMEOUT_MS
    }).then((result) => {
      if (!this._alive || token !== this._thinkSeq) return;
      console.log('[doubletraining] plan calls ' + this._id + ' ' + JSON.stringify(result.calls) +
        (result.error ? ' error=' + result.error : ''));
      this._applyCalls(result, text);
    });
  },

  // Elapsed seconds while the model works; also shows whether timers run.
  _tickThinking(token) {
    if (!this._alive || this._mode !== 'thinking' || token !== this._thinkSeq) return;
    this._render();
    setTimeout(() => this._tickThinking(token), 1000);
  },

  _applyCalls(result, text) {
    this._setMode('idle');
    const calls = result.calls || [];
    if (!calls.length) {
      this._notice = result.error ?
        "Couldn't reach the model (" + result.error + ')' :
        "Didn't understand \"" + clip(text) + '"';
      this._render();
      return;
    }
    const snapshot = { days: this._days, editKey: this._editKey };
    const messages = [];
    let changed = false;
    let adjustId = null;
    let wantsUndo = false;
    let wantsFinish = false;
    for (const call of calls) {
      const outcome = applyCommand(this._days, { todayKey: this._todayKey, editKey: this._editKey }, call);
      if (outcome.kind === 'undo') { wantsUndo = true; continue; }
      if (outcome.kind === 'finish') { wantsFinish = true; continue; }
      if (!outcome.ok) { messages.push(outcome.message); continue; }
      if (outcome.kind === 'change') {
        this._days = outcome.days;
        this._editKey = outcome.editKey || this._editKey;
        changed = true;
        if (outcome.changedId) this._highlightId = outcome.changedId;
      }
      if (outcome.adjust) adjustId = outcome.changedId;
      messages.push(outcome.message);
    }
    if (changed) {
      this._pushHistory(snapshot);
      this._save();
    }
    this._cursor = this._indexOf(this._highlightId, this._cursor);
    this._notice = clip(messages.join(' · '));
    if (adjustId) {
      this._enterAdjust(this._indexOf(adjustId, this._cursor));
      return;
    }
    if (wantsUndo) {
      this._undo();
      return;
    }
    this._render();
    if (wantsFinish) this._finish();
  },

  _enterAdjust(index) {
    const items = this._items();
    if (!items.length || items[index].type !== 'strength') {
      this._render();
      return;
    }
    this._cursor = index;
    this._highlightId = items[index].id;
    this._adjustDirty = false;
    this._setMode('adjust');
    this._render();
  },

  // Leaves adjust mode; the nudged weight is already in the plan.
  _exitAdjust(silent) {
    const items = this._items();
    const item = items[this._cursor];
    this._setMode('idle');
    if (this._adjustDirty) this._save();
    if (!silent && item) {
      this._notice = item.name + ' kept at ' + formatKgWithUnit(item.kg);
    }
    this._adjustDirty = false;
    if (!silent) this._render();
  },

  _undo() {
    const previous = this._history.pop();
    if (!previous) {
      this._notice = 'Nothing to undo';
      this._render();
      return;
    }
    this._days = previous.days;
    this._editKey = previous.editKey;
    this._highlightId = null;
    this._cursor = Math.min(this._cursor, Math.max(0, this._items().length - 1));
    this._save();
    this._notice = 'Undone';
    this._render();
  },

  _finish() {
    this._abortListening();
    this._save();
    console.log('[doubletraining] plan finish ' + this._id + ' -> day ' + this._editKey);
    wx.navigateTo({
      url: '/pages/day/index?date=' + this._editKey + '&from=plan',
      fail: () => {
        if (typeof this.finish === 'function') this.finish();
      }
    });
  },

  _pushHistory(snapshot) {
    this._history.push(snapshot || { days: this._days, editKey: this._editKey });
    if (this._history.length > MAX_HISTORY) this._history.shift();
  },

  _save() {
    this._persisted = saveDays(this._storage, this._days);
    saveLastEdited(this._storage, this._editKey);
  },

  _setMode(mode) {
    this._mode = mode;
  },

  _items() {
    const day = this._days[this._editKey];
    return day && !day.rest ? day.items : [];
  },

  _indexOf(id, fallback) {
    const items = this._items();
    const index = id ? items.findIndex((item) => item.id === id) : -1;
    if (index >= 0) return index;
    return Math.min(Math.max(0, fallback), Math.max(0, items.length - 1));
  },

  _hintPairs() {
    if (this._mode === 'listening') return [['Listening…', 'tap to stop']];
    if (this._mode === 'thinking') return [['Thinking…', 'one moment']];
    if (this._mode === 'adjust') {
      const item = this._items()[this._cursor];
      const step = item ? item.step : 2.5;
      return [['Swipe', 'forward +' + step + ' · back −' + step + ' kg'], ['Tap', 'keep']];
    }
    return [['Tap', 'speak'], ['Swipe', 'move'], ['Double-tap', 'done']];
  },

  _render() {
    const day = this._days[this._editKey];
    const items = this._items();
    const range = visibleRange(items.length, this._cursor);
    const rows = [];
    for (let index = range[0]; index < range[1]; index += 1) {
      const item = items[index];
      rows.push({
        key: item.id,
        name: item.name,
        rx: prescription(item),
        kg: item.type === 'strength' ? formatKgWithUnit(item.kg) : '',
        focus: index === this._cursor,
        hl: item.id === this._highlightId,
        adjusting: this._mode === 'adjust' && index === this._cursor
      });
    }
    const focusLabel = !day ? 'Not planned' : (day.rest ? 'Rest day' : day.focus);
    const thinkingFor = this._mode === 'thinking' && this._thinkStartedAt ?
      Math.round((Date.now() - this._thinkStartedAt) / 1000) : 0;
    const modeLabel = this._mode === 'listening' ? 'Listening…' :
      this._mode === 'thinking' ? 'Thinking… ' + thinkingFor + 's' :
        this._mode === 'adjust' ? 'Adjusting' :
          (items.length ? plural(items.length, 'exercise') : 'Empty');
    const notice = this._notice ||
      (this._mode === 'idle' && !items.length ? EMPTY_HINT : '') ||
      (this._persisted ? '' : 'Storage unavailable; changes will not be saved');
    const focused = items[this._cursor];
    this.setData({
      title: 'EDIT · ' + shortLabel(this._editKey) + ' · ' + focusLabel,
      meta: modeLabel,
      metaTone: this._mode === 'idle' ? '' : 'meta-live',
      rows,
      notice: clip(notice),
      hint: hintParts(this._hintPairs()),
      compactTitle: shortLabel(this._editKey) + ' · ' + modeLabel,
      compactMeta: focusLabel,
      compactValue: this._notice ? clip(this._notice) :
        (focused ? focused.name + ' · ' + prescription(focused) : EMPTY_HINT)
    });
  }
};
</script>

<page class="shell">
  <view class="full">
    <view class="hdr">
      <text class="title">{{title}}</text>
      <text class="meta {{metaTone}}">{{meta}}</text>
    </view>
    <view class="rows">
      <block ink:for="{{rows}}" ink:for-item="row" ink:key="key">
        <view class="row {{row.focus ? 'row-focus' : ''}} {{row.hl ? 'row-hl' : ''}} {{row.adjusting ? 'row-adjust' : ''}}">
          <text class="row-name">{{row.name}}</text>
          <text class="row-rx" ink:if="{{!row.adjusting}}">{{row.rx}}</text>
          <text class="row-kg" ink:else>{{row.kg}}</text>
          <view class="mark" ink:if="{{row.hl}}"></view>
        </view>
      </block>
    </view>
    <text class="notice" ink:if="{{notice}}">{{notice}}</text>
    <view class="hint">
      <block ink:for="{{hint}}" ink:for-item="part" ink:key="k"><text class="{{part.key ? 'hk' : 'ht'}}">{{part.t}}</text></block>
    </view>
  </view>

  <view class="compact">
    <view class="hdr">
      <text class="title">{{compactTitle}}</text>
      <text class="meta">{{compactMeta}}</text>
    </view>
    <text class="compact-value">{{compactValue}}</text>
    <view class="hint">
      <block ink:for="{{hint}}" ink:for-item="part" ink:key="k"><text class="{{part.key ? 'hk' : 'ht'}}">{{part.t}}</text></block>
    </view>
  </view>
</page>

<style>
.shell {
  width: 100%;
  height: 100%;
  padding: 12px 16px;
  box-sizing: border-box;
  color: #40ff5e;
  background-color: #000000;
}

.full,
.compact {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.compact { display: none; }

.hdr {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  justify-content: space-between;
  align-items: center;
  height: 20px;
}

.title {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: rgba(64, 255, 94, 0.72);
}

.meta {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: rgba(64, 255, 94, 0.72);
}

.meta-live { color: #40ff5e; }

.rows {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 40px;
  margin-bottom: 4px;
  padding: 0 8px;
  box-sizing: border-box;
  border-bottom: 1px solid rgba(64, 255, 94, 0.24);
}

.row-name {
  width: 150px;
  font-size: 14px;
  line-height: 18px;
  color: rgba(64, 255, 94, 0.72);
}

.row-rx {
  flex: 1;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: rgba(64, 255, 94, 0.48);
}

.row-kg {
  flex: 1;
  font-size: 22px;
  line-height: 28px;
  font-weight: 500;
  color: #40ff5e;
}

.row-focus {
  border: 2px solid rgba(64, 255, 94, 0.72);
  border-radius: 4px;
  background-color: rgba(64, 255, 94, 0.12);
}

.row-focus .row-name,
.row-focus .row-rx { color: #40ff5e; }

.row-adjust { border-color: #40ff5e; }

.mark {
  width: 6px;
  height: 6px;
  margin-left: 8px;
  background-color: #40ff5e;
}

.notice {
  margin-top: 8px;
  font-size: 12px;
  line-height: 16px;
  color: rgba(64, 255, 94, 0.72);
}

.hint {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  margin-top: auto;
}

.hk,
.ht {
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 0.05em;
}

.hk { color: rgba(64, 255, 94, 0.72); }

.ht { color: rgba(64, 255, 94, 0.48); }

.compact-value {
  margin-top: 10px;
  font-size: 16px;
  line-height: 22px;
  font-weight: 500;
  color: #40ff5e;
}

/* Chat card (448 x 150): only the current line. Plain class selectors —
   rules scoped under the page root did not apply inside the card. */
@media (max-height: 240px) {
  .shell { padding: 8px 12px; }
  .full { display: none; }
  .compact { display: flex; }
}
</style>
