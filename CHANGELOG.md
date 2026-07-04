# Changelog

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
