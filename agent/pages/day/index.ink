<script def>
{
  "navigationBarTitleText": "Double Training",
  "description": "打开某一天的训练计划并逐组打卡。用户说开始今天的训练、打开今天的计划、明天练什么等时调用,把日期传入 date。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "maxLength": 10,
          "description": "训练日期:today、tomorrow、yesterday 或 YYYY-MM-DD。省略时为今天。"
        }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { monthDayLabel, resolveDateInput, shortLabel, todayKey } from '../../lib/dates.js';
import {
  adjustKg,
  cardioMinutes,
  dayStatus,
  dayTotals,
  durationMinutes,
  firstOpenIndex,
  formatClock,
  formatDelta,
  formatKg,
  formatKgWithUnit,
  formatThousands,
  isItemComplete,
  itemDone,
  kgDeltas,
  logSet,
  markCardioDone,
  nextOpenIndex,
  prescription,
  previousSameFocusKey,
  progressRatio,
  restSecondsFor,
  tonnage,
  undoLastSet
} from '../../lib/workout.js';
import { loadDays, saveDays } from '../../lib/store.js';
import { createTempleInput } from '../../lib/temple.js';

const VISIBLE_ROWS = 5;
const REFRESH_INTERVAL_MS = 250;

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

function baseMode(day) {
  const status = dayStatus(day);
  if (status === 'none') return 'empty';
  if (status === 'rest') return 'restday';
  if (status === 'done') return 'done';
  return 'list';
}

function boxesFor(item, isFocus) {
  const done = itemDone(item);
  const boxes = [];
  for (let index = 0; index < item.sets; index += 1) {
    let state = 'todo';
    if (index < done) state = 'done';
    else if (index === done && isFocus) state = 'cur';
    boxes.push({ k: String(index), s: state });
  }
  return boxes;
}

function rowFor(item, index, cursor) {
  const focus = index === cursor;
  const done = isItemComplete(item);
  return {
    key: item.id,
    name: item.name,
    rx: prescription(item),
    kind: item.type,
    focus,
    done,
    chip: item.type === 'cardio' ? (done ? '已完成' : '有氧') : '',
    boxes: item.type === 'strength' ? boxesFor(item, focus) : []
  };
}

function visibleRange(count, cursor) {
  if (count <= VISIBLE_ROWS) return [0, count];
  const start = Math.min(Math.max(cursor - 2, 0), count - VISIBLE_ROWS);
  return [start, start + VISIBLE_ROWS];
}

function restPercent(remaining, total) {
  return Math.min(100, Math.floor((1 - remaining / total) * 100));
}

export default {
  data: {
    mode: 'list',
    panelList: 'full-on',
    panelRest: '',
    panelDone: '',
    panelEmpty: '',
    title: '',
    dateText: '',
    progressText: '',
    progressPercent: 0,
    rows: [],
    notice: '',
    hint: [],
    restLogged: '',
    restClock: '00:00',
    restTotal: '00:00',
    restPercent: 0,
    nextLabel: '',
    nextKg: '',
    stepText: '',
    doneTitle: '',
    stats: [],
    deltaText: '',
    emptyTitle: '',
    emptyText: '',
    compactTitle: '',
    compactMeta: '',
    compactValue: '',
    compactBoxes: []
  },

  onLoad(query) {
    this._isVisible = false;
    this._refreshTimerId = null;
    this._awareness = false;
    this._rest = null;
    this._lastClock = '';
    this._storage = pageStorage();
    this._todayKey = todayKey();
    const input = resolveDateInput(query ? query.date : undefined, this._todayKey);
    this._dateKey = input.key;
    this._fromDates = Boolean(query && query.from === 'dates');
    this._notice = input.valid ? '' : '没听清日期,先打开今天';
    this._input = createTempleInput({
      now: () => Date.now(),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timerId) => clearTimeout(timerId),
      onLoneGlobalHook: () => this._primary()
    });
    const loaded = loadDays(this._storage, this._todayKey);
    this._days = loaded.days;
    this._persisted = loaded.persisted;
    const day = this._day();
    this._cursor = Math.max(0, firstOpenIndex(day));
    this._mode = baseMode(day);
    this._id = Math.random().toString(36).slice(2, 6);
    console.log('[doubletraining] day onLoad ' + this._id + ' query=' + JSON.stringify(query) +
      ' mode=' + this._mode);
    this._render();
  },

  onShow() {
    this._isVisible = true;
    console.log('[doubletraining] day onShow ' + this._id);
    if (this._mode !== 'rest') return;
    this._syncRest();
    if (this._mode === 'rest') {
      this._startRefresh();
      this._enableAwareness();
    }
  },

  onHide() {
    console.log('[doubletraining] day onHide ' + this._id);
    this._isVisible = false;
    this._input.dispose();
    this._stopRefresh();
    this._disableAwareness();
  },

  onUnload() {
    console.log('[doubletraining] day onUnload ' + this._id);
    this._isVisible = false;
    this._input.dispose();
    this._stopRefresh();
    this._disableAwareness();
  },

  onHeadGesture(event) {
    if (!this._isVisible || this._mode !== 'rest' || !event || event.gesture !== 'nod') {
      return;
    }
    this._endRest('skip');
  },

  onKeyDown(event) {
    if (!event) return;
    console.log('[doubletraining] day keydown ' + this._id + ' ' + event.code +
      ' mode=' + this._mode + ' visible=' + this._isVisible);
    // Keys belong to the visible Page only; ignore anything reaching a covered one.
    if (!this._isVisible) return;
    if (
      event.code === 'Enter' || event.code === 'Backspace' ||
      event.code === 'ArrowUp' || event.code === 'ArrowDown'
    ) {
      this._input.gestureKeyDown();
    }
  },

  onKeyUp(event) {
    if (!event) return;
    console.log('[doubletraining] day keyup ' + this._id + ' ' + event.code +
      ' mode=' + this._mode + ' visible=' + this._isVisible);
    if (!this._isVisible) return;
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
    } else if (event.code === 'ArrowUp') {
      this._input.gestureKeyUp();
      owned = this._step(-1);
    } else if (event.code === 'ArrowDown') {
      this._input.gestureKeyUp();
      owned = this._step(1);
    }
    if (owned && typeof event.preventDefault === 'function') event.preventDefault();
  },

  // Single tap. Returns true when the Page owns the input.
  _primary() {
    if (this._mode === 'list') {
      this._logFocused();
    } else if (this._mode === 'rest') {
      this._endRest('skip');
    } else {
      this._leave();
    }
    return true;
  },

  // Double tap (Backspace). Unowned on a voice-opened list so the host closes.
  _back() {
    if (this._mode === 'rest') {
      this._undoRest();
      return true;
    }
    if (this._fromDates) {
      this._leave();
      return true;
    }
    return false;
  },

  // Swipe forward is -1 (ArrowUp), swipe back is +1 (ArrowDown).
  _step(direction) {
    if (this._mode === 'list') {
      this._moveCursor(direction);
      return true;
    }
    if (this._mode === 'rest') {
      this._adjustNextKg(-direction);
      return true;
    }
    return false;
  },

  _day() {
    return this._days[this._dateKey];
  },

  _commit(day) {
    this._days[this._dateKey] = day;
    this._persisted = saveDays(this._storage, this._days);
  },

  _moveCursor(direction) {
    const count = this._day().items.length;
    const next = Math.min(Math.max(this._cursor + direction, 0), count - 1);
    this._notice = next === this._cursor ?
      (direction < 0 ? '已经是第一项' : '已经是最后一项') : '';
    this._cursor = next;
    this._render();
  },

  _logFocused() {
    const day = this._day();
    const item = day.items[this._cursor];
    if (isItemComplete(item)) {
      this._notice = item.name + ' 已完成 · 滑动换动作';
      this._render();
      return;
    }
    if (item.type === 'cardio') {
      const updated = markCardioDone(day, this._cursor, Date.now());
      this._commit(updated);
      if (dayStatus(updated) === 'done') {
        this._showDone();
        return;
      }
      this._notice = '已记 ' + item.name + ' ' + item.minutes + ' 分钟';
      this._cursor = Math.max(0, nextOpenIndex(updated, this._cursor));
      this._render();
      return;
    }
    const result = logSet(day, this._cursor, Date.now());
    this._commit(result.day);
    this._notice = '';
    if (dayStatus(result.day) === 'done') {
      this._showDone();
      return;
    }
    const nextIndex = isItemComplete(result.day.items[this._cursor]) ?
      nextOpenIndex(result.day, this._cursor) : this._cursor;
    this._startRest(result.set, nextIndex, restSecondsFor(item));
  },

  _startRest(set, nextIndex, seconds) {
    const totalMs = seconds * 1000;
    this._rest = { set, nextIndex, totalMs, deadlineMs: Date.now() + totalMs };
    this._mode = 'rest';
    this._render();
    this._startRefresh();
    this._enableAwareness();
  },

  _syncRest() {
    if (this._mode !== 'rest' || !this._rest) return;
    if (this._rest.deadlineMs - Date.now() <= 0) {
      this._endRest('timeout');
      return;
    }
    this._renderRestClock();
  },

  _leaveRest() {
    const rest = this._rest;
    this._rest = null;
    this._stopRefresh();
    this._disableAwareness();
    this._mode = 'list';
    return rest;
  },

  _endRest(reason) {
    if (this._mode !== 'rest' || !this._rest) return;
    const rest = this._leaveRest();
    if (rest.nextIndex >= 0) this._cursor = rest.nextIndex;
    this._notice = reason === 'timeout' ? '休息结束 · 开始下一组' : '';
    this._render();
  },

  _undoRest() {
    const rest = this._leaveRest();
    const updated = undoLastSet(this._day(), rest.set.itemIndex);
    this._cursor = rest.set.itemIndex;
    if (updated) {
      this._commit(updated);
      this._notice = '已撤销 ' + rest.set.name + ' 第 ' + rest.set.number + ' 组';
    }
    this._render();
  },

  _adjustNextKg(direction) {
    const index = this._rest.nextIndex;
    const item = this._day().items[index];
    if (!item || item.type !== 'strength') {
      this._notice = '下一项不需要调重量';
    } else {
      const updated = adjustKg(this._day(), index, direction);
      if (updated) {
        this._commit(updated);
        this._notice = '';
      } else {
        this._notice = '已经是最低重量';
      }
    }
    this._render();
  },

  _showDone() {
    if (this._rest) this._leaveRest();
    this._mode = 'done';
    this._notice = '';
    this._render();
  },

  _leave() {
    this._stopRefresh();
    this._disableAwareness();
    if (this._fromDates) {
      wx.navigateBack({ delta: 1, fail: () => this._finishPage() });
      return;
    }
    this._finishPage();
  },

  _finishPage() {
    if (typeof this.finish === 'function') this.finish();
  },

  _startRefresh() {
    if (!this._isVisible || this._refreshTimerId !== null) return;
    this._refreshTimerId = setInterval(() => {
      this._syncRest();
    }, REFRESH_INTERVAL_MS);
  },

  _stopRefresh() {
    if (this._refreshTimerId === null) return;
    clearInterval(this._refreshTimerId);
    this._refreshTimerId = null;
  },

  // Nod skips rest; awareness runs only while resting so a nod during a set
  // (bench press, squats) cannot log or skip anything.
  _enableAwareness() {
    if (this._awareness || typeof this.enableWorldAwareness !== 'function') return;
    try {
      this.enableWorldAwareness({ mode: 'normal' });
      this._awareness = true;
    } catch (error) {
      this._awareness = false;
    }
  },

  _disableAwareness() {
    if (!this._awareness) return;
    this._awareness = false;
    if (typeof this.disableWorldAwareness !== 'function') return;
    try {
      this.disableWorldAwareness();
    } catch (error) {
      // The runtime disables awareness on unload anyway.
    }
  },

  _hintPairs() {
    const back = this._fromDates ? '返回' : '退出';
    if (this._mode === 'list') {
      const item = this._day().items[this._cursor];
      if (isItemComplete(item)) return [['滑动', '换动作'], ['双击', back]];
      if (item.type === 'cardio') {
        return [['单击', '记为完成'], ['滑动', '换动作'], ['双击', back]];
      }
      return [['单击', '完成这组'], ['滑动', '换动作'], ['双击', back]];
    }
    if (this._mode === 'rest') {
      return [['单击', '跳过休息'], ['双击', '撤销这组'], ['滑动', '调重量']];
    }
    if (this._fromDates) return [['单击 / 双击', '返回日历']];
    return [['单击', '关闭'], ['双击', '退出']];
  },

  _render() {
    const day = this._day();
    const hasPlan = Boolean(day && !day.rest && day.items.length);
    const patch = {
      mode: this._mode,
      panelList: this._mode === 'list' ? 'full-on' : '',
      panelRest: this._mode === 'rest' ? 'full-on' : '',
      panelDone: this._mode === 'done' ? 'full-on' : '',
      panelEmpty: this._mode === 'empty' || this._mode === 'restday' ? 'full-on' : '',
      title: shortLabel(this._dateKey) + (hasPlan ? ' · ' + day.focus : ''),
      dateText: shortLabel(this._dateKey),
      notice: this._notice ||
        (this._persisted ? '' : '本地存储不可用,这次的记录不会保存'),
      hint: hintParts(this._hintPairs())
    };
    if (this._mode === 'list') Object.assign(patch, this._listPatch(day));
    else if (this._mode === 'rest') Object.assign(patch, this._restPatch(day));
    else if (this._mode === 'done') Object.assign(patch, this._donePatch(day));
    else Object.assign(patch, this._emptyPatch());
    this.setData(patch);
  },

  _listPatch(day) {
    const totals = dayTotals(day);
    const range = visibleRange(day.items.length, this._cursor);
    const rows = [];
    for (let index = range[0]; index < range[1]; index += 1) {
      rows.push(rowFor(day.items[index], index, this._cursor));
    }
    const item = day.items[this._cursor];
    const open = !isItemComplete(item);
    return {
      progressText: totals.doneSets + ' / ' + totals.sets + ' 组',
      progressPercent: Math.round(progressRatio(day) * 100),
      rows,
      compactTitle: item.type === 'strength' && open ?
        item.name + ' · 第 ' + (itemDone(item) + 1) + ' 组' : item.name,
      compactMeta: totals.doneSets + ' / ' + totals.sets + ' 组',
      compactValue: item.type === 'strength' ?
        formatKgWithUnit(item.kg) + ' × ' + item.reps : item.minutes + ' min',
      compactBoxes: rowFor(item, this._cursor, this._cursor).boxes
    };
  },

  _restPatch(day) {
    const rest = this._rest;
    const remaining = Math.max(0, rest.deadlineMs - Date.now());
    const nextItem = rest.nextIndex >= 0 ? day.items[rest.nextIndex] : null;
    let nextLabel = '没有剩余项目';
    let nextKg = '';
    let stepText = '';
    if (nextItem && nextItem.type === 'strength') {
      nextLabel = nextItem.name + ' · 第 ' + (itemDone(nextItem) + 1) + ' 组';
      nextKg = formatKgWithUnit(nextItem.kg) + ' × ' + nextItem.reps;
      stepText = '向前滑动 +' + formatKg(nextItem.step) + ' kg · 向后滑动 -' +
        formatKg(nextItem.step) + ' kg';
    } else if (nextItem) {
      nextLabel = nextItem.name;
      nextKg = nextItem.minutes + ' min';
    }
    const clock = formatClock(remaining);
    this._lastClock = clock;
    return {
      restLogged: '已记 · ' + rest.set.name + ' 第 ' + rest.set.number + ' 组 · ' +
        formatKgWithUnit(rest.set.kg) + ' × ' + rest.set.reps,
      restClock: clock,
      restTotal: formatClock(rest.totalMs),
      restPercent: restPercent(remaining, rest.totalMs),
      nextLabel,
      nextKg,
      stepText,
      compactTitle: '组间休息',
      compactMeta: '下一组 ' + (nextKg || nextLabel),
      compactValue: clock,
      compactBoxes: []
    };
  },

  _renderRestClock() {
    const rest = this._rest;
    const remaining = Math.max(0, rest.deadlineMs - Date.now());
    const clock = formatClock(remaining);
    if (clock === this._lastClock) return;
    this._lastClock = clock;
    this.setData({
      restClock: clock,
      restPercent: restPercent(remaining, rest.totalMs),
      compactValue: clock
    });
  },

  _donePatch(day) {
    const totals = dayTotals(day);
    const volume = formatThousands(tonnage(day));
    const previousKey = previousSameFocusKey(this._days, this._dateKey);
    const deltas = previousKey ? kgDeltas(day, this._days[previousKey]).slice(0, 3) : [];
    return {
      doneTitle: (this._dateKey === this._todayKey ? '今日完成 · ' : '训练完成 · ') + day.focus,
      stats: [
        { k: 'sets', label: '组数', value: String(totals.doneSets), unit: '' },
        { k: 'volume', label: '总量', value: volume, unit: 'kg' },
        { k: 'time', label: '用时', value: String(durationMinutes(day)), unit: 'min' },
        { k: 'cardio', label: '有氧', value: String(cardioMinutes(day)), unit: 'min' }
      ],
      deltaText: deltas.length ?
        '较 ' + monthDayLabel(previousKey) + ' · ' +
          deltas.map((entry) => entry.name + ' ' + formatDelta(entry.delta)).join(' · ') :
        '第一次记录这个部位,下次开始对比重量',
      compactTitle: '训练完成 · ' + day.focus,
      compactMeta: shortLabel(this._dateKey),
      compactValue: totals.doneSets + ' 组 · ' + volume + ' kg',
      compactBoxes: []
    };
  },

  _emptyPatch() {
    const restDay = this._mode === 'restday';
    return {
      emptyTitle: restDay ? '休息日' : '这一天没有训练计划',
      emptyText: restDay ? '今天不练,好好恢复。' : '回到训练日历,选一个有安排的日期。',
      compactTitle: shortLabel(this._dateKey),
      compactMeta: '',
      compactValue: restDay ? '休息日' : '未安排',
      compactBoxes: []
    };
  }
};
</script>

<page class="shell">
  <view class="full {{panelList}}">
    <view class="hdr">
      <text class="title">{{title}}</text>
      <text class="meta">{{progressText}}</text>
    </view>
    <view class="bar">
      <view class="bar-fill" style="width: {{progressPercent}}%;">
        <view class="bar-dot"></view>
      </view>
    </view>
    <view class="rows">
      <block ink:for="{{rows}}" ink:for-item="row" ink:key="key">
        <view class="row {{row.done ? 'row-done' : ''}} {{row.focus ? 'row-focus' : ''}}">
          <text class="row-name">{{row.name}}</text>
          <text class="row-rx">{{row.rx}}</text>
          <view class="boxes" ink:if="{{row.kind === 'strength'}}">
            <block ink:for="{{row.boxes}}" ink:for-item="box" ink:key="k"><view class="box box-{{box.s}}"></view></block>
          </view>
          <text class="chip {{row.done ? 'chip-on' : ''}}" ink:else>{{row.chip}}</text>
        </view>
      </block>
    </view>
    <text class="notice" ink:if="{{notice}}">{{notice}}</text>
    <view class="hint">
      <block ink:for="{{hint}}" ink:for-item="part" ink:key="k"><text class="{{part.key ? 'hk' : 'ht'}}">{{part.t}}</text></block>
    </view>
  </view>

  <view class="full {{panelRest}}">
    <view class="hdr">
      <text class="eyebrow">组间休息</text>
      <text class="cap">{{restLogged}}</text>
    </view>
    <view class="hero">
      <text class="big">{{restClock}}</text>
      <text class="of">/ {{restTotal}}</text>
    </view>
    <view class="bar bar-rest">
      <view class="bar-fill" style="width: {{restPercent}}%;">
        <view class="bar-dot"></view>
      </view>
    </view>
    <view class="next">
      <text class="next-l">下一组</text>
      <text class="next-v">{{nextLabel}}</text>
      <text class="next-kg">{{nextKg}}</text>
    </view>
    <text class="step" ink:if="{{stepText}}">{{stepText}}</text>
    <text class="notice" ink:if="{{notice}}">{{notice}}</text>
    <view class="hint">
      <block ink:for="{{hint}}" ink:for-item="part" ink:key="k"><text class="{{part.key ? 'hk' : 'ht'}}">{{part.t}}</text></block>
    </view>
  </view>

  <view class="full {{panelDone}}">
    <view class="hdr">
      <text class="eyebrow">{{doneTitle}}</text>
      <text class="meta">{{dateText}}</text>
    </view>
    <view class="stats">
      <view ink:for="{{stats}}" ink:for-item="stat" ink:key="k" class="stat">
        <text class="stat-k">{{stat.label}}</text>
        <view class="stat-line">
          <text class="stat-v">{{stat.value}}</text>
          <text class="stat-u">{{stat.unit}}</text>
        </view>
      </view>
    </view>
    <text class="delta">{{deltaText}}</text>
    <text class="notice" ink:if="{{notice}}">{{notice}}</text>
    <view class="hint">
      <block ink:for="{{hint}}" ink:for-item="part" ink:key="k"><text class="{{part.key ? 'hk' : 'ht'}}">{{part.t}}</text></block>
    </view>
  </view>

  <view class="full {{panelEmpty}}">
    <view class="hdr">
      <text class="title">{{title}}</text>
    </view>
    <text class="empty-title">{{emptyTitle}}</text>
    <text class="empty-text">{{emptyText}}</text>
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
    <view class="compact-line">
      <text class="compact-value">{{compactValue}}</text>
      <view class="boxes compact-boxes" ink:if="{{compactBoxes.length}}">
        <block ink:for="{{compactBoxes}}" ink:for-item="box" ink:key="k"><view class="box box-{{box.s}}"></view></block>
      </view>
    </view>
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
  display: none;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

/* Every panel stays mounted and a data-bound class shows the current one:
   rows inside a re-created ink:if block vanished in Studio's runtime, and a
   dynamic class on the <page> root was not applied at all. */
.full-on { display: flex; }

.hdr {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  justify-content: space-between;
  align-items: center;
  height: 20px;
}

.title {
  font-size: 16px;
  line-height: 20px;
  font-weight: 500;
  color: rgba(64, 255, 94, 0.72);
}

.eyebrow {
  font-size: 11px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: rgba(64, 255, 94, 0.72);
}

.meta {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: rgba(64, 255, 94, 0.72);
}

.cap {
  font-size: 10px;
  line-height: 20px;
  letter-spacing: 0.05em;
  color: rgba(64, 255, 94, 0.48);
}

.bar {
  flex-shrink: 0;
  height: 1px;
  margin-top: 6px;
  background-color: rgba(64, 255, 94, 0.24);
}

.bar-fill {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  height: 1px;
  background-color: rgba(64, 255, 94, 0.72);
}

.bar-dot {
  width: 3px;
  height: 3px;
  margin-top: -1px;
  background-color: #40ff5e;
}

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
  width: 120px;
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

.row-done .row-name,
.row-done .row-rx { color: rgba(64, 255, 94, 0.48); }

.row-focus {
  border: 2px solid rgba(64, 255, 94, 0.72);
  border-radius: 4px;
  background-color: rgba(64, 255, 94, 0.12);
}

.row-focus .row-name,
.row-focus .row-rx { color: #40ff5e; }

.boxes {
  display: flex;
  flex-direction: row;
}

.box {
  width: 12px;
  height: 12px;
  margin-left: 4px;
  box-sizing: border-box;
  border: 1px solid rgba(64, 255, 94, 0.24);
  border-radius: 2px;
}

.box-done {
  border-color: rgba(64, 255, 94, 0.72);
  background-color: rgba(64, 255, 94, 0.72);
}

.box-cur {
  border: 2px solid #40ff5e;
  background-color: rgba(64, 255, 94, 0.12);
}

.chip {
  height: 20px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 20px;
  letter-spacing: 0.08em;
  border: 1px solid rgba(64, 255, 94, 0.48);
  border-radius: 4px;
  color: rgba(64, 255, 94, 0.72);
}

.chip-on {
  border-color: #40ff5e;
  color: #40ff5e;
  background-color: rgba(64, 255, 94, 0.12);
}

.hero {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  margin-top: 26px;
}

.big {
  font-size: 56px;
  line-height: 60px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: #40ff5e;
}

.of {
  margin-left: 10px;
  margin-bottom: 8px;
  font-size: 13px;
  line-height: 16px;
  color: rgba(64, 255, 94, 0.48);
}

.bar-rest { margin-top: 14px; }

.next {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 16px;
}

.next-l {
  margin-right: 10px;
  font-size: 11px;
  line-height: 18px;
  letter-spacing: 0.08em;
  color: rgba(64, 255, 94, 0.48);
}

.next-v {
  font-size: 14px;
  line-height: 18px;
  color: rgba(64, 255, 94, 0.72);
}

.next-kg {
  margin-left: 8px;
  font-size: 14px;
  line-height: 18px;
  font-weight: 500;
  color: #40ff5e;
}

.step {
  margin-top: 6px;
  font-size: 11px;
  line-height: 14px;
  color: rgba(64, 255, 94, 0.48);
}

.stats {
  display: flex;
  flex-direction: row;
  margin-top: 22px;
}

.stat {
  display: flex;
  flex: 1;
  flex-direction: column;
  margin-right: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(64, 255, 94, 0.24);
}

.stat:last-child { margin-right: 0; }

.stat-k {
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 0.05em;
  color: rgba(64, 255, 94, 0.48);
}

.stat-line {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  margin-top: 2px;
}

.stat-v {
  font-size: 22px;
  line-height: 28px;
  font-weight: 500;
  color: #40ff5e;
}

.stat-u {
  margin-left: 2px;
  margin-bottom: 4px;
  font-size: 11px;
  line-height: 14px;
  color: rgba(64, 255, 94, 0.72);
}

.delta {
  margin-top: 18px;
  font-size: 12px;
  line-height: 17px;
  color: rgba(64, 255, 94, 0.72);
}

.empty-title {
  margin-top: 36px;
  font-size: 22px;
  line-height: 26px;
  font-weight: 500;
  color: #40ff5e;
}

.empty-text {
  margin-top: 10px;
  font-size: 14px;
  line-height: 20px;
  color: rgba(64, 255, 94, 0.72);
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

.compact-line {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 10px;
}

.compact-value {
  font-size: 22px;
  line-height: 28px;
  font-weight: 500;
  color: #40ff5e;
}

.compact-boxes { margin-left: auto; }

/* Switch by available height, not target: Studio's effect preview keeps the
   inline card's _current target while giving it the full 480 x 352. */
@media (max-height: 240px) {
  .shell { padding: 8px 12px; }
  .shell .full-on { display: none; }
  .shell .compact { display: flex; }
}
</style>
