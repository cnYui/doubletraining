# Double Training — Rokid AIUI workout check-in agent (workspace notes)

> Notes for Claude. This folder is the root of the `cnYui/doubletraining` repository; the AIUI Studio import root is its `agent/` subdirectory. English is the project's primary language: keep code, UI text, and docs in English.

## Where things live

| Location | What it is |
|---|---|
| This folder | Git repository root, GitHub `https://github.com/cnYui/doubletraining` (public, `main`) |
| `agent/` | **AIUI Studio import root** (contains `app.json` directly), AIUI 0.17.0, two Pages: `pages/dates/index` training calendar and `pages/day/index` day plan |
| `agent/lib/` | Pure logic: `dates.js` dates (integer day arithmetic), `workout.js` workout model and example plan, `store.js` localStorage persistence, `temple.js` temple-input de-duplication |
| `tests/` | Node unit tests (`npm test`, Node 20+); not imported into Studio |
| `docs/aiui-audit.md` | Generated UX/capability audit; regenerate after every change under `agent/` |
| `D:\CodeWorkSpace\rokid-aiui-agent-skill` | The `rokid-aiui-agent` Skill repository (the reference timer lives in `skills\rokid-aiui-agent\assets\focus-timer-agent`) |
| `C:\Users\yui\.claude\skills\rokid-aiui-agent` | Installed Skill; validation scripts are in `scripts/` |

## Change → Studio debugging loop

1. Edit `agent/`, then run `npm test` and
   `python C:/Users/yui/.claude/skills/rokid-aiui-agent/scripts/validate_aiui_project.py agent --repository-root . --target-version 0.17.0 --strict`
2. `git commit` + `git push origin main`
3. In Studio (`https://aiui.rokid.com`), the whole **New Agent** button at the top left opens a menu → **GitHub Import** → enter
   `https://github.com/cnYui/doubletraining/tree/main/agent` → **Confirm import**.
   - **Importing the same URL again updates the existing `cnYui/doubletraining` project in place** (no duplicate project), and the effect preview re-renders with the new code.
   - The project's "···" menu only offers upload to cloud / overwrite local / local import / rename / delete; there is no "pull from GitHub".
   - The import field keeps the previous URL and clearing it with the keyboard is unreliable; set it as a form value (full replacement), then confirm. The dropdown closes between separate operations, so open it and click GitHub Import in one go.
4. In the chat, send `/debug` followed by a request to run `pages/dates/index` on the simulated glasses. `/debug` turns into a chip; press the send button. The inline card appears → click **Enter** → the canvas moves into the **Effect Preview** window (480 × 352). The phrasing tested so far was Chinese; English phrasing is untested, and some phrasings get a "cannot do that" reply.
5. Right-hand **Device Simulation** panel: four temple buttons, plus voice input (click the microphone first, then type the recognized text and send). The **Log** panel shows the Page's `console.log`; **Show system logs** toggles runtime logs.

## Temple input in the simulator (Studio 1.1.0, measured)

| Temple action | Keys the Page receives | Use in this project |
|---|---|---|
| Tap | `GlobalHook` → `Enter` | Calendar: open the day; list: log a set and tick it / mark cardio done |
| Double tap | **Nothing reaches agent Pages** (confirmed with Page logs on 2026-09-11; only the system home page reacts, by clearing its chat) | Designed as "back to calendar"; cannot be tested in the simulator |
| Swipe forward | `GlobalHook` → `ArrowUp` | Calendar: previous day; list: previous exercise |
| Swipe back | `GlobalHook` → `ArrowDown` | Calendar: next day; list: next exercise |

The Pages act only on gesture keys. `lib/temple.js` drops a `GlobalHook` that follows a gesture key and treats a lone `GlobalHook` as one tap after 280 ms (physical glasses may send only that). The order on physical glasses is not verified.

The rest countdown between sets is switched off at the user's request: `REST_TIMER_ENABLED = false` in `pages/day/index.ink`; a tap only ticks the box and stays on the list.

## Studio runtime pitfalls (all worked around in code — don't undo them)

- The runtime is QuickJS with **time zone UTC (`getTimezoneOffset()` = 0)**.
- **`new Date(y, m, d)` and `setDate()` are unreliable**: the same code returned different results on consecutive calls, and the example plan was once written a month early. All date math uses integer days since 1970-01-01; "today" comes only from `Date.now()` and the UTC offset.
- **The loop variable is not resolved in attributes of the element that carries `ink:for`** (log: `Template variable 'row.tone' is missing`). Always loop with `<block ink:for ... ink:for-item="x">` wrapped around the inner element.
- **`ink:for` rows inside an `ink:if` block that is destroyed and re-created do not render again** (exercise rows vanished after returning from rest). The day Page keeps its panels mounted; each panel binds its own data-driven `full-on` class.
- **A dynamic class on the `<page>` root is not applied** (`mode-*` in `<page class="shell mode-{{mode}}">` never applied, so the day Page went black). Use only static classes on the root; put dynamic classes on ordinary `view` elements (proven on calendar rows and hints).
- **After "Enter", the effect preview keeps the `_current` target** at 480 × 352. The compact layout switches on height (`@media (max-height: 240px)`), not on target. The inline card measured 448 × 150.
- Ink's `localStorage` lives neither in the browser's localStorage nor in IndexedDB, but it survives re-renders within one Studio session. Raising `SEED_VERSION` in `store.js` rewrites the example data.
- **With the browser pane hidden the page stalls completely**: `visibilityState = hidden` and zero `requestAnimationFrame` frames, so a GitHub import sticks at the archive-unpacking step and the effect preview stops rendering. Keep the pane visible and the window in front while testing.

## Verified / not verified

**Verified in the simulator (2026-09-11):** import and re-import; the calendar renders five rows and the week counter, swipes move one day at a time, and a tap opens the day with `wx.navigateTo`; the day list renders; a tap logs a set (with the rest screen, before it was switched off); swiping during rest adjusted the next set's weight; swiping to cardio and tapping marked it done; the day Page no longer goes black after navigation.

**Not verified / open:** tap-to-tick without the rest screen (just changed); English UI text on the 480 × 352 layout; whether a covered calendar Page still receives keys (a visibility guard was added); the done state; voice routing and the `date` slot (draft agents don't register the schema); nod; everything on physical glasses. Simulator results are not device results; the Skill's release gates need signed device evidence.

## Other

- Three zero-byte files in the root — `{s.stopPropagation()`, `rangeDays)`, `{,` — are not project files. They look like cmd.exe redirects of single lines of tool text (the `)` stays in the filename, which only cmd does). Settings hooks, plugins, and `dcg` were ruled out and harmless probes did not reproduce it; a separate session is tracing the cause. The files are not committed and have not been deleted.
- This folder is planned to be renamed `Double Training`; do it after closing the Claude session (Windows won't rename a process's current directory, and session history is stored by path).
- Temporary `console.log` diagnostics (`[doubletraining] ...` lifecycle and key logs) are still in both Pages while the user debugs in Studio; remove them before release.
