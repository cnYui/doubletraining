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
   - **Importing a different URL creates a separate project**: importing a branch (`tree/<branch>/agent`) on 2026-09-11 added a second `cnYui/doubletraining` project instead of updating the first. Avoid `/` in branch names you import (`tree/a/b/agent` is ambiguous).
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

- The runtime is QuickJS; the effect-preview run reports **time zone UTC (`getTimezoneOffset()` = 0)**, while the chat card most likely reports the offset in seconds. `normalizeOffsetMinutes()` in `lib/dates.js` accepts both; don't use `getTimezoneOffset()` directly.
- **`new Date(y, m, d)` and `setDate()` are unreliable**: the same code returned different results on consecutive calls, and the example plan was once written a month early. All date math uses integer days since 1970-01-01; "today" comes only from `Date.now()` and the UTC offset.
- **The loop variable is not resolved in attributes of the element that carries `ink:for`** (log: `Template variable 'row.tone' is missing`). Always loop with `<block ink:for ... ink:for-item="x">` wrapped around the inner element.
- **`ink:for` rows inside an `ink:if` block that is destroyed and re-created do not render again** (exercise rows vanished after returning from rest). The day Page keeps its panels mounted; each panel binds its own data-driven `full-on` class.
- **A dynamic class on the `<page>` root is not applied** (`mode-*` in `<page class="shell mode-{{mode}}">` never applied, so the day Page went black). Use only static classes on the root; put dynamic classes on ordinary `view` elements (proven on calendar rows and hints).
- **After "Enter", the effect preview keeps the `_current` target** at 480 × 352, so the compact layout is keyed to height (`@media (max-height: 240px)`), not to the target. In the 448 × 150 chat card that query matches.
- **Inside `@media`, rules scoped under the page root did not apply**: in the chat card, `.shell .full-on` / `.shell .compact` never took effect while single-class rules in the same query did. Descendant selectors between ordinary views (`.day-sel .dnum`, `.row-focus .row-rx`) work. Keep media-query rules to plain classes.
- Ink's `localStorage` lives neither in the browser's localStorage nor in IndexedDB, but it survives re-renders within one Studio session. Raising `SEED_VERSION` in `store.js` rewrites the example data.
- **With the browser pane hidden the page stalls completely**: `visibilityState = hidden` and zero `requestAnimationFrame` frames, so a GitHub import sticks at the archive-unpacking step and the effect preview stops rendering. Keep the pane visible and the window in front while testing. No tool can show a hidden pane; if the user can't, drive Studio in the user's Chrome instead (Claude in Chrome tools; the simulator's log panel there shows `console.log` lines, but the on-screen canvas is the reliable record).

## Chat card findings (2026-09-11)

Found while capturing the deck, then measured with a temporary probe build (letters shown only while a media query matched, plus `wx.getWindowInfo()` and `onTargetChanged` logging):

- In the chat card, `(max-height: 240px)`, `(max-width: 460px)` and `(target: _current)` all match; `(min-width: 470px)`, `(min-height: 300px)` and `(target: _blank)` do not. `wx.getWindowInfo()` returns 448 × 150, `onTargetChanged` reports `_current`, and `wx.onWindowResize` is undefined.
- **Date 20 days ahead — fixed.** Before the fix the card opened Thu, Oct 1 on Fri, Sep 11 (UTC+8 as −28,800 seconds, read as minutes). With `normalizeOffsetMinutes()` the probe card opened Fri, Sep 11. The raw offset value was not captured: the log panel stayed empty.
- **Compact layout never switched on — fixed in code, not re-checked.** The height query matched; the `.shell …` rules inside it did not apply. They are plain class selectors now. The Browser pane was hidden before the fixed build could be imported, and the user chose to skip the Studio re-check.
- A new `/debug` card starts with its own example plan (0 / 15 sets), so it apparently doesn't share `localStorage` with the effect-preview run.
- The canvas in the effect preview never returns to its chat card on its own: the card's button stays disabled ("Entered"), and a simulator double tap doesn't bring it back. The card text says it returns "after going back to the desktop".

## Voice probe findings (2026-09-11, Studio simulator, branch `probe-chat-card`)

Measured with a throwaway `pages/probe/index` (kept on the `probe-chat-card` branch; import `tree/probe-chat-card/agent` to re-run it — it opens first in `app.json` there). Simulator facts, not device facts:

- Globals present: `LanguageModel`, `SpeechRecognition`, `speechSynthesis`, `SpeechSynthesisUtterance`, `wx.speech` (`playTTS`, `startRecognition`). Missing: `SpeechRecognitionSession` (0.18), `MediaRecorder`, `navigator.mediaDevices`.
- **In-page LLM with tool calls works.** `LanguageModel.availability()` → `available`; `create({ initialPrompts, tools })` → session; `session.addEventListener('toolcall', …)` delivers `functionName` + parsed `arguments` (`set_week {"days":[…7 enums…]}`, `add_exercise {"name":"Squat","sets":5,"reps":5,"kg":100}`, `update_day {"day":"wednesday","focus":"shoulders"}`). `prompt()` resolves with `""` or a short sentence after the calls. Latency 7–10 s per request; one request reached 36 s while others were queued.
- **Tool results cannot be sent back** (the event has only `callId/functionName/arguments`), so a session re-emits earlier tool calls with later answers. Use one session per utterance and carry state in the Page, or dedupe by `callId`.
- **In-page ASR works and the simulator's voice box feeds it**: `new SpeechRecognition()` + `start()` from a temple-tap handler (no user-gesture error) → `onstart` → `onresult` with the typed text (`confidence 1`, `isFinal true`) → `onend`. `stop()` works.
- **`onVoiceWakeup` fires** when the simulator's microphone button is pressed: `event.keyword === "leqi"`. With `event.preventDefault()` + `SpeechRecognition.start()` inside the handler, the utterance goes to the Page and the host's "语音识别已唤醒" state is not entered; without it the host keeps its default. The simulator must be back in the idle state (取消唤醒) before the next wake registers.
- `onTargetChanged(undefined → "_current")` fires on load in the effect preview.
- `speechSynthesis.speak()` and `wx.speech.startRecognition()` run without errors; nothing audible in the simulator.
- A simulated tap's `Enter` can arrive more than 1 s after the button press; wait ≥ 2 s before the next simulator action.
- Studio in a real Chrome window works with the same flows (needs the account logged in there). The effect preview has an "AIUI Agent / 系统模拟" switch; in "AIUI Agent" mode the preview launches `app.json`'s first page, not the `/debug` card's page.

## Verified / not verified

**Verified in the simulator (2026-09-11):** import and re-import; the calendar renders five rows and the week counter, swipes move one day at a time, and a tap opens the day with `wx.navigateTo`; the day list renders; a tap logs a set (with the rest screen, before it was switched off); swiping during rest adjusted the next set's weight; swiping to cardio and tapping marked it done; the day Page no longer goes black after navigation. After the English conversion (765f5a6): English text fits the 480 × 352 layout on both Pages; tap-to-tick without the rest screen (0 → 3 → 15 / 15 sets, focus advances to the next open exercise); the done state (15 sets, 6,580 kg, cardio 30 min, `vs Sep 4 · Bench Press +2.5 kg · Incline DB Press same · Pec Deck +5 kg`). The chat card opens the right date after the offset fix (probe build). Screenshots are in `docs/deck/shots/`.

**Not verified / open:** the compact layout in the chat card after the selector fix; the calendar Page in a chat card; whether a covered calendar Page still receives keys (a visibility guard was added); voice routing and the `date` slot (draft agents don't register the schema); nod; everything on physical glasses. Simulator results are not device results; the Skill's release gates need signed device evidence.

## Other

- Stray files in the root — `{s.stopPropagation()`, `rangeDays)`, `{,`, and `{,-` (the last one holds the Windows `AT` command's help text) — are not project files and are not committed. Cause (confirmed 2026-09-11): a global Claude Code hook of the form `cmd /c echo ...` runs through Git Bash, whose MSYS path conversion rewrites `/c` to `C:/`, so cmd starts interactively and executes the hook's stdin — the tool-call JSON — as commands. Escaped quotes in that JSON expose some `>`, `&`, and `|` characters, which created these files. This is a machine-level hook issue, not a project issue; the fix (`cmd //c "..." < /dev/null` or `MSYS_NO_PATHCONV=1`) belongs in the user's global settings.
- This folder is planned to be renamed `Double Training`; do it after closing the Claude session (Windows won't rename a process's current directory, and session history is stored by path).
- Temporary `console.log` diagnostics (`[doubletraining] ...` lifecycle and key logs) are still in both Pages while the user debugs in Studio; remove them before release.
