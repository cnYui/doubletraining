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
| `pages/plan/index` plan editor | The day being edited, one row per exercise; changes arrive by voice | Tap or wake word = speak, swipe = move (or change a weight while adjusting), double tap = done |

Day plan states:

| State | Tap | Double tap | Swipe forward / back |
| --- | --- | --- | --- |
| List | Log one set of the focused exercise at the planned weight and reps and tick its box; after the last set the focus moves to the next open exercise; on a cardio item, mark it done | Back to the calendar | Previous / next exercise |
| Done | Back to the calendar | Back to the calendar | — |

The done state shows sets, volume (Σ weight × reps), time, cardio minutes, and the weight change against the last session with the same focus.

The rest countdown between sets (tap to skip, double tap to undo, swipe to adjust the next set's weight) is still in the code but switched off: `REST_TIMER_ENABLED = false` in `pages/day/index.ink`.

## Editing the plan by voice

Say "edit today's plan" (or "plan Monday") to open the editor, then speak one change at a time:

| Say | What happens |
| --- | --- |
| "my week is chest, back, rest, legs, shoulders, rest, rest" | Assigns the templates Monday to Sunday (days that are over or have logged sets keep their plan) |
| "set Monday as leg day" / "tomorrow is a rest day" | One day gets a template |
| "add squat, five sets of five at a hundred" | New exercise; without a weight it is added as bodyweight and the editor switches to adjusting |
| "bench press eighty-two point five" / "pec deck fifteen reps" | Changes one number |
| "adjust squat" | Swipe forward / back moves the weight by one plate step; tap keeps it |
| "remove cable crossover" | Removes the exercise (not if it has logged sets) |
| "undo", "done" | Reverts the last change; saves and opens the day plan |

The Page listens with the host's speech recognition (`SpeechRecognition`), parses the common phrasings itself (`lib/grammar.js`, spoken numbers included), and sends anything else to the on-device language model (`LanguageModel` with tool declarations, `lib/interpret.js`). Every change is applied by `lib/plan.js`, highlighted on screen, and saved; the last 20 changes can be undone. In the Studio simulator the model took 7–90 s per answer, so the header counts the seconds and a double tap cancels.

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
  pages/plan/index.ink  Plan editor (voice in, temple to adjust)
  lib/                  Pure logic: dates, workout model, plan editing, grammar, model calls, storage, temple input
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
- The assistant only opens Pages with a date; slot filling does not work for draft agents in the simulator and needs Studio's build-and-review flow first. Plan changes are spoken to the editor Page itself. Voice logging of sets ("log 80 kg for 6 reps") is not built.
- Whether the glasses need `RECORD_AUDIO` declared for the editor's speech recognition is not verified; the simulator did not.
- The first launch writes an example plan (chest / back / legs / shoulders / rest) to `localStorage`, on the glasses only.
