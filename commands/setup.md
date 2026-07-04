---
description: Configure menhera-loop Claude Code UI messaging.
argument-hint: "[hooks-only|append|full] [user|project|local] [ko|en|ja]"
---

Configure menhera-loop UI settings without overwriting unrelated Claude Code settings.

Use the user's arguments to choose mode, scope, and language:

- Mode `hooks-only`: do not change spinner UI settings; plugin hooks still provide status messages.
- Mode `append`: add menhera-loop spinner verbs and tips while keeping Claude defaults.
- Mode `full`: replace spinner verbs and show only menhera-loop tips.
- Scope `user`: `~/.claude/settings.json`.
- Scope `project`: `.claude/settings.json`.
- Scope `local`: `.claude/settings.local.json`.
- Language `ko`: Korean obsessive message corpus.
- Language `en`: English obsessive message corpus.
- Language `ja`: Japanese obsessive message corpus.

Defaults: `full local ko` unless `MENHERA_LOOP_LANG` is set. Short forms like `en` or `ja` are enough; omitted mode/scope fall back to `full local`.

Run this command from the plugin root:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-ui.mjs" --mode full --scope local --lang ko
# Equivalent simple user-facing forms:
# /menhera-loop:setup
# /menhera-loop:setup en
# /menhera-loop:setup ja
```

Adjust `--mode`, `--scope`, and `--lang` to match the user's arguments. The script creates a menhera-loop backup before touching `spinnerVerbs`, `spinnerTipsOverride`, or `subagentStatusLine`; all other settings keys must be preserved.
