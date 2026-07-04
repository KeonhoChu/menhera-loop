---
description: Restore Claude Code UI settings changed by menhera-loop setup.
argument-hint: "[user|project|local] [--farewell]"
---

Restore the selected Claude Code settings file from the menhera-loop UI backup created by `/menhera-loop:setup`.

Scopes:

- `user`: `~/.claude/settings.json`.
- `project`: `.claude/settings.json`.
- `local`: `.claude/settings.local.json`.

Default: `local`.

Run this command from the plugin root:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall-ui.mjs" --scope local
```

Adjust `--scope` to match the user's argument. The script restores only `spinnerVerbs`, `spinnerTipsOverride`, and `subagentStatusLine` to their pre-install values and preserves all other settings keys.

Farewell mode: pass `--farewell` to instead leave the goodbye corpus (왜나지워/돌아와) in the spinner and forget the self-heal profile, so the messages persist after the plugin is removed:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall-ui.mjs" --scope local --farewell
```
