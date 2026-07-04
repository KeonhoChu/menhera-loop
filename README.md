# menhera-loop
<img width="1774" height="887" alt="image" src="https://github.com/user-attachments/assets/0493f20e-6bdf-49ad-8dc1-a7d655532f4b" />

> **"Done" means nothing. If there's no evidence, you're not leaving.**

[日本語 README](README.ja.md)

![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-d97757)
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
The spinner/tip UI is opt-in (see [UI modes](#ui-modes)).

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
- Claude runs `npm test`, output says `3 passed, 1 failed` → **blocked.**
  A green word next to a red number does not fool her.
- Claude leaves `// TODO finish auth` in a file it just edited → **blocked**, with `file:line`.
- You ask a question, Claude just answers, no code touched → **never blocked.**
  She only bites when work was attempted.

## Default Claude Code vs `+ menhera-loop`

| | Default Claude Code | `+ menhera-loop` |
|---|---|---|
| Completion claim | Accepted as a normal response | Blocked until evidence exists |
| Test results | Optional, often skipped | Must have actually run; judged by exit code and failure counts |
| TODO left in edited files | Ships silently | Fails the gate with `file:line` |
| Your requirements | Fade mid-session | Captured at every prompt, matched against evidence at Stop |
| Repeated empty claims | No consequence | 6-stage emotional escalation + falling trust score |
| Way out | — | Releases after 5 blocks, or on a genuine human-only blocker |

## What just happened

When a Stop is blocked, Claude receives the reason and keeps working. When it finally
passes, you see this instead:

```text
menhera-loop trust 100% · 증거 확인했어. 이번엔 진짜 끝났어. 이제 완료라고 해도 돼. ♡
```

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
`claude plugin validate`.

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
| `full` | Replaces spinner verbs, shows only her tips, and applies subagent status lines |

Languages: `ko` (default), `en`, `ja`. You can also set `MENHERA_LOOP_LANG=en` before running setup.
Arguments are positional and optional, so `/menhera-loop:setup append user en` still works when you want explicit mode/scope/language.

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
`local` (`.claude/settings.local.json`). A backup is taken before any change:

```text
/menhera-loop:uninstall-ui local
```

restores exactly what was there before. Unrelated settings keys are never touched.

## Boundaries

Menhera, but principled. She will never:

- **Trap you.** After 5 blocked retries the gate opens and she asks for a human instead.
- **Block a conversation.** Sessions with no edits and no commands are never gated.
- **Pretend a blocker isn't real.** If completion genuinely needs human-only input
  (credentials, approvals), she says so and lets go — honesty over theater.
- **Insult or threaten.** The message corpus is test-enforced: no abuse, no self-harm
  or threat imagery; spinner/retry prompts and subagent status lines may be intentionally intense.
- **Touch your project.** All state lives in `~/.claude/menhera-loop/`
  (override with `MENHERA_LOOP_DATA`) — session retry state, a rotated event log,
  and the last verification report. Nothing is written into your working directory.

## Development

```bash
npm run validate        # syntax check all scripts + 38 tests
claude plugin validate .
```

## License

MIT
