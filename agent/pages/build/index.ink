<script def>
{
  "navigationBarTitleText": "Double Training",
  "description": "Plan one day's workout by hand with the temple touchpad: choose the body part (chest, back, legs, shoulders, arms, glutes, calves, abs, cardio, or a rest day), pick exercises from that part's list, set sets, reps and weight for each, then save. Invoke when the user wants to choose what to train, set up, or edit a day's exercises manually; pass the day as date.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "maxLength": 10,
          "description": "Day to plan: today, tomorrow, yesterday, or YYYY-MM-DD. Defaults to today."
        }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { resolveDateInput, todayKey } from '../../lib/dates.js';
import { loadDays, saveDays, saveLastEdited } from '../../lib/store.js';
import { createTempleInput } from '../../lib/temple.js';
import { initState, press, view } from '../../lib/build.js';

function pageStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (error) {
    return null;
  }
}

export default {
  data: {
    screen: 'part',
    panelRows: 'full-on',
    panelSetup: '',
    eyebrow: '',
    meta: '',
    rows: [],
    notice: '',
    hint: [],
    setupName: '',
    setupCells: [],
    setupLine: '',
    setupOptions: [],
    setupConfirm: false,
    compactTitle: '',
    compactMain: '',
    compactSub: ''
  },

  onLoad(query) {
    this._isVisible = false;
    this._storage = pageStorage();
    this._todayKey = todayKey();
    const input = resolveDateInput(query ? query.date : undefined, this._todayKey);
    this._key = input.key;
    this._input = createTempleInput({
      now: () => Date.now(),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timerId) => clearTimeout(timerId),
      onLoneGlobalHook: () => this._press('tap')
    });
    const loaded = loadDays(this._storage, this._todayKey);
    this._persisted = loaded.persisted;
    this._state = initState(loaded.days, this._key);
    if (!input.valid) this._state = Object.assign({}, this._state, { notice: "Didn't catch the date; opened today" });
    this._render();
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
    let name = '';
    if (event.code === 'Enter') name = 'tap';
    else if (event.code === 'Backspace') name = 'back';
    else if (event.code === 'ArrowUp') name = 'prev';
    else if (event.code === 'ArrowDown') name = 'next';
    if (!name) return;
    this._input.gestureKeyUp();
    if (typeof event.preventDefault === 'function') event.preventDefault();
    this._press(name);
  },

  // One temple input: swipe forward = prev, swipe back = next.
  _press(name) {
    if (!this._isVisible) return;
    const before = this._state;
    const result = press(before, name);
    this._state = result.state;
    if (result.state.days !== before.days) {
      this._persisted = saveDays(this._storage, result.state.days);
      saveLastEdited(this._storage, this._key);
    }
    this._render();
    if (result.effect === 'exit') this._exit();
  },

  _exit() {
    this._input.dispose();
    wx.navigateBack({ delta: 1, fail: () => this._finishPage() });
  },

  _finishPage() {
    if (typeof this.finish === 'function') this.finish();
  },

  _render() {
    const model = view(this._state);
    const setup = model.setup;
    this.setData({
      screen: model.screen,
      panelRows: model.screen === 'setup' ? '' : 'full-on',
      panelSetup: model.screen === 'setup' ? 'full-on' : '',
      eyebrow: model.eyebrow,
      meta: model.meta,
      rows: model.rows,
      notice: model.notice || (this._persisted ? '' : 'Storage unavailable; changes will not be saved'),
      hint: model.hint,
      setupName: setup ? setup.name : '',
      setupCells: setup ? setup.cells : [],
      setupLine: setup ? setup.line : '',
      setupOptions: setup ? setup.options : [],
      setupConfirm: setup ? setup.confirm : false,
      compactTitle: model.compact.title,
      compactMain: model.compact.main,
      compactSub: model.compact.sub
    });
  }
};
</script>

<page class="shell">
  <view class="full {{panelRows}}">
    <view class="hdr">
      <text class="eyebrow">{{eyebrow}}</text>
      <text class="meta">{{meta}}</text>
    </view>
    <view class="rows">
      <block ink:for="{{rows}}" ink:for-item="row" ink:key="k">
        <view class="row row-{{row.kind}} {{row.focus ? 'row-focus' : ''}}">
          <view class="mk mk-{{row.mark}}"></view>
          <text class="row-name">{{row.label}}</text>
          <text class="row-rx">{{row.detail}}</text>
        </view>
      </block>
    </view>
    <text class="notice" ink:if="{{notice}}">{{notice}}</text>
    <view class="hint">
      <block ink:for="{{hint}}" ink:for-item="part" ink:key="k"><text class="{{part.key ? 'hk' : 'ht'}}">{{part.t}}</text></block>
    </view>
  </view>

  <view class="full {{panelSetup}}">
    <view class="hdr">
      <text class="eyebrow">{{eyebrow}}</text>
      <text class="meta">{{meta}}</text>
    </view>
    <text class="s-name">{{setupName}}</text>
    <view class="cells">
      <block ink:for="{{setupCells}}" ink:for-item="cell" ink:key="k">
        <view class="cell {{cell.on ? 'cell-on' : ''}}">
          <text class="cell-k">{{cell.label}}</text>
          <text class="cell-v">{{cell.value}}</text>
        </view>
      </block>
    </view>
    <text class="s-line">{{setupLine}}</text>
    <view class="opts">
      <block ink:for="{{setupOptions}}" ink:for-item="opt" ink:key="k">
        <view class="opt {{opt.on ? 'opt-on' : ''}} {{setupConfirm ? '' : 'opt-dim'}}">
          <text class="opt-t">{{opt.label}}</text>
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
    </view>
    <text class="compact-main">{{compactMain}}</text>
    <text class="compact-sub">{{compactSub}}</text>
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

/* Both panels stay mounted and a data-bound class shows the current one
   (see the day Page: re-created blocks and a dynamic <page> class both failed). */
.full-on { display: flex; }

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
  font-weight: 500;
  letter-spacing: 0.08em;
  color: rgba(64, 255, 94, 0.72);
}

.title {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: rgba(64, 255, 94, 0.72);
}

.meta {
  font-size: 12px;
  line-height: 20px;
  font-weight: 500;
  color: rgba(64, 255, 94, 0.72);
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
  flex: 1;
  font-size: 15px;
  line-height: 18px;
  color: rgba(64, 255, 94, 0.72);
}

.row-rx {
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: rgba(64, 255, 94, 0.48);
}

.row-focus {
  border: 2px solid rgba(64, 255, 94, 0.72);
  border-radius: 4px;
  background-color: rgba(64, 255, 94, 0.12);
}

.row-focus .row-name { color: #40ff5e; }

.row-focus .row-rx { color: rgba(64, 255, 94, 0.72); }

.row-add .row-name,
.row-save .row-name { font-weight: 500; }

.mk {
  width: 12px;
  height: 12px;
  margin-right: 10px;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0);
  border-radius: 2px;
}

.mk-off { border-color: rgba(64, 255, 94, 0.48); }

.mk-on {
  border-color: #40ff5e;
  background-color: #40ff5e;
}

.mk-in {
  border-color: rgba(64, 255, 94, 0.24);
  background-color: rgba(64, 255, 94, 0.24);
}

.mk-cur {
  border-color: rgba(64, 255, 94, 0.72);
  background-color: rgba(64, 255, 94, 0.72);
}

.s-name {
  margin-top: 16px;
  font-size: 22px;
  line-height: 26px;
  font-weight: 500;
  color: #40ff5e;
}

.cells {
  display: flex;
  flex-direction: row;
  margin-top: 14px;
}

.cell {
  display: flex;
  flex: 1;
  flex-direction: column;
  margin-right: 10px;
  padding: 8px 10px;
  box-sizing: border-box;
  border: 1px solid rgba(64, 255, 94, 0.24);
  border-radius: 4px;
}

.cell:last-child { margin-right: 0; }

.cell-on {
  border: 2px solid #40ff5e;
  background-color: rgba(64, 255, 94, 0.12);
}

.cell-k {
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 0.05em;
  color: rgba(64, 255, 94, 0.48);
}

.cell-v {
  margin-top: 2px;
  font-size: 26px;
  line-height: 32px;
  font-weight: 500;
  color: #40ff5e;
}

.s-line {
  margin-top: 12px;
  font-size: 12px;
  line-height: 16px;
  color: rgba(64, 255, 94, 0.72);
}

.opts {
  display: flex;
  flex-direction: row;
  margin-top: 14px;
}

.opt {
  display: flex;
  flex: 1;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  height: 36px;
  margin-right: 10px;
  box-sizing: border-box;
  border: 1px solid rgba(64, 255, 94, 0.48);
  border-radius: 4px;
}

.opt:last-child { margin-right: 0; }

.opt-on {
  border: 2px solid #40ff5e;
  background-color: rgba(64, 255, 94, 0.12);
}

.opt-dim { border-color: rgba(64, 255, 94, 0.24); }

.opt-t {
  font-size: 14px;
  line-height: 18px;
  font-weight: 500;
  color: rgba(64, 255, 94, 0.72);
}

.opt-on .opt-t { color: #40ff5e; }

.opt-dim .opt-t { color: rgba(64, 255, 94, 0.48); }

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

.compact-main {
  margin-top: 10px;
  font-size: 22px;
  line-height: 28px;
  font-weight: 500;
  color: #40ff5e;
}

.compact-sub {
  margin-top: 4px;
  font-size: 13px;
  line-height: 18px;
  color: rgba(64, 255, 94, 0.72);
}

/* Switch by available height, not target (see the day Page); plain classes only. */
@media (max-height: 240px) {
  .shell { padding: 8px 12px; }
  .full-on { display: none; }
  .compact { display: flex; }
}
</style>
