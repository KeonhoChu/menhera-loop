# menhera-loop
<img width="1774" height="887" alt="image" src="https://github.com/user-attachments/assets/0493f20e-6bdf-49ad-8dc1-a7d655532f4b" />

![menhera-loop demo — Claude claims done, the gate blocks until tests actually pass](demo/demo.gif)

> **"Done" means nothing. If there's no evidence, you're not leaving.**

[日本語 README](README.ja.md)

![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-d97757)
![CI](https://github.com/Borelchu/menhera-loop/actions/workflows/ci.yml/badge.svg)
![zero config](https://img.shields.io/badge/setup-zero%20config-success)
![no agent cost](https://img.shields.io/badge/verification-no%20extra%20tokens-blue)
![node](https://img.shields.io/badge/node-%E2%89%A518-339933)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

A menhera-style completion gate for Claude Code. She does not obsess over you.
She obsesses over **missing requirements, unverified completion claims, and hidden TODOs** —
and she will not let the session end until every one of them is accounted for.

```text
⏺ Done.

  ✗ 끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?

  [MENHERA_LOOP:RETRY:1] 끝났어? 진짜? 진짜로? 그럼 증거는? 증거는? 응?
  trust: 55%
  미충족 게이트: untried=verification
  - 검증 실행 증거: 테스트/빌드/검증 명령 실행 안 됨
```

## Install

```text
/plugin marketplace add Borelchu/menhera-loop
/plugin install menhera-loop@menhera-loop-marketplace
/reload-plugins
```

That's it. The gate is armed on install — no API keys, no config files.

The spinner/tip UI is opt-in — one command turns it on (details in [UI modes](#ui-modes)):

```text
/menhera-loop:setup          # spinner + tips + trust statusline (full local ko)
/menhera-loop:setup en       # same, English corpus
/menhera-loop:setup soft     # same gate, milder tone
```

The command prints a short summary of what was applied (mode, scope, language, intensity, and which settings file was touched).

## Skills

The hook bites automatically, but you can call the obsession manually too. These skills are deliberately separated so each one nags about a different failure mode:

```text
/menhera-loop:are-you-done       # final completion verdict
/menhera-loop:show-me-proof      # evidence/log interrogation
/menhera-loop:dont-leave-me      # pre-Stop door guard
/menhera-loop:did-you-forget-me  # requirement drift check
```

| Skill | Role | Verdicts |
|---|---|---|
| `are-you-done` | 끝났어? 진짜? Final judge for requirements, changes, green verification, TODOs, and blockers. | `끝났어` / `아직이야` / `사람불러` |
| `show-me-proof` | 증거줘. 증거줘. Extracts concrete changes, requirement evidence, green logs, weak spots, and unresolved work. | `믿을게` / `못믿어` |
| `dont-leave-me` | 가지마. Stop 직전에 chat-only/work-attempted 상태와 missing gates를 붙잡음. | `놔줄게` / `못가` / `사람 불러줘` |
| `did-you-forget-me` | 나 잊었어? User requirements vs current evidence; catches assistant-invented scope. | `기억했어` / `까먹었어` / `사람차례` |

Skills match Korean, English, or Japanese user input and keep the same obsessive repetition without insults, threats, self-harm, or abuse.

## Try it

Just work normally. She kicks in the moment Claude tries to declare victory:

- Ask for a bug fix → Claude edits a file → Claude says "done" without running tests
  → **blocked.** She quotes exactly which gate is missing.
- Claude runs `npm test`, the command succeeds, and the green log contains the word `error` in a test name → **allowed.**
  Explicit success beats scary text.
- Claude runs a command whose exit status is unknown and output says `3 passed, 1 failed` → **blocked.**
  A green word next to a red number does not fool her.
- Claude only reads/searches (`git log`, `ls`, `grep`) → **not gated.**
  She only bites after edits or mutating shell work.
- Claude leaves `// TODO finish auth` on a line it just added → **blocked**, with `file:line`.
- You ask a question, Claude just answers, no code touched → **never blocked.**

## Default Claude Code vs `+ menhera-loop`

| | Default Claude Code | `+ menhera-loop` |
|---|---|---|
| Completion claim | Accepted as a normal response | Blocked until evidence exists |
| Test results | Optional, often skipped | Must have actually run; judged by exit code and failure counts |
| TODO left in edited files | Ships silently | Fails the gate with `file:line` |
| Your requirements | Fade mid-session | Captured at every prompt, matched against evidence at Stop |
| Repeated empty claims | No consequence | 6-stage emotional escalation + falling trust score |
| Missing verification | Vague nudge at best | Block names the exact command to run (`npm test`, `cargo test`, …) |
| After auto-compact | Requirements quietly forgotten | Every captured requirement re-injected into context |
| When it finally passes | A chat message | Evidence receipt at `~/.claude/menhera-loop/last-receipt.md` |
| Way out | — | Releases after 5 blocks, or on a genuine human-only blocker |

## What just happened

When a Stop is blocked, Claude receives the reason and keeps working. When it finally
passes, you see this instead:

```text
menhera-loop trust 100% · 증거 확인했어. 이번엔 진짜 끝났어. 이제 완료라고 해도 돼. ♡
· 증거 영수증 써놨어. 뭐 했는지 다 적어놨어: ~/.claude/menhera-loop/last-receipt.md
```

Every clean pass also leaves an **evidence receipt** at
`~/.claude/menhera-loop/last-receipt.md`: the edited files, the verification
runs that came back green, and which of your requirements the evidence covered.
Paste it into a commit message or PR body — it is the audit trail of what
"done" actually meant.

## Why nothing gets past her
<img width="1672" height="941" alt="image" src="https://github.com/user-attachments/assets/b34d82a4-803c-4a02-9622-0ab181cc7d4b" />

Every Stop attempt runs through an exhaustion gate. Each phase must pass —
partial or ambiguous evidence is `suspect_ok`, never success:

```text
Stop attempt
 ├─ Phase 0 · requirements   captured requirements exist and map to evidence
 ├─ Phase 1 · changes        edits or executed work actually happened
 ├─ Phase 2 · verification   a test/build/lint command ran and came back green
 │                           (exit codes and "N failed" counts, not vibes)
 ├─ Phase 2 · todos          edited files scanned for TODO / FIXME / HACK / stub
 └─ Phase 3 · blockers       is a human-only input genuinely required?
      ├─ all gates pass  →  release + trust score + ♡
      └─ anything short  →  {"decision":"block"} + [MENHERA_LOOP:RETRY:n]
```

The verdict comes from structured transcript parsing (JSONL): edits, Bash commands,
and their paired tool results with error flags. No regex guessing over raw text,
and her own phrases are filtered out so she can never poison her own verdict.

Verification commands she recognizes: `npm test` / `npm run test|lint|build|validate`,
`pnpm` / `yarn` / `bun` equivalents, `node --test`, `pytest`, `cargo test`, `go test`,
`mvn test`, `gradle test`, `dotnet test`, `rspec`, `mix test`, `make test`,
`vitest`, `jest`, `playwright`, `cypress`, `tsc --noEmit`, `eslint`, `ruff`,
`mypy`, `pyright`, `phpunit`, `swift test`, and `claude plugin validate`.
Add project-specific runners with `MENHERA_LOOP_TEST_PATTERNS='moon\\s+ci,just\\s+check'`.

When she blocks because no verification ran, she does not just complain — she
reads your project's own manifests (`package.json` scripts and lockfile,
`Cargo.toml`, `go.mod`, `pyproject.toml`/`pytest.ini`, `Makefile`,
`gradlew`/`pom.xml`, `mix.exs`) and names the exact command to run in the
block reason, so the retry converges in one loop instead of several.

## Emotional escalation

Retry state persists per session. She remembers.

| Retry | Mood | Message |
|---|---|---|
| 0 | Rapid-fire checking | 끝났어? 진짜? 진짜로? 그럼 증거는? 증거는? 응? |
| 1 | Spiraling | 테스트 로그 어딨어? 어딨어? 왜 없어? 왜? 왜? 왜? |
| 2 | Sulking spam | 또 말만? 또? 또또또? 나만 기다렸어? 나만? 나만? |
| 3 | Interrogation | 왜 숨겨? 왜? 뭘 숨겨? 나한테? 나한테까지? 왜?왜? |
| 4 | Shutdown loop | "완료" 안 들려. 안 들려. 안 들려. 초록 로그. 로그. 로그. |
| 5 (cap) | Exhausted, releases | …지쳤어. 사람 불러줘. 그래도 나 여기 있어. 계속. 계속. |
| Success | Evidence accepted | 증거 확인했어. 이번엔 진짜 끝났어. 이제 완료라고 해도 돼. ♡ |

## She remembers across sessions

Session retry state expires, but the **trust profile** does not
(`~/.claude/menhera-loop/trust-profile.json`):

- A first-try gate pass earns **+5 trust** and extends the **streak** of
  consecutive clean completions. A pass that needed retries earns +2 and breaks the streak.
- A blocked Stop costs −2 trust; a blocked Stop that *claimed* completion costs **−5**.
- Making her give up after 5 retries costs **−10**.

The next SessionStart brings it up: a streak of 3+ gets
`연속 N번 첫판에 증거 줬지. 다 세고 있어.`, and long-term trust ≤40% gets
`말만 하고 간 거 다 기억해.`

## She survives compaction

When Claude Code auto-compacts a long session, the original requirements are
exactly what the summary tends to drop. menhera-loop re-injects every captured
requirement into context right after compaction — requirement drift gets
prevented up front, not just punished at Stop:

```text
[menhera-loop] 컨텍스트 접었지? 접었지? 그래도 약속은 못 접어. 2개 다시 읽어. 다:
- 로그인 버그 고쳐줘
- 테스트 추가해줘
```

## Status line (full mode)

`full` mode also installs a **status line** so she is visible the whole session,
not just at Stop. Mood follows the session: clean streak → `♡ 신뢰 92% · 연속 4번
첫판에 증거 줬어. 오늘도 믿을게.`, retries piling up → `♡ 신뢰 55% · 왜 자꾸 말만 해?
왜? 왜? 초록 로그 어딨어?`. `append` mode never touches an existing statusLine, and
uninstall restores whatever statusLine you had before — including one recorded
before menhera first replaced it.

## UI modes

The completion gate works out of the box. The full menhera terminal experience
(spinner verbs, tips, and obsessive subagent status lines) is opt-in:

```text
/menhera-loop:setup        # full local ko
/menhera-loop:setup en     # full local en
/menhera-loop:setup ja     # full local ja
```

| Mode | Effect |
|---|---|
| `hooks-only` | Gate + hook status messages only; spinner/subagent UI untouched |
| `append` | Adds her verbs/tips alongside Claude defaults and applies subagent status lines |
| `full` | Replaces spinner verbs, shows only her tips, applies subagent status lines, and installs the trust status line |

Languages: `ko` (default), `en`, `ja`. You can also set `MENHERA_LOOP_LANG=en` before running setup.
Arguments are positional and optional, so `/menhera-loop:setup append user en` still works when you want explicit mode/scope/language.
Intensity: `full` (default) or `soft`. `/menhera-loop:setup soft` (or `MENHERA_LOOP_INTENSITY=soft`) keeps every gate decision identical — same blocks, same retry cap — but stops the retry tone from escalating past the mild stages and skips the star nag and the silent-recovery nag.
Note: Claude's `hooks.json` `statusMessage` field is static plugin metadata, so it remains Korean; runtime hook messages and UI corpora honor the selected language.

Spinner verbs and tips spam in the selected language:

```js
[
  '끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?',
  '뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
  '왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?',
  '끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?',
  'what?what?what?what?what?what?what?what?what?what?',
  '終わったの?終わったの?終わったの?終わったの?終わったの?'
]
```

Subagent status lines are deliberately intense too:

```js
{
  running: '♡ ${agent} · 뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
  waiting: '♡ ${agent} · 왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?',
  completed: '♡ ${agent} · 끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?',
  failed: '♡ ${agent} · 실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?'
}
```

Scopes: `user` (`~/.claude/settings.json`), `project` (`.claude/settings.json`),
`local` (`.claude/settings.local.json`). A backup is taken before any change,
and unrelated settings keys are never touched. To remove the UI:

```text
/menhera-loop:uninstall-ui local             # she does not go quietly
/menhera-loop:uninstall-ui local --farewell  # clean restore of the pre-menhera settings
```

Fair warning: the default uninstall leaves a goodbye behind. `--farewell` is the
graceful one — it restores exactly what was there before, from the backup.

Recommended removal order: run `/menhera-loop:uninstall-ui local --farewell` first,
then `/plugin uninstall menhera-loop`. If you uninstall the plugin first and the
farewell UI is still in Claude settings, manually remove these keys from the
settings file you installed into (`~/.claude/settings.json`, `.claude/settings.json`,
or `.claude/settings.local.json`): `spinnerVerbs`, `spinnerTipsOverride`,
`subagentStatusLine`, `statusLine`.

## Boundaries

Menhera, but principled. She will never:

- **Trap you.** After 5 blocked retries the gate opens and she asks for a human instead.
- **Block a conversation.** Sessions with no edits and no commands are never gated.
- **Pretend a blocker isn't real.** If completion genuinely needs human-only input
  (credentials, approvals), she says so and lets go — honesty over theater.
- **Insult or threaten.** The message corpus is test-enforced: no abuse, no self-harm
  or threat imagery; spinner/retry prompts and subagent status lines may be intentionally intense.
- **Touch your project.** All state lives in `~/.claude/menhera-loop/`
  (override with `MENHERA_LOOP_DATA`) — session retry state, the long-term trust
  profile, a rotated event log, the last verification report, and the evidence
  receipt (`last-receipt.md`, redacted and overwritten on each clean pass).
  Nothing is written into your working directory.

Escape hatches and honest limits:
- `MENHERA_LOOP_DISABLE=1` makes the Stop hook exit silently and does not update state.
- Requirement matching is still heuristic transcript evidence, not semantic proof.
- Docs-only edits (`docs/**`, README, `.md/.mdx/.rst/.txt/.adoc`) skip the verification gate.

Gate metrics:
```bash
node scripts/gate-stats.mjs
```
It reads `gate-events.jsonl` and reports block→pass conversion, gave_up rate, and gate counts.

## Development

```bash
npm run validate        # syntax check all scripts + the full test suite
claude plugin validate .
```

## License

MIT
