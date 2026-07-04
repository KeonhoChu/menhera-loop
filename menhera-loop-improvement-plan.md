# menhera-loop 고도화 방안

검토 일자: 2026-07-04 · 대상 버전: 0.1.0

## 0. 진단 요약

플러그인의 컨셉(멘헤라풍 완료 검증 게이트)과 UI 설치/복원 설계는 탄탄하다.
그러나 **핵심 가치인 "완료 선언 차단 → 재시도 루프"가 현재 배선으로는 실제로 동작하지 않는다.**
verify-completion 엔진은 잘 만들어졌지만, 그 판정 결과가 Claude Code에 전달되지 않고 버려진다.

우선순위 요약:

| 순위 | 항목 | 상태 |
|---|---|---|
| P0 | Stop 훅 차단 프로토콜 (exit 2 / decision:block) | 미동작 — 루프가 안 돎 |
| P0 | retry 카운트 영속화 | 항상 0 — 감정 단계 사문화 |
| P0 | 자기 오염 (플러그인 프롬프트가 TODO 스캔에 걸림) | 상시 오탐 |
| P1 | transcript JSONL 파싱 | 원문 정규식 스캔은 노이즈 과다 |
| P1 | 검증어 휴리스틱 (`ok` 부분일치, 실패/성공 혼재 처리) | 오탐/미탐 |
| P1 | 데이터 디렉터리 (`CLAUDE_PLUGIN_DATA` 미존재, cwd 오염) | 표준 아님 |
| P1 | 훅 3중 실행 비용 (Stop+SubagentStop+TaskCompleted × agent 120s) | 과다 |
| P2 | UserPromptSubmit로 요구사항 캡처 | 미구현 |
| P2 | events.jsonl 무한 증식, 백업 스테일, 테스트 공백 | 정리 필요 |

---

## 1. P0 — 루프가 실제로 돌게 만들기

### 1-1. Stop 훅 차단 프로토콜 준수

**문제.** `verify-completion.mjs`는 검증 실패 시 `process.exit(1)`로 끝난다
(`scripts/verify-completion.mjs:274`). 공식 훅 문서 기준:

- exit **0**: 성공. stdout의 JSON `decision` 필드만 판정에 반영됨
- exit **1**: **non-blocking 오류** — Claude는 그대로 종료함
- exit **2**: blocking — stderr 메시지가 Claude에게 전달되고 종료가 차단됨

즉 지금은 검증이 실패해도 Claude가 멀쩡히 "완료"를 선언하고 끝난다.
현재 stdout에 출력하는 리포트 JSON도 훅 decision 스키마가 아니므로 무시된다.

**수정.** 실패 시 두 방식 중 하나로:

```js
// 방식 A: decision JSON (권장 — 리포트 전체를 reason에 담을 수 있음)
if (!report.ok && !report.requiresHumanInput) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: `${report.retryMessage}\n미충족: ${report.summary}`
  }));
  process.exit(0);
}
console.log(JSON.stringify({ /* 통과 리포트 */ }));
process.exit(0);

// 방식 B: exit 2 + stderr
process.stderr.write(report.retryMessage + '\n' + report.summary);
process.exit(2);
```

**무한 루프 가드 필수.** 차단이 동작하는 순간부터 "검증 실패 → 계속 → 다시 Stop → 다시 실패"
루프가 생긴다. retry 카운트(아래 1-2)에 상한(예: 5회)을 두고, 상한 도달 시
`requiresHumanInput`처럼 통과시키되 메시지로 사람 개입을 요청한다.
훅 입력에 재진입 표시 필드가 있는지(과거 `stop_hook_active` 류) 현행 hooks 레퍼런스에서
확인하고, 있으면 함께 사용한다.

### 1-2. retry 카운트 영속화

**문제.** 감정 단계·trust 계산의 입력인 `MENHERA_LOOP_RETRY_COUNT`를 **설정하는 코드가 어디에도 없다.**
훅은 매번 새 프로세스라 env로는 상태가 이어지지 않는다. 결과적으로 감정 단계는 항상 0,
`messageForRetry` 에스컬레이션과 `calculateTrust`는 사실상 죽은 코드다.

**수정.** 세션 단위 상태 파일로 전환:

```js
// state.mjs (신규)
// 키: hook 입력의 session_id
// 위치: path.join(os.tmpdir(), 'menhera-loop', `${sessionId}.json`)
// 내용: { retryCount, falseCompletionClaims, lastVerdict, requirements: [...] }
```

- Stop 검증 실패 시 `retryCount += 1` 저장 → 다음 실행에서 읽어 감정 단계 상승
- 검증 통과 또는 SessionStart(clear) 시 리셋
- trust 표시도 이 상태에서 계산 → 스펙 7장의 "trust 40%" 연출이 비로소 실현됨

### 1-3. 자기 오염(self-poisoning) 차단

**문제.** `TODO_PATTERN`(`scripts/verify-completion.mjs:51`)이 transcript 전문을 스캔하는데,
transcript에는 **플러그인 자신의 훅 프롬프트**("TODO scan", "hidden TODOs"…)와
스피너 문구("숨긴 TODO 냄새 맡는 중")가 포함된다. 또 `남은|해야 함` 같은 일반어까지 매칭되어
todos 게이트가 실전에서 거의 항상 fail로 뜬다. `claimedComplete`의 `/완료|done|.../` 역시
플러그인 메시지 자체에 걸린다.

**수정.**

- transcript 원문이 아니라 **파싱된 assistant/tool 메시지**(아래 2-1)만 스캔
- 플러그인 자신의 문구·훅 프롬프트를 스캔 전에 필터링 (자체 메시지 코퍼스를 import해서 제외)
- TODO 판정은 transcript보다 **변경된 파일의 diff** 기준이 정확함:
  `git diff --unified=0` 결과에서 추가된 줄만 `TODO|FIXME|XXX|HACK|not implemented|stub` 매칭

---

## 2. P1 — 검증 엔진 정확도

### 2-1. transcript JSONL 구조적 파싱

`transcript_path`는 JSONL이다. 현재처럼 `fs.readFileSync` 원문에 정규식을 돌리면
이스케이프된 JSON 문자열, 시스템 메타데이터, 도구 원출력이 전부 섞인다.

```js
function parseTranscript(raw) {
  const entries = raw.split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  return {
    userMessages: /* role=user 텍스트 */,
    assistantMessages: /* role=assistant 텍스트 */,
    bashCommands: /* tool_use name=Bash 의 command */,
    bashOutputs: /* tool_result 의 출력 + exit code */,
    editedFiles: /* Write/Edit tool_use 의 file_path */
  };
}
```

이 구조가 잡히면:

- **changes 게이트**: `editedFiles.length > 0` — 텍스트 매칭(`/Write|Edit|.../`) 제거
- **verification 게이트**: `bashCommands`에서 테스트 명령 탐지 + **해당 tool_result의 exit code**로 성패 판정
- **requirements**: `userMessages`에서만 추출 (현재는 verifier 프롬프트의 예시 문장까지 요구사항으로 오인)

### 2-2. 성패 판정 휴리스틱 교정

`scripts/verify-completion.mjs:136`의 현재 로직:

```js
failed = FAILURE_TERMS.some(...) && !SUCCESS_TERMS.some(...)
```

- `"1 passed, 3 failed"` → SUCCESS 단어가 있으니 **통과 처리** (미탐)
- SUCCESS_TERMS의 `'ok'`가 `token`, `look` 등에 부분일치 (오탐)
- `"0 failed"`, `"error: 0"` → 실패 신호로 오인

**수정 방향.**

- 1순위: tool_result의 **exit code** (2-1에서 확보). 텍스트 추측은 exit code가 없을 때만
- 단어 매칭 시 `\b` 경계 필수, `ok`는 단독 토큰만
- `N failed` 패턴은 N > 0 일 때만 실패로 계산

### 2-3. 데이터 디렉터리 표준화

`CLAUDE_PLUGIN_DATA`는 Claude Code가 제공하는 env가 아니다(문서화된 것은
`CLAUDE_PLUGIN_ROOT`, `CLAUDE_PROJECT_DIR` 등). 따라서:

- `persistReport`는 실전에서 항상 `null` 반환 (저장 안 됨)
- `track-event.mjs`는 `cwd/.menhera-loop`로 폴백 → **사용자 프로젝트 오염** (.gitignore도 안 됨)

**수정.** 단일 헬퍼로 통일:

```js
export function dataDir(sessionId) {
  const base = process.env.MENHERA_LOOP_DATA
    || path.join(os.homedir(), '.claude', 'menhera-loop');
  return sessionId ? path.join(base, 'sessions', sessionId) : base;
}
```

retry 상태(1-2), events, last-verification을 전부 이 아래로. 프로젝트 폴더에는 아무것도 쓰지 않는다.

### 2-4. 훅 실행 비용 다이어트

현재 `Stop`, `SubagentStop`, `TaskCompleted` 각각에 command 훅 + **120초 agent 훅**이 이중으로 걸려 있다.
agent 훅은 매번 서브에이전트를 띄우므로 토큰·시간 비용이 크고, 잦은 TaskCompleted에서는 특히 부담이다.

**권장 구성.**

| 이벤트 | command 훅 | agent 훅 |
|---|---|---|
| Stop | ✅ 1차 게이트 (빠름, 무료) | command가 `suspect_ok`일 때만 의미 → 조건부/선택 |
| SubagentStop | ✅ | ❌ 제거 |
| TaskCompleted | ✅ | ❌ 제거 |

- command 훅이 명백한 미비(`incomplete`)를 잡고, agent 훅은 "증거는 있는데 매핑이 애매한" 경우의
  2차 판정으로만. agent 훅 상시 실행을 유지하려면 최소한 opt-in 설정으로 분리
  (`/menhera-loop:setup --deep-verify`).
- agent 훅 프롬프트의 `$ARGUMENTS`는 슬래시 커맨드 변수다. agent 훅에 훅 입력이 어떤 형태로
  전달되는지, agent가 어떤 출력 형식으로 차단 판정을 내려야 하는지 현행 문서 기준으로 재확인하고
  프롬프트의 커스텀 JSON 스키마(ok/verdict/exhausted…)를 그 계약에 맞춘다.

---

## 3. P2 — 기능 고도화

### 3-1. UserPromptSubmit로 요구사항 캡처

requirements 게이트의 근본 한계는 "요구사항의 출처가 없다"는 것. 가장 신뢰할 수 있는 출처는
사용자 프롬프트 그 자체다.

```json
"UserPromptSubmit": [{ "hooks": [{
  "type": "command",
  "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/capture-requirements.mjs"],
  "statusMessage": "네가 한 말, 전부 받아적는 중…",
  "timeout": 5
}]}]
```

- 프롬프트에서 명령형 문장/체크박스/번호 목록을 추출해 세션 상태에 누적
- Stop 검증 시 이 목록을 `requirements`의 1차 소스로 사용 → transcript 추출은 보조로 강등
- 캐릭터 서사도 강화됨: "아까 이거 해달라고 했잖아. 기억하고 있어."

### 3-2. SessionStart를 계약 낭독으로

현재 `session-start.mjs`는 retry 메시지(항상 0단계 "끝났어? 좋아, 이제 껍질 벗겨보자.")를
출력하는데, 세션 시작 문맥과 맞지 않는다. SessionStart의 stdout은 **컨텍스트에 주입**되므로
더 유용하게 쓸 수 있다:

- 이전 세션의 `last-verification.json`이 미완(`ok=false`)이면 그 미충족 게이트를 요약해 주입
  → "지난번에 검증 없이 끝냈던 거, 이어서 마무리해" 서사가 실제 기능이 됨
- 깨끗한 시작이면 짧은 계약 문구 1줄만 ("완료 선언에는 증거가 따라와야 해.")

### 3-3. 상태 관리·위생

- **events.jsonl 로테이션**: append 전 크기 확인, 1MB 초과 시 최근 N줄만 유지. 세션 종료된
  상태 파일은 7일 후 삭제 (SessionStart 때 청소)
- **백업 수명주기**: `uninstallUi` 성공 후 백업 파일 삭제. 지금은 남아 있어서
  재설치 시 `!fs.existsSync(backupFile)` 가드 때문에 새 백업이 안 만들어지고,
  이후 uninstall이 한 세대 전 설정을 복원할 수 있음 (`scripts/menhera-ui.mjs:163`)
- **statusline 연동 (선택)**: trust %와 감정 단계를 statusline 스크립트로 노출하면
  스펙 7장의 "menhera-loop trust: 40%" 연출을 상시 표시로 확장 가능

### 3-4. 테스트 보강

현재 테스트는 UI 유닛과 리포트 순수 로직만 다룬다. 추가할 것:

- `loadHookInput`: JSONL transcript 픽스처 → 구조적 파싱 결과 검증
- **자기 오염 회귀 테스트**: 플러그인 자신의 훅 프롬프트/스피너 문구가 포함된 transcript에서
  todos 게이트가 오탐하지 않는지
- 혼재 출력(`"2 passed, 1 failed"`) 성패 판정
- 종단 계약 테스트: stdin으로 훅 입력 JSON을 흘려 `decision:block` 출력과 exit code 확인
- retry 상태 파일 증가/리셋/상한

### 3-5. 배포 품질

- `plugin.json`에 `repository`/`homepage` 추가, author 표기 통일 (plugin.json `Borel` ↔ README `KeonhoChu`)
- README에 실제 동작 GIF/스크린샷, 훅 비용 안내(agent 훅 토큰 소모), 요구 Claude Code 최소 버전 명시
- CI (GitHub Actions): `npm run validate` + `claude plugin validate .`
- 메시지 코퍼스 다국어화 여지: 현재 한국어 고정 → `MENHERA_LOOP_LANG=en` 코퍼스 분리 구조 마련

---

## 4. insane-search에서 추가로 착안할 것 (2026-07-04 추가)

원조인 [fivetaku/insane-search](https://github.com/fivetaku/insane-search)를 재검토한 결과,
Phase 0→3 게이트 구조 외에 더 가져올 수 있는 설계가 있다.

1. **비용 적응형 에스컬레이션** — insane-search는 싼 방법(공개 API)이 실패했을 때만
   비싼 방법(TLS 위장 → 헤드리스 브라우저)으로 올라간다. menhera-loop도 동일 원리 적용:
   retry 0~1은 지금의 무료 command 훅 판정만, **retry 2부터** agent 훅 딥버리파이를
   투입(0.2.0에서 제거한 agent 훅의 재도입처). 매번 서브에이전트를 띄우던 0.1.0의
   비용 문제를 "실패가 반복될 때만 비싸진다"로 해결.
2. **정직한 종료 조건의 1급 시민화** — insane-search는 로그인/페이월을 만나면 뚫는 척하지
   않고 "인증 필요"를 보고하고 멈춘다. 우리의 `requiresHumanInput`이 같은 역할이지만
   현재는 텍스트 휴리스틱. Claude가 blocker를 구조적으로 선언하는 관례
   (`[MENHERA_LOOP:BLOCKED:<이유>]` 마커)를 정의하면 오탐 없이 게이트를 열 수 있다.
3. **지원 매트릭스 노출** — insane-search는 지원 플랫폼 13개를 명시한다. 우리는 인식하는
   검증 명령 목록(npm/pnpm/yarn/bun/pytest/cargo/go/…)이 그에 해당 → README에 명시했고,
   추후 사용자 정의 패턴(`MENHERA_LOOP_TEST_PATTERNS` 또는 설정 키)으로 확장.
4. **README 마케팅 장치** — 비교 표("Default vs +plugin"), "What just happened" 예시 블록,
   파이프라인 다이어그램, Boundaries 섹션, 배지 행 → 0.2.0 README에 반영 완료.
   남은 것: 히어로 이미지/터미널 GIF, 다국어 README 선택기(EN/KO/JA/ZH).

## 5. 단계별 실행 순서

1. **v0.2.0 — "루프가 진짜 돈다"**: 1-1 차단 프로토콜 + 1-2 retry 영속화 + 상한 가드 + 1-3 자기 오염 차단. 여기까지 되면 플러그인의 존재 이유가 처음으로 동작한다.
2. **v0.3.0 — "판정이 정확하다"**: 2-1 JSONL 파싱 + 2-2 exit code 기반 성패 + 2-3 데이터 디렉터리 + 2-4 훅 다이어트.
3. **v0.4.0 — "서사가 완성된다"**: 3-1 요구사항 캡처 + 3-2 세션 계약 낭독 + 3-3 위생 + statusline trust 표시.
4. **v1.0.0 — 배포**: 3-4 테스트 + 3-5 CI/문서/마켓플레이스 정비.
