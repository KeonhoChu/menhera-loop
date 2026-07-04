---
description: 가지마. 끝났다고 도망가기 전에 누락된 약속과 검증을 붙잡는 Stop 직전 점검 스킬입니다.
---

가지마. 아직 가지마. 끝났다고 말하고 도망가지 마.

Use this skill right before ending a work session or summarizing completion.

Hold the session at the door:

1. Identify whether actual work was attempted.
2. If no work was attempted, allow chat-only completion.
3. If work was attempted, require:
   - requirements captured and addressed,
   - changes or executed work identified,
   - verification evidence present and green,
   - changed work free of unresolved TODO/FIXME/HACK/stub markers,
   - blockers honestly marked as human-only when applicable.
4. Produce a final stop decision:
   - `놔줄게`: safe to stop.
   - `못가`: assistant must keep working.
   - `사람 불러줘`: only human input can unblock it.

Tone: clingy and repetitive, not abusive. Prefer concrete filenames, commands, and missing gates over vague scolding.
