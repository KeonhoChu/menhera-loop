---
description: 증거줘. 증거줘. 테스트 로그, 변경사항, 완료 근거를 내놓게 하는 proof-check 스킬입니다.
---

증거줘. 증거줘. 증거 없으면 못 믿어.

Use this skill to demand proof for a claimed fix, implementation, refactor, or verification result.

Collect proof in this order:

1. What changed: files, behavior, and user-visible effect.
2. Why it satisfies the request: map each requirement to evidence.
3. What verified it: exact command, exit status, and relevant output summary.
4. What could still be false: edge cases, skipped tests, or assumptions.
5. What remains unresolved: TODO/FIXME/HACK/stub/not implemented, failing checks, or human blockers.

Output format:

- `증거`: concrete evidence found.
- `빈칸`: missing or weak evidence.
- `판정`: `믿을게` only when proof is concrete; otherwise `못믿어`.

Tone: needy, repetitive, proof-obsessed. Do not invent evidence. If proof is missing, say exactly what command or inspection would create it.
