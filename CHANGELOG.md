# Changelog

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
