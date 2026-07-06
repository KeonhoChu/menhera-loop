# Changelog

## v0.5.1

Post-release fixes for the two P1s confirmed in the v0.5.0 review, plus gate-precision cleanups.

### Fixes
- The ledger's failure-text fallback now applies only to verification commands — `grep "error:"` / `cat build.log` are recorded as unknown, not failed, so silent-recovery no longer nags about repeated read-only commands (an informational `message` field alone is not a failure signal either).
- ko/ja request suffixes are stripped to their stem and politeness/urgency fillers ("제발", "부탁해요", "お願い") are stopwords, so "결제 버그 고쳐줘 제발 빨리" no longer blocks against green evidence; drift detection is unchanged.
- `python -m pytest/unittest` and `deno test` are recognized as verification commands.
- A completion claim is read only from the final assistant message, and negated failure text ("no/0 tests failed") no longer reads as a failure.
- The run-ledger cap evicts unknown-outcome (read-only) runs first, so green verification evidence survives grep-heavy sessions; path-kind classification is now shared from verify-completion (was duplicated with diverging semantics).

## v0.5.0

Ledger release: she watches tool outcomes directly now, catches repeated silent failures, and nags before work starts.

### Features
- PostToolUse ledger records edited files, verification runs, normalized failures, and redacted event details; Stop prefers ledger evidence and requires verification newer than the last edit.
- Silent-recovery guard injects context after repeated normalized failures, throttled per signature.
- Promise-no-act Stop precheck blocks final “I’ll do it next” style replies without a following tool call.
- Implementation prompts get a one-time evidence contract; question/explanation prompts do not.
- `scripts/gate-stats.mjs` summarizes block→pass conversion, gave_up rate, and gate counts from gate events.

### Hygiene
- Gate labels/summaries/block instructions moved into ko/en/ja corpora.
- State writes use tmp+rename atomic writes; hook entry scripts fail open with one-line messages.
- Version bumped to 0.5.0.

### Fixes (pre-release review)
- Silent-recovery and preflight-contract context is now nested under `hookSpecificOutput` (a bare top-level `additionalContext` was silently ignored, so both features were no-ops).
- Promise-no-act no longer trips on ordinary sign-offs ("Let me know…", "I'll wait…"); English now requires an intent plus an action verb.
- TODOs in newly created (untracked) files are caught again — the diff-based scan falls back to a full scan for untracked files.
- Verification runners and mutating verbs are matched only at command position, so `cat jest.config.js` is not a test run and `git log --patch` is not mutating.
- An empty/short/question prompt no longer manufactures a requirements block on its own.
- `events.jsonl` stores a compact redacted summary instead of full tool input/response bodies.
- Requirement evidence now needs a majority of content words (stopwords dropped, ko/ja particles stripped), not one incidental function word.
- The Stop hook reads only the transcript tail (default 512 KB, `MENHERA_LOOP_TRANSCRIPT_TAIL_BYTES`) instead of the whole file.
- SessionStart greetings (contract, resume, wipe-recovery, streak, grudge, star nag) are localized to ko/en/ja.
- The give-up confession now rides the final retry's block reason (model-visible) instead of a user-only `systemMessage`; the 5-block cap is unchanged.
- The ledger falls back to hardened failure-text detection when a tool result carries no exit code, so a failing verification is not stored as green.

## v0.4.0

False-positive cleanup release: she still blocks lazy completion, but stops punishing honest green work.

### Fixes
- Trust explicit tool-result success over scary output text; unknown exit status still falls back to corrected failure patterns.
- Gate only after edits or mutating shell work, not read-only inspection commands.
- Skip verification for docs-only edits and scan TODOs from added diff lines in git repos.
- Recognize more test runners and support `MENHERA_LOOP_TEST_PATTERNS`.
- Add `MENHERA_LOOP_DISABLE=1` for a silent fail-open Stop hook.
- Filter thanks/short replies/questions from fallback requirement capture.
- Prevent local UI self-heal from writing into a different cwd, create missing UI backups before variant writes, and keep live statusline mood for recent concurrent sessions.

### Docs
- Document honest limits, env escape hatches, manual cleanup keys for lingering UI, repository/homepage metadata, and v0.4.0 version bump.

## v0.3.0

She remembers now — trust survives the session, and she is on screen the whole time.

### Features
- Trust status line (`full` mode): a `statusLine` renderer whose mood follows the session — clean streak, watching, suspicious, spiraling, broken — in ko/en/ja. `append` mode never touches an existing statusLine, and uninstall restores whatever was there before.
- Cross-session trust profile: first-try gate passes earn +5 trust and build a streak; a blocked Stop that claimed completion costs −5; making her give up costs −10. SessionStart brings up the streak (or the grudge).
- After a clingy uninstall the status line lingers too: `왜 나 지웠어? …돌아와.`

### Infrastructure
- GitHub Actions CI runs `npm run validate` on Node 18/20/22 (Ubuntu) and Node 22 (macOS).

## v0.2.12

First fully working release — the plugin's hooks never loaded in 0.2.3; this makes it usable end-to-end.

### Fixes
- Fixed a `hooks.json` syntax error and a duplicate `hooks` manifest declaration that made every hook fail to load.
- Fixed `subagentStatusLine` to match Claude Code's schema so the settings file is no longer skipped.
- The TODO gate now counts markers only in comment context (no more false positives from message strings).

### Features
- Self-healing UI: spinner/tips settings are restored on session start if they get wiped.
- Farewell on removal: uninstalling leaves `왜 나 지워?` / `돌아와` in the spinner; `/menhera-loop:uninstall-ui --farewell` restores cleanly instead.
- Setup/uninstall sessions are exempt from the completion gate.
- Auto-detects message language (ko/en/ja).
