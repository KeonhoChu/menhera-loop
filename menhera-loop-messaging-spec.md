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
      "정말 끝났는지 의심하는 중",
      "숨긴 TODO 찾는 중",
      "테스트 결과 기다리는 중",
      "완료 선언을 노려보는 중",
      "도망 못 가게 붙잡는 중",
      "네가 한 말을 다시 읽는 중",
      "조금만 더 같이 있는 중",
      "실패한 테스트를 바라보는 중",
      "빠뜨린 요구사항 세는 중",
      "증거가 올 때까지 기다리는 중"
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
      "테스트 없이 끝났다고 하면… 조금 서운할지도.",
      "정말 다 했어? 정말? 진짜로?",
      "TODO 하나쯤 숨겨도 모를 거라고 생각했어?",
      "1주일 걸린다고? 지금 할 수 있는 것부터 하자.",
      "실패해도 괜찮아. 숨기는 건 안 돼.",
      "증거를 보여주면 순순히 믿어줄게 ♡",
      "계획만 말하고 끝내면 다시 불러낼 거야.",
      "테스트 결과가 있으면 조금 더 믿어줄지도.",
      "아까는 검증한다고 했잖아. 기억하고 있어.",
      "완료라는 말보다 통과한 테스트가 더 좋아."
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
| `SessionStart` | `우리 약속 다시 읽는 중…` |
| `PostToolUse` | `방금 뭘 했는지 기억하는 중…` |
| `PostToolUseFailure` | `실패한 이유를 놓치지 않는 중…` |
| `SubagentStop` | `정말 맡은 일을 다 했는지 묻는 중…` |
| `TaskCompleted` | `완료 표시를 믿어도 될지 확인하는 중…` |
| `Stop` | `끝난 척하는 건 아닌지 확인하는 중…` |

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

| 반복 | 감정 | 메시지 예시 |
|---|---|---|
| 0 | 다정한 의심 | `끝났어? 응, 확인만 해볼게.` |
| 1 | 불안 | `테스트 결과가 없는데… 정말 다 한 거 맞아?` |
| 2 | 집착 | `또 말로만 끝났다고 하네. 직접 실행해서 보여줘.` |
| 3 | 서운함 | `같은 실패를 또 보고 있어. 나한테 숨기지 마.` |
| 4 | 싸늘함 | `이제 완료 선언은 안 믿어. 실패 원인과 증거만 말해.` |
| 성공 | 안도 | `…이번에는 진짜네. 믿어줄게. 수고했어 ♡` |

```js
const messages = [
  "끝났어? 응, 확인만 해볼게.",
  "테스트 결과가 없는데… 정말 다 한 거 맞아?",
  "또 말로만 끝났다고 하네. 직접 실행해서 보여줘.",
  "같은 실패를 또 보고 있어. 나한테 숨기지 마.",
  "이제 완료 선언은 안 믿어. 실패 원인과 증거만 말해."
];

export function messageForRetry(retryCount) {
  return messages[Math.min(retryCount, messages.length - 1)];
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
♡ verifier · 테스트 결과를 놓치지 않는 중…
♡ explorer · 숨겨진 TODO를 뒤지는 중…
♡ executor · 약속한 기능을 만드는 중…
```

서브에이전트 상태에 따라 다음처럼 바꾼다.

- `running`: `조금만 더 같이 일하는 중…`
- `waiting`: `대답을 기다리는 중…`
- `completed`: `정말 끝났는지 마지막으로 보는 중…`
- `failed`: `실패한 이유를 기억해두는 중…`

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
