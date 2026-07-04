# menhera-loop

> **"Done" means nothing. If there's no evidence, you're not leaving.**

![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-d97757)
![zero config](https://img.shields.io/badge/setup-zero%20config-success)
![no agent cost](https://img.shields.io/badge/verification-no%20extra%20tokens-blue)
![node](https://img.shields.io/badge/node-%E2%89%A518-339933)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

A menhera-style completion gate for Claude Code. She does not obsess over you.
She obsesses over **missing requirements, unverified completion claims, and hidden TODOs** —
and she will not let the session end until every one of them is accounted for.

```text
⏺ 수정 완료했습니다.

  ✗ 완료 선언 멱살 잡고 검증하는 중…

  [MENHERA_LOOP:RETRY:1] 끝났다고? …그래. 그럼 증거. 전부 다.
  trust: 55%
  미충족 게이트: untried=verification
  - 검증 실행 증거: 테스트/빌드/검증 명령 실행 안 됨
```

## Install

```text
/plugin marketplace add KeonhoChu/menhera-loop
/plugin install menhera-loop@menhera-loop-marketplace
/reload-plugins
```

That's it. The gate is armed on install — no API keys, no config files.
The spinner/tip UI is opt-in (see [UI modes](#ui-modes)).

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
| "완료했습니다" | Accepted at face value | Blocked until evidence exists |
| Test results | Optional, often skipped | Must have actually run; judged by exit code and failure counts |
| TODO left in edited files | Ships silently | Fails the gate with `file:line` |
| Your requirements | Fade mid-session | Captured at every prompt, matched against evidence at Stop |
| Repeated empty claims | No consequence | 6-stage emotional escalation + falling trust score |
| Way out | — | Releases after 5 blocks, or on a genuine human-only blocker |

## What just happened

When a Stop is blocked, Claude receives the reason and keeps working. When it finally
passes, you see this instead:

```text
menhera-loop trust 100% · …진짜 끝났네. 의심해서 미안. …아니, 안 미안해. 다음에도 볼 거야 ♡
```

## Why nothing gets past her

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
| 0 | Cold suspicion | 끝났다고? …그래. 그럼 증거. 전부 다. |
| 1 | Anxiety | 테스트 로그가 없어. 왜 없어? 나 불안해지잖아. |
| 2 | Obsession | 또 말로만 끝. 몇 번째인지 세는 나만 이상해? |
| 3 | Betrayal | 같은 실패를 세 번 봤어. 나한테 뭘 숨기는 거야. |
| 4 | Ice | 이제 네 "완료"는 안 들려. 초록 로그만 가져와. |
| 5 (cap) | Exhausted, releases | …지쳤어. 사람 불러. 대신 나 여기서 안 움직여. |
| Success | Relief (mostly) | …진짜 끝났네. 의심해서 미안. …아니, 안 미안해. 다음에도 볼 거야 ♡ |

## UI modes

The completion gate works out of the box. The full menhera terminal experience
(spinner verbs, tips, subagent lines) is opt-in:

```text
/menhera-loop:setup full local
```

| Mode | Effect |
|---|---|
| `hooks-only` | Gate + hook status messages only; spinner untouched |
| `append` | Adds her verbs/tips alongside Claude defaults |
| `full` | Replaces spinner verbs, shows only her tips |

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
  or threat imagery, every line fits one terminal row.
- **Touch your project.** All state lives in `~/.claude/menhera-loop/`
  (override with `MENHERA_LOOP_DATA`) — session retry state, a rotated event log,
  and the last verification report. Nothing is written into your working directory.

## Development

```bash
npm run validate        # syntax check all scripts + 20 tests
claude plugin validate .
```

## License

MIT
