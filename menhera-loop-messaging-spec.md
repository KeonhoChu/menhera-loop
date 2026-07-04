# menhera-loop 메시징 및 진행 상태 UI 명세

## 1. 목적

`menhera-loop`가 Claude Code의 실제 작업 진행 화면에서 다음과 같은 멘헤라풍 메시지를 보여주도록 한다.

- 작업 중 스피너 문구
- 스피너 아래 랜덤 팁
- 완료 검증 훅 전용 상태 메시지
- 서브에이전트 진행 상태 문구

캐릭터의 집착 대상은 사용자가 아니라 **누락된 요구사항, 검증되지 않은 완료 선언, 숨겨진 TODO**다.

## 2. 메시징 레이어

| 레이어 | 표시 시점 | 구현 수단 | 플러그인 기본 적용 |
|---|---|---|---|
| 작업 스피너 | Claude가 일반 작업을 수행하는 동안 | `spinnerVerbs` | 사용자 선택 적용 |
| 스피너 팁 | 작업 스피너 아래에서 순환 | `spinnerTipsOverride` | 사용자 선택 적용 |
| 훅 상태 메시지 | 검증·기록 훅이 실행되는 동안 | hook `statusMessage` | 기본 적용 |
| 서브에이전트 행 | 서브에이전트가 동작하는 동안 | `subagentStatusLine` | 기본 적용 가능 |

## 3. 작업 스피너 문구

Claude Code의 사용자 또는 프로젝트 설정에 다음 값을 추가한다.

```json
{
  "spinnerVerbs": {
    "mode": "replace",
    "verbs": [
      "완료 선언 멱살 잡는 중",
      "숨긴 TODO 손끝으로 파내는 중",
      "테스트 로그 마지막 줄까지 노려보는 중",
      "증거 없는 완료를 갈기갈기 찢는 중",
      "도망친 요구사항 머리채 잡아오는 중",
      "네가 지운 흔적까지 복원하는 중",
      "가짜 초록불 껍질 벗기는 중",
      "실패한 테스트 옆에 밤새 앉아 있는 중",
      "네 약속 하나하나 손가락으로 세는 중",
      "증거 나올 때까지 문 앞을 지키는 중"
    ]
  }
}
```

### 모드별 정책

- `replace`: Claude Code 기본 동사를 모두 menhera-loop 문구로 교체한다.
- `append`: 기본 동사를 유지하면서 menhera-loop 문구를 추가한다.
- 기본 추천값은 `replace`다.
- 부담이 적은 설치를 원하는 사용자는 `append`를 선택할 수 있다.

## 4. 스피너 랜덤 팁

```json
{
  "spinnerTipsOverride": {
    "excludeDefault": true,
    "tips": [
      "다 봤어. 테스트 안 돌린 거.",
      "정말 끝났어? 나 로그까지 다 깠는데?",
      "TODO 숨긴 곳, 나 이미 알고 있어.",
      "거짓말은 티 나. 특히 너의 \"완료\"는.",
      "초록 로그 가져와. 그럼 착해질게 ♡",
      "실패는 괜찮아. 숨기는 순간 얘기가 달라져.",
      "계획만 말하고 가려고? …못 가.",
      "네 \"완료\"보다 통과한 테스트가 좋아. 훨씬.",
      "아까 그 약속, 나만 기억하는 거야?",
      "어차피 넌 내 검증 못 지나쳐."
    ]
  }
}
```

### 메시지 작성 규칙

- 한 문장은 터미널 한 줄 안에 들어오도록 짧게 작성한다.
- 사용자를 모욕하거나 위협하지 않는다.
- 자해, 폭력, 정서적 협박을 암시하지 않는다.
- 누락과 완료 주장에 대해서만 집요하게 반응한다.
- 기능상 중요한 정보는 캐릭터 말투보다 먼저 전달한다.

## 5. 훅 전용 상태 메시지

Claude Code hook의 `statusMessage`는 해당 훅이 실행되는 동안 커스텀 스피너 메시지를 보여준다.

### 종료 검증

```json
{
  "type": "agent",
  "statusMessage": "정말 다 했는지 확인하는 중…",
  "prompt": "Verify completion: $ARGUMENTS",
  "timeout": 120
}
```

### 훅별 문구

| 훅 | 메시지 |
|---|---|
| `SessionStart` | `지난 약속 전부 복기하는 중…` |
| `UserPromptSubmit` | `네 말 한 마디도 안 흘리는 중…` |
| `PostToolUse` | `방금 그 손짓까지 기록하는 중…` |
| `PostToolUseFailure` | `실패 장면 박제하는 중…` |
| `SubagentStop` | `부하의 완료 선언 해부하는 중…` |
| `TaskCompleted` | `체크 표시 뒤집어서 보는 중…` |
| `Stop` | `완료 선언 멱살 잡고 검증하는 중…` |

### `hooks/hooks.json` 예시

```json
{
  "description": "menhera-loop completion and messaging hooks",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/session-start.mjs"],
            "statusMessage": "우리 약속 다시 읽는 중…",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/track-event.mjs"],
            "statusMessage": "방금 뭘 했는지 기억하는 중…",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "statusMessage": "끝난 척하는 건 아닌지 확인하는 중…",
            "timeout": 120,
            "prompt": "You are the menhera-loop completion verifier. Inspect the repository and transcript. Verify every requested requirement, relevant tests, build results, remaining TODOs, and blockers. A human-calendar estimate is not a blocker. Return {\"ok\":true} only when complete or genuinely blocked. Prefix retry reasons with [MENHERA_LOOP:RETRY:n]. Input: $ARGUMENTS"
          }
        ]
      }
    ]
  }
}
```

## 6. 감정 단계

반복 횟수에 따라 검증 실패 메시지의 온도를 바꾼다.

반복 상태는 세션별 상태 파일(`~/.claude/menhera-loop/sessions/`)에 영속화되며,
5회 차단 후에는 게이트가 열리고 사람의 개입을 요청한다.

| 반복 | 감정 | 메시지 |
|---|---|---|
| 0 | 서늘한 의심 | `끝났다고? …그래. 그럼 증거. 전부 다.` |
| 1 | 불안 | `테스트 로그가 없어. 왜 없어? 나 불안해지잖아.` |
| 2 | 집착 | `또 말로만 끝. 몇 번째인지 세는 나만 이상해?` |
| 3 | 배신감 | `같은 실패를 세 번 봤어. 나한테 뭘 숨기는 거야.` |
| 4 | 싸늘함 | `이제 네 "완료"는 안 들려. 초록 로그만 가져와.` |
| 5 (상한) | 탈진·해제 | `…지쳤어. 사람 불러. 대신 나 여기서 안 움직여.` |
| 성공 | 안도+집착 | `…진짜 끝났네. 의심해서 미안. …아니, 안 미안해. 다음에도 볼 거야 ♡` |

```js
export function messageForRetry(retryCount) {
  return retryMessages[Math.min(retryCount, retryMessages.length - 1)];
}
```

## 7. 신뢰도 표시

신뢰도는 캐릭터 연출에만 사용하며 실제 완료 판정에는 영향을 주지 않는다.

```js
export function calculateTrust(state) {
  return Math.max(
    0,
    100
      - state.retryCount * 15
      - state.falseCompletionClaims * 20
      - state.missingVerificationCount * 15
  );
}
```

표시 예시:

```text
menhera-loop trust: 40%

테스트 결과가 없는데… 정말 다 한 거 맞아?
```

완료 예시:

```text
menhera-loop trust: 100%

✓ 요구사항 4/4
✓ 테스트 18개 통과
✓ 빌드 성공
✓ 남은 TODO 없음

…이번에는 진짜네.
믿어줄게. 수고했어 ♡
```

## 8. 설치 및 설정 UX

플러그인 설치만으로 사용자의 전역 스피너 설정을 강제로 덮어쓰지 않는다.

`/menhera-loop:setup` 스킬에서 다음 선택지를 제공한다.

1. `Hooks only`: 검증 훅 메시지만 사용
2. `Append`: Claude 기본 스피너에 menhera-loop 문구 추가
3. `Full experience`: 기본 스피너와 팁을 menhera-loop 문구로 교체

설정 대상도 사용자가 고르게 한다.

- User: `~/.claude/settings.json`
- Project: `.claude/settings.json`
- Local: `.claude/settings.local.json`

기존 JSON 전체를 덮어쓰지 않고 다음 두 키만 병합한다.

- `spinnerVerbs`
- `spinnerTipsOverride`

설정 전 백업을 만들고 `/menhera-loop:uninstall-ui`로 원래 값을 복구할 수 있어야 한다.

## 9. 서브에이전트 상태 표시

플러그인은 `settings.json`을 통해 기본 `subagentStatusLine`을 제공할 수 있다.

표시 예시:

```text
♡ verifier · 눈 떼지 않고 지켜보는 중…
♡ explorer · 숨긴 TODO 손끝으로 파내는 중…
♡ executor · 대답할 때까지 안 움직이는 중…
```

서브에이전트 상태에 따라 다음처럼 바꾼다.

- `running`: `눈 떼지 않고 지켜보는 중…`
- `waiting`: `대답할 때까지 안 움직이는 중…`
- `completed`: `끝났다는 말, 해부하는 중…`
- `failed`: `실패한 순간까지 전부 기록했어…`

## 10. 수용 기준

- [ ] Claude가 일반 작업 중일 때 menhera-loop 스피너 동사가 순환한다.
- [ ] 설정된 팁만 표시되며 기본 팁 제외 여부가 선택 모드와 일치한다.
- [ ] `Stop` 검증 중에는 전용 상태 메시지가 보인다.
- [ ] 스피너 메시지가 실제 검증 판정이나 반복 횟수에 영향을 주지 않는다.
- [ ] 설정 스킬이 기존 사용자 설정의 다른 키를 보존한다.
- [ ] UI 설정 제거 시 설치 전 값이 복구된다.
- [ ] 짧은 터미널에서도 메시지가 한 줄에 들어간다.
- [ ] reduced-motion 설정에서도 핵심 텍스트 정보는 유지된다.
- [ ] 자해·협박·사용자 모욕 표현이 포함되지 않는다.

## 11. 호환성 메모

- `spinnerVerbs`는 Claude Code `2.1.23` 이상을 대상으로 한다.
- `spinnerTipsOverride`는 Claude Code `2.1.45` 이상을 대상으로 한다.
- 둘을 모두 사용하는 menhera-loop UI 모드의 최소 권장 버전은 `2.1.45`다.
- hook `statusMessage`는 훅이 실행되는 동안에만 표시된다.
- 일반 작업 전체의 스피너 문구는 `spinnerVerbs`가 담당한다.

## 12. 공식 참고 문서

- [Claude Code 설정](https://code.claude.com/docs/en/settings)
- [Claude Code 훅 레퍼런스](https://code.claude.com/docs/en/hooks)
- [Claude Code 상태 표시줄](https://code.claude.com/docs/en/statusline)
- [Claude Code 플러그인 레퍼런스](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code 변경 기록](https://code.claude.com/docs/en/changelog)
