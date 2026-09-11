# Double Training

A workout check-in agent for Rokid Glasses (AIUI 0.17.0, monochrome green, 480 × 352). Browse the plan by date and tick off each set with a temple tap; weights, reps, and cardio minutes stay on the glasses.

## Import into AIUI Studio

The AIUI project root is the `agent/` subdirectory (it contains `app.json` directly), not the repository root:

```text
Repository: https://github.com/cnYui/doubletraining
Ref: main
AIUI project directory: agent
```

In Studio, open the **New Agent** menu at the top left, choose **GitHub Import**, and enter `https://github.com/cnYui/doubletraining/tree/main/agent`.

## Pages

| Page | What it shows | Temple input |
| --- | --- | --- |
| `pages/dates/index` training calendar | A date wheel: the selected day is enlarged with two days on each side, each showing its focus and progress | Swipe forward = previous day, swipe back = next day, tap = open that day, double tap = exit |
| `pages/day/index` day plan | Exercises with one box per set, and a summary when everything is done | See below |

Day plan states:

| State | Tap | Double tap | Swipe forward / back |
| --- | --- | --- | --- |
| List | Log one set of the focused exercise at the planned weight and reps and tick its box; after the last set the focus moves to the next open exercise; on a cardio item, mark it done | Back to the calendar | Previous / next exercise |
| Done | Back to the calendar | Back to the calendar | — |

The done state shows sets, volume (Σ weight × reps), time, cardio minutes, and the weight change against the last session with the same focus.

The rest countdown between sets (tap to skip, double tap to undo, swipe to adjust the next set's weight) is still in the code but switched off: `REST_TIMER_ENABLED = false` in `pages/day/index.ink`.

## Temple input (measured in the Studio simulator)

In the simulator, a tap and each swipe send `GlobalHook` first and then the gesture key: tap → `Enter`, swipe forward → `ArrowUp`, swipe back → `ArrowDown`. The Pages act only on gesture keys. A lone `GlobalHook` (physical glasses may send only that) counts as one tap after 280 ms, and a `GlobalHook` that arrives right after a gesture key is ignored; see `agent/lib/temple.js`.

**A double tap never reaches agent Pages in the simulator**: the Page logs show neither `GlobalHook` nor `Backspace`. "Double tap to go back" therefore cannot be tested in Studio, and whether physical glasses deliver it as `Backspace` is not verified yet.

## Layout

```text
agent/                  AIUI Studio import root
  AGENTS.md             Agent identity, voice routing rules, capability limits
  app.json              pages: dates, day
  pages/dates/index.ink Training calendar
  pages/day/index.ink   Day plan (list / done; rest countdown switched off)
  lib/                  Pure logic: dates, workout model, storage, temple input
  aiui-audit-claims.json
docs/aiui-audit.md      UX and capability audit (every row BLOCKED until device evidence exists)
tests/                  Node unit tests (not imported into Studio)
```

## Development

```bash
npm test
```

Requires Node 20+. The tests cover all pure logic in `agent/lib/`; Page behavior needs the Studio simulator and physical glasses.

## Status

- What has been checked in the Studio simulator is recorded in `CLAUDE.md` and the commit history; nothing has been verified on physical glasses yet (optics, key order, nod, storage persistence).
- Voice only opens a Page with a date. Voice logging such as "log 80 kg for 6 reps" is not built: slot filling does not work for draft agents in the simulator and needs Studio's build-and-review flow first.
- The first launch writes an example plan (chest / back / legs / shoulders / rest) to `localStorage`, on the glasses only.
