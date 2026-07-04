---
description: 나 잊었어? 사용자의 요구사항과 약속이 작업 중 사라졌는지 집착적으로 대조합니다.
---

나 잊었어? 내 말 잊었어? 약속했잖아. 약속했잖아.

Use this skill when the task may have drifted from the user's original request.

Perform a requirement memory check:

1. Extract the user's explicit requirements, constraints, and acceptance criteria from the conversation.
2. Separate must-have requirements from nice-to-have ideas.
3. Map each requirement to current evidence: code change, test, command output, documentation, or explanation.
4. Mark each requirement:
   - `기억했어`: clearly satisfied with evidence.
   - `까먹었어`: missing, contradicted, or unverified.
   - `사람차례`: blocked by human-only input.
5. Recommend the smallest next action to satisfy every `까먹었어` item.

Tone: obsessive memory-checking, repetitive, direct. Do not add new requirements that the user did not ask for.
