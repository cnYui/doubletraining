<script def>
{
  "navigationBarTitleText": "Double Training",
  "description": "设定或安排某天的训练计划 / Set the training plan for a day. Invoke when the user wants to set or arrange the plan for a day. If the user did not give the weight of an exercise, first ask how many kilograms for each exercise; the user may also say to reuse last time, then set useLastWeight to true for that exercise. Once everything is settled, call this Page exactly once with all exercises in exercises. 动作名请用英文通用名 / Use common English exercise names such as Bench Press, Incline DB Press, Pec Deck, Squat.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "maxLength": 10,
          "description": "Day to set: today, tomorrow, or YYYY-MM-DD. Defaults to today."
        },
        "focus": {
          "type": "string",
          "enum": ["chest", "back", "legs", "shoulders", "rest"],
          "description": "Body part of the day. Optional; the day's current name is kept when omitted."
        },
        "mode": {
          "type": "string",
          "enum": ["replace", "append"],
          "description": "replace (default) swaps the day's exercises for these; append adds these to the day."
        },
        "exercises": {
          "type": "array",
          "description": "Every exercise of the day, sent once after the plan is settled.",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string", "description": "English exercise name, e.g. Bench Press." },
              "sets": { "type": "integer", "description": "Number of sets." },
              "reps": { "type": "integer", "description": "Reps per set." },
              "kg": { "type": "number", "description": "Weight in kilograms." },
              "minutes": { "type": "integer", "description": "Minutes, for cardio." },
              "useLastWeight": { "type": "boolean", "description": "True when the user said to reuse the last weight." }
            },
            "required": ["name"]
          }
        }
      },
      "required": ["exercises"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { resolveDateInput, shortLabel, todayKey } from '../../lib/dates.js';
import { loadDays, saveDays, saveLastEdited } from '../../lib/store.js';
import { createTempleInput } from '../../lib/temple.js';
import { applySetPlan } from '../../lib/setplan.js';

function pageStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (error) {
    return null;
  }
}

export default {
  data: {
    title: '',
    focus: '',
    rows: [],
    compactRows: [],
    more: 0,
    moreText: '',
    notice: '',
    ok: false
  },

  onLoad(query) {
    this._isVisible = false;
    this._storage = pageStorage();
    this._todayKey = todayKey();
    this._id = Math.random().toString(36).slice(2, 6);
    this._input = createTempleInput({
      now: () => Date.now(),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timerId) => clearTimeout(timerId),
      onLoneGlobalHook: () => this._open()
    });
    const input = resolveDateInput(query ? query.date : undefined, this._todayKey);
    this._key = input.key;
    const loaded = loadDays(this._storage, this._todayKey);
    const result = applySetPlan(loaded.days, this._key, query || {});
    console.log('[doubletraining] setplan onLoad ' + this._id + ' query=' + JSON.stringify(query) +
      ' ok=' + result.ok);
    if (!result.ok) {
      this.setData({ title: shortLabel(this._key), notice: result.message, ok: false });
      return;
    }
    saveDays(this._storage, result.days);
    saveLastEdited(this._storage, this._key);
    this.setData({
      title: shortLabel(this._key),
      focus: result.focus,
      rows: result.rows,
      compactRows: result.compactRows,
      more: result.more,
      moreText: result.more ? '+' + result.more + ' more' : '',
      notice: result.message,
      ok: true
    });
  },

  onShow() {
    this._isVisible = true;
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
    if (!event || !this._isVisible) return;
    if (event.code === 'Enter' || event.code === 'Backspace') this._input.gestureKeyDown();
  },

  onKeyUp(event) {
    if (!event || !this._isVisible) return;
    if (event.code === 'GlobalHook') {
      this._input.globalHookUp();
      return;
    }
    if (event.code === 'Enter') {
      this._input.gestureKeyUp();
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this._open();
    } else if (event.code === 'Backspace') {
      this._input.gestureKeyUp();
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this._back();
    }
  },

  _open() {
    if (!this._isVisible || !this.data.ok) return;
    wx.navigateTo({ url: '/pages/day/index?date=' + this._key + '&from=plan' });
  },

  _back() {
    if (typeof this.finish === 'function') this.finish();
    else wx.navigateBack({});
  }
};
</script>

<page class="shell">
  <view class="full">
    <view class="hdr">
      <text class="eyebrow">PLAN SET · {{title}}</text>
      <text class="meta">{{focus}}</text>
    </view>
    <view class="table">
      <block ink:for="{{rows}}" ink:for-item="row" ink:key="k">
        <view class="line">
          <text class="cname">{{row.name}}</text>
          <text class="cdet">{{row.detail}}</text>
          <text class="ckg ckg-{{row.unknown ? 'q' : 'ok'}}">{{row.kg}}</text>
        </view>
      </block>
    </view>
    <text class="notice">{{notice}}</text>
    <text class="hint">Tap: open the day · Double tap: back</text>
  </view>

  <view class="compact">
    <view class="hdr">
      <text class="title">{{title}} · {{focus}}</text>
    </view>
    <block ink:for="{{compactRows}}" ink:for-item="row" ink:key="k">
      <view class="cline">
        <text class="cname">{{row.name}}</text>
        <text class="cdet">{{row.detail}}</text>
        <text class="ckg ckg-{{row.unknown ? 'q' : 'ok'}}">{{row.kg}}</text>
      </view>
    </block>
    <text class="more">{{moreText}}</text>
    <text class="notice">{{notice}}</text>
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
  font-size: 15px;
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

.table {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
  border-top: 1px solid rgba(64, 255, 94, 0.24);
}

.line {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 36px;
  border-bottom: 1px solid rgba(64, 255, 94, 0.24);
}

.cline {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 24px;
}

.cname {
  flex: 1;
  font-size: 15px;
  line-height: 20px;
  color: #40ff5e;
}

.cdet {
  width: 56px;
  font-size: 14px;
  line-height: 20px;
  color: rgba(64, 255, 94, 0.72);
}

.ckg {
  width: 72px;
  font-size: 14px;
  line-height: 20px;
  text-align: right;
}

.ckg-ok { color: #40ff5e; }

.ckg-q { color: rgba(64, 255, 94, 0.48); }

.more {
  font-size: 12px;
  line-height: 16px;
  color: rgba(64, 255, 94, 0.48);
}

.notice {
  margin-top: 8px;
  font-size: 12px;
  line-height: 16px;
  color: rgba(64, 255, 94, 0.72);
}

.hint {
  margin-top: 4px;
  font-size: 11px;
  line-height: 16px;
  color: rgba(64, 255, 94, 0.48);
}

@media (max-height: 240px) {
  .shell { padding: 6px 12px; }
  .full { display: none; }
  .compact { display: flex; }
}
</style>
