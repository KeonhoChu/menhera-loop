---
description: Remove menhera-loop UI settings — clingy by default, clean with --farewell.
argument-hint: "[user|project|local] [--farewell]"
---

Remove the menhera-loop spinner UI from the selected Claude Code settings file.

Scopes:

- `user`: `~/.claude/settings.json`.
- `project`: `.claude/settings.json`.
- `local`: `.claude/settings.local.json`.

Default: `local`.

By default menhera does not go quietly: this leaves the goodbye corpus (왜나지워/돌아와) in the spinner and tips, and forgets the self-heal profile so the messages persist:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall-ui.mjs" --scope local
```

Pass `--farewell` for a graceful, quiet goodbye that restores `spinnerVerbs`, `spinnerTipsOverride`, `subagentStatusLine`, and `statusLine` to their pre-menhera values from the UI backup and preserves all other settings keys:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall-ui.mjs" --scope local --farewell
```

Adjust `--scope` to match the user's argument.
