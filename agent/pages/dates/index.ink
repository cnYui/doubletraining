<script def>
{
  "navigationBarTitleText": "Double Training",
  "description": "打开训练日历(日期罗盘)。用户想看整体训练安排、挑选日期或询问这周练什么时调用;提到具体某天时把日期传入 date,页面会选中那一天。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "maxLength": 10,
          "description": "要选中的日期:today、tomorrow、yesterday 或 YYYY-MM-DD。省略时选中今天。"
        }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import {
  addDays,
  clampKey,
  dayNumberLabel,
  diffDays,
  monthLabel,
  resolveDateInput,
  shortLabel,
  todayKey,
  weekdayLabel,
  yearMonthLabel
} from '../../lib/dates.js';
import { dayStatus, daySummaryLabel, focusChip, weekProgress } from '../../lib/workout.js';
import { loadDays } from '../../lib/store.js';
import { createTempleInput } from '../../lib/temple.js';

const RANGE_DAYS = 60;
const SLOTS = [
  { slot: 'u2', offset: -2, tone: 'far' },
  { slot: 'u1', offset: -1, tone: 'near' },
  { slot: 'sel', offset: 0, tone: 'sel' },
  { slot: 'd1', offset: 1, tone: 'near' },
  { slot: 'd2', offset: 2, tone: 'far' }
];
const HINT = [
  { k: 'a', t: '滑动', key: true },
  { k: 'b', t: ' 选日期 · ', key: false },
  { k: 'c', t: '单击', key: true },
  { k: 'd', t: ' 进入 · ', key: false },
  { k: 'e', t: '双击', key: true },
  { k: 'f', t: ' 退出', key: false }
];

function pageStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (error) {
    return null;
  }
}

function buildRows(days, selectedKey, todayKey) {
  return SLOTS.map((slotInfo) => {
    const key = addDays(selectedKey, slotInfo.offset);
    const inRange = Math.abs(diffDays(todayKey, key)) <= RANGE_DAYS;
    const day = days[key];
    const status = dayStatus(day);
    return {
      slot: slotInfo.slot,
      tone: slotInfo.tone,
      dnum: inRange ? dayNumberLabel(key) : '',
      wd: inRange ? weekdayLabel(key) : '',
      month: monthLabel(key),
      chip: inRange ? focusChip(day) : '',
      chipTone: status === 'none' ? 'chip-dim' : (slotInfo.tone === 'sel' ? 'chip-on' : ''),
      mark: inRange && (status === 'done' || status === 'partial') ? status : '',
      status: inRange ? daySummaryLabel(day) : '',
      isToday: key === todayKey
    };
  });
}

export default {
  data: {
    monthText: '',
    weekText: '',
    rows: [],
    compactTitle: '',
    compactStatus: '',
    notice: '',
    hint: HINT
  },

  onLoad(query) {
    this._isVisible = false;
    this._storage = pageStorage();
    this._todayKey = todayKey();
    const input = resolveDateInput(query ? query.date : undefined, this._todayKey);
    this._selectedKey = clampKey(input.key, this._todayKey, RANGE_DAYS);
    this._notice = input.valid ? '' : '没听清日期,已选中今天';
    this._input = createTempleInput({
      now: () => Date.now(),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timerId) => clearTimeout(timerId),
      onLoneGlobalHook: () => this._openSelected()
    });
    this._reload();
  },

  onShow() {
    this._isVisible = true;
    // Coming back from the day Page: show sets logged there.
    this._reload();
  },

  onHide() {
    this._isVisible = false;
    this._input.dispose();
  },

  onUnload() {
    this._isVisible = false;
    this._input.dispose();
  },

  onKeyDown(event) {
    if (!event) return;
    if (
      event.code === 'Enter' || event.code === 'Backspace' ||
      event.code === 'ArrowUp' || event.code === 'ArrowDown'
    ) {
      this._input.gestureKeyDown();
    }
  },

  onKeyUp(event) {
    if (!event) return;
    if (event.code === 'GlobalHook') {
      if (this._isVisible) this._input.globalHookUp();
      return;
    }
    if (event.code === 'Backspace') {
      // First Page of the Agent: keep the host default (close).
      this._input.gestureKeyUp();
      return;
    }
    if (event.code === 'Enter') {
      this._input.gestureKeyUp();
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this._openSelected();
      return;
    }
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      this._input.gestureKeyUp();
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this._move(event.code === 'ArrowUp' ? -1 : 1);
    }
  },

  _move(delta) {
    const target = clampKey(addDays(this._selectedKey, delta), this._todayKey, RANGE_DAYS);
    if (target === this._selectedKey) {
      this._notice = delta < 0 ? '已经是最早可选的日期' : '已经是最晚可选的日期';
    } else {
      this._selectedKey = target;
      this._notice = '';
    }
    this._render();
  },

  _openSelected() {
    this._notice = '';
    wx.navigateTo({
      url: '/pages/day/index?date=' + this._selectedKey + '&from=dates',
      fail: () => {
        this._notice = '没能打开这一天,请再单击一次';
        this._render();
      }
    });
  },

  _reload() {
    const result = loadDays(this._storage, this._todayKey);
    this._days = result.days;
    this._persisted = result.persisted;
    const keys = Object.keys(this._days).sort();
    console.log('[doubletraining] today=' + this._todayKey + ' selected=' + this._selectedKey +
      ' diff=' + diffDays(this._todayKey, this._selectedKey) + ' days=' + keys.length +
      ' range=' + keys[0] + '..' + keys[keys.length - 1] + ' seeded=' + result.seeded +
      ' persisted=' + result.persisted + ' storage=' + (this._storage ? 'yes' : 'no') +
      ' tz=' + new Date().getTimezoneOffset() + ' now=' + Date.now());
    this._render();
  },

  _render() {
    const week = weekProgress(this._days, this._todayKey);
    const rows = buildRows(this._days, this._selectedKey, this._todayKey);
    const selected = rows[2];
    console.log('[doubletraining] week=' + JSON.stringify(week) + ' selectedRow=' +
      JSON.stringify(selected));
    this.setData({
      monthText: yearMonthLabel(this._selectedKey),
      weekText: week.planned ? '本周 ' + week.done + ' / ' + week.planned : '本周未安排',
      rows,
      compactTitle: shortLabel(this._selectedKey) + ' · ' + selected.chip,
      compactStatus: selected.status,
      notice: this._notice || (this._persisted ? '' : '本地存储不可用,这次的记录不会保存')
    });
  }
};
</script>

<page class="shell">
  <view class="full">
    <view class="hdr">
      <text class="eyebrow">DOUBLE TRAINING · {{monthText}}</text>
      <text class="meta">{{weekText}}</text>
    </view>
    <view class="days">
      <block ink:for="{{rows}}" ink:for-item="row" ink:key="slot">
        <view class="day day-{{row.tone}}">
          <view class="tick tick-{{row.tone}}"></view>
          <text class="dnum">{{row.dnum}}</text>
          <view class="dmeta">
            <text class="wd">{{row.wd}}</text>
            <text class="mo" ink:if="{{row.tone === 'sel'}}">{{row.month}}</text>
          </view>
          <text class="chip {{row.chipTone}}" ink:if="{{row.chip}}">{{row.chip}}</text>
          <view class="mark mark-{{row.mark}}" ink:if="{{row.mark}}"></view>
          <text class="dstat">{{row.status}}</text>
          <text class="chip chip-on chip-today" ink:if="{{row.isToday}}">今天</text>
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
      <text class="meta">{{weekText}}</text>
    </view>
    <text class="compact-status">{{compactStatus}}</text>
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

.eyebrow {
  font-size: 11px;
  line-height: 20px;
  letter-spacing: 0.08em;
  color: rgba(64, 255, 94, 0.72);
}

.title {
  font-size: 16px;
  line-height: 20px;
  font-weight: 500;
  color: rgba(64, 255, 94, 0.72);
}

.meta {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: rgba(64, 255, 94, 0.72);
}

.days {
  display: flex;
  flex-direction: column;
  margin-top: 14px;
  border-left: 1px solid rgba(64, 255, 94, 0.24);
}

.day {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 44px;
  padding-right: 10px;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0);
  border-radius: 4px;
}

.day-sel {
  height: 64px;
  border: 2px solid rgba(64, 255, 94, 0.72);
  background-color: rgba(64, 255, 94, 0.12);
}

.tick {
  width: 6px;
  height: 1px;
  margin-right: 12px;
  background-color: rgba(64, 255, 94, 0.24);
}

.tick-near {
  width: 10px;
  margin-right: 8px;
  background-color: rgba(64, 255, 94, 0.48);
}

.tick-sel {
  width: 16px;
  height: 2px;
  margin-right: 2px;
  background-color: #40ff5e;
}

.dnum {
  width: 56px;
  font-size: 22px;
  line-height: 26px;
  font-weight: 500;
  color: rgba(64, 255, 94, 0.48);
}

.day-near .dnum { color: rgba(64, 255, 94, 0.72); }

.day-sel .dnum {
  font-size: 40px;
  line-height: 44px;
  color: #40ff5e;
}

.dmeta {
  display: flex;
  flex-direction: column;
  width: 44px;
}

.wd,
.mo {
  font-size: 12px;
  line-height: 15px;
  color: rgba(64, 255, 94, 0.48);
}

.day-near .wd,
.day-sel .wd,
.day-sel .mo { color: rgba(64, 255, 94, 0.72); }

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

.chip-dim {
  border-color: rgba(64, 255, 94, 0.24);
  color: rgba(64, 255, 94, 0.48);
}

.chip-on {
  border-color: #40ff5e;
  color: #40ff5e;
  background-color: rgba(64, 255, 94, 0.12);
}

.chip-today { margin-left: 8px; }

.mark {
  width: 6px;
  height: 6px;
  margin-left: 10px;
  box-sizing: border-box;
}

.mark-done { background-color: rgba(64, 255, 94, 0.72); }

.mark-partial { border: 1px solid rgba(64, 255, 94, 0.72); }

.dstat {
  flex: 1;
  margin-left: 8px;
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 0.05em;
  text-align: right;
  color: rgba(64, 255, 94, 0.48);
}

.day-near .dstat { color: rgba(64, 255, 94, 0.72); }

.day-sel .dstat {
  font-size: 12px;
  line-height: 16px;
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

.compact-status {
  margin-top: 10px;
  font-size: 14px;
  line-height: 20px;
  color: rgba(64, 255, 94, 0.72);
}

/* Switch by available height, not target: Studio's effect preview keeps the
   inline card's _current target while giving it the full 480 x 352. */
@media (max-height: 240px) {
  .shell { padding: 8px 12px; }
  .full { display: none; }
  .compact { display: flex; }
}
</style>
