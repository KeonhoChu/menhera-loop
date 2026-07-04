#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { allPluginPhrases, calculateTrust, messageForRetry, messagesForLanguage, resolveMessageLanguage } from './menhera-ui.mjs';
import { MAX_RETRIES, dataDir, loadState, saveState } from './state.mjs';

const TEST_COMMAND_PATTERNS = [
  /npm\s+run\s+(?:validate|test|lint|build)\b/i,
  /npm\s+test\b/i,
  /node\s+--test\b/i,
  /pnpm\s+(?:test|run\s+(?:validate|lint|build))\b/i,
  /yarn\s+(?:test|run\s+(?:validate|lint|build))\b/i,
  /bun\s+test\b/i,
  /pytest\b/i,
  /cargo\s+test\b/i,
  /go\s+test\b/i,
  /claude\s+plugin\s+validate\b/i
];

const TODO_PATTERN = /\b(TODO|FIXME|XXX|HACK|stub)\b|not implemented|NotImplementedError/i;
// menhera-loop's own config commands (the /menhera-loop:setup and
// :uninstall-ui flows). A session whose only work is these is configuration,
// not a task that needs test evidence — so it must not trip the Stop gate.
const CONFIG_COMMAND_PATTERN = /(?:setup-ui|uninstall-ui)\.mjs|menhera-loop:(?:setup|uninstall-ui)/i;
// Only count markers that sit in comment-like context. Bare occurrences in
// string literals or prose (e.g. this plugin's own 'TODO어딨어?' corpus) are
// message content, not leftover work.
const COMMENT_CONTEXT_PATTERN = /(?:^|\s)(?:\/\/|\/\*|\*|#|<!--)/;
const FAILED_COUNT_PATTERN = /\b([1-9]\d*)\s*(?:tests?\s+)?fail(?:ed|ing|ures?)?\b/i;
const EDIT_TOOL_PATTERN = /^(Write|Edit|MultiEdit|NotebookEdit)$/;

const DEFAULT_CHECKS = [
  { id: 'requirements', phase: 'phase0', label: '요구사항 증거', required: true },
  { id: 'changes', phase: 'phase1', label: '작업 흔적', required: true },
  { id: 'verification', phase: 'phase2', label: '검증 실행 증거', required: true },
  { id: 'todos', phase: 'phase2', label: '남은 TODO 확인', required: true },
  { id: 'blockers', phase: 'phase3', label: '외부 blocker 확인', required: false }
];

export function parseTranscript(raw) {
  const userTexts = [];
  const assistantTexts = [];
  const bashRuns = [];
  const editedFiles = [];
  const resultsById = new Map();

  for (const line of String(raw || '').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const message = entry.message && typeof entry.message === 'object' ? entry.message : entry;
    const role = message.role || entry.type;
    const content = message.content;
    const items = Array.isArray(content)
      ? content
      : typeof content === 'string'
        ? [{ type: 'text', text: content }]
        : [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'text' && item.text) {
        if (role === 'user') userTexts.push(item.text);
        else if (role === 'assistant') assistantTexts.push(item.text);
      } else if (item.type === 'tool_use') {
        if (EDIT_TOOL_PATTERN.test(item.name) && item.input?.file_path) {
          editedFiles.push(item.input.file_path);
        } else if (item.name === 'Bash' && item.input?.command) {
          bashRuns.push({ id: item.id, command: item.input.command });
        }
      } else if (item.type === 'tool_result') {
        resultsById.set(item.tool_use_id, {
          isError: Boolean(item.is_error),
          text: flattenResultText(item.content)
        });
      }
    }
  }

  for (const run of bashRuns) {
    const result = resultsById.get(run.id);
    run.isError = result ? result.isError : null;
    run.output = result ? result.text : '';
  }

  return {
    userTexts: userTexts.map(stripPluginNoise).filter(Boolean),
    assistantTexts: assistantTexts.map(stripPluginNoise).filter(Boolean),
    bashRuns,
    editedFiles: [...new Set(editedFiles)]
  };
}

function flattenResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(item => (item && item.type === 'text' ? item.text : ''))
    .filter(Boolean)
    .join('\n');
}

export function stripPluginNoise(text) {
  const phrases = allPluginPhrases();
  return String(text)
    .split(/\r?\n/)
    .filter(line => {
      if (/menhera[-_ ]?loop/i.test(line)) return false;
      if (/<system-reminder>/i.test(line)) return false;
      return !phrases.some(phrase => line.includes(phrase));
    })
    .join('\n');
}

export function buildVerificationReport(input = {}) {
  const transcript = input.transcript || parseTranscript(input.transcriptText || '');
  const state = input.state || { retryCount: 0, falseCompletionClaims: 0, requirements: [] };
  const cwd = input.cwd || process.cwd();
  const language = resolveMessageLanguage({
    explicit: input.language,
    state,
    texts: [...transcript.userTexts, ...state.requirements],
    env: input.env || process.env
  });

  const workAttempted = transcript.editedFiles.length > 0 || transcript.bashRuns.length > 0;
  const assistantText = transcript.assistantTexts.join('\n');
  const claimedComplete = /완료|끝났|done|finished|complete|完了|終わった/i.test(assistantText);
  const requiresHumanInput = Boolean(input.requiresHumanInput)
    || /사용자 확인|수동 승인|manual approval|requires human|human input|credential|api key/i.test(assistantText);

  // A menhera setup/uninstall session touches no source files and only runs
  // config commands: exempt it so setup does not burn tokens on the retry loop.
  const configOnly = workAttempted
    && transcript.editedFiles.length === 0
    && transcript.bashRuns.length > 0
    && transcript.bashRuns.every(run => CONFIG_COMMAND_PATTERN.test(run.command));

  if (!workAttempted || configOnly) {
    return {
      ok: true,
      verdict: configOnly ? 'config_only' : 'no_work',
      phase: 'complete',
      trust: calculateTrust(state),
      retryCount: state.retryCount,
      retryMessage: configOnly
        ? messagesForLanguage(language).setupSkipMessage
        : messagesForLanguage(language).chatSkipMessage,
      exhausted: true,
      claimedComplete,
      checks: [],
      untriedChecks: [],
      missingEvidence: [],
      unverifiedRequirements: [],
      failedChecks: [],
      requiresHumanInput,
      summary: configOnly ? 'menhera 설정 작업 — 검증 게이트 미적용' : '작업 없음 — 검증 게이트 미적용',
      language
    };
  }

  const requirements = (state.requirements?.length ? state.requirements : extractRequirements(transcript.userTexts))
    .slice(0, 50);
  const evidenceHaystack = [
    assistantText,
    ...transcript.bashRuns.map(run => `${run.command}\n${run.output || ''}`)
  ].join('\n').toLowerCase();

  const checks = DEFAULT_CHECKS.map(check =>
    evaluateCheck(check, { transcript, requirements, requiresHumanInput, cwd })
  );
  const untriedChecks = checks.filter(check => check.status === 'untried').map(check => check.id);
  const missingEvidence = checks.filter(check => check.required && check.status !== 'pass').map(check => check.id);
  const failedChecks = checks.filter(check => check.status === 'fail').map(check => check.id);
  const unverifiedRequirements = requirements.filter(
    requirement => !hasEvidenceForRequirement(requirement, evidenceHaystack)
  );

  const exhausted = untriedChecks.length === 0 && missingEvidence.length === 0 && unverifiedRequirements.length === 0;
  const ok = exhausted && failedChecks.length === 0;
  const trust = calculateTrust({
    retryCount: state.retryCount,
    falseCompletionClaims: state.falseCompletionClaims,
    missingVerificationCount: missingEvidence.length + unverifiedRequirements.length
  });

  return {
    ok,
    verdict: ok ? 'strong_ok' : missingEvidence.length === 0 ? 'suspect_ok' : 'incomplete',
    phase: checks.find(check => check.required && check.status !== 'pass')?.phase || 'complete',
    trust,
    retryCount: state.retryCount,
    retryMessage: ok ? messagesForLanguage(language).successMessage : messageForRetry(state.retryCount, language),
    language,
    exhausted,
    claimedComplete,
    checks,
    untriedChecks,
    missingEvidence,
    unverifiedRequirements,
    failedChecks,
    requiresHumanInput,
    summary: summarize({ ok, missingEvidence, untriedChecks, unverifiedRequirements, failedChecks, requiresHumanInput })
  };
}

function evaluateCheck(check, { transcript, requirements, requiresHumanInput, cwd }) {
  if (check.id === 'requirements') {
    if (requirements.length === 0) return status(check, 'untried', '캡처된 요구사항 없음');
    return status(check, 'pass', `${requirements.length}개 요구사항 추적 중`);
  }
  if (check.id === 'changes') {
    if (transcript.editedFiles.length > 0) {
      return status(check, 'pass', `${transcript.editedFiles.length}개 파일 변경 흔적`);
    }
    if (transcript.bashRuns.length > 0) {
      return status(check, 'pass', '실행 작업 흔적 (파일 변경 없음)');
    }
    return status(check, 'untried', '작업 흔적 없음');
  }
  if (check.id === 'verification') {
    const testRuns = transcript.bashRuns.filter(run =>
      TEST_COMMAND_PATTERNS.some(pattern => pattern.test(run.command))
    );
    if (testRuns.length === 0) return status(check, 'untried', '테스트/빌드/검증 명령 실행 안 됨');
    const failedRun = testRuns.find(run => run.isError === true || indicatesFailure(run.output));
    if (failedRun) return status(check, 'fail', `검증 실패: ${failedRun.command.slice(0, 80)}`);
    return status(check, 'pass', `검증 명령 ${testRuns.length}건 통과`);
  }
  if (check.id === 'todos') {
    const hits = scanTodos(transcript.editedFiles, cwd);
    if (hits.length > 0) return status(check, 'fail', `남은 TODO ${hits.length}건: ${hits.slice(0, 3).join(', ')}`);
    return status(check, 'pass', '변경 파일에 남은 TODO 없음');
  }
  if (check.id === 'blockers') {
    if (requiresHumanInput) return status(check, 'pass', '외부 입력 blocker 명시됨');
    return status(check, 'pass', '외부 blocker 없음');
  }
  return status(check, 'untried', '알 수 없는 check');
}

function status(check, statusValue, reason) {
  return { ...check, status: statusValue, reason };
}

export function indicatesFailure(output) {
  const text = String(output || '');
  const failedCount = text.match(FAILED_COUNT_PATTERN);
  if (failedCount) return true;
  return /\b(error|panic|exception|FAILED)\b/.test(text) && !/\b0\s+(?:errors?|failures?)\b/i.test(text);
}

function scanTodos(editedFiles, cwd) {
  const hits = [];
  for (const file of editedFiles) {
    const resolved = path.isAbsolute(file) ? file : path.join(cwd, file);
    let content;
    try {
      content = fs.readFileSync(resolved, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (COMMENT_CONTEXT_PATTERN.test(lines[i]) && TODO_PATTERN.test(lines[i])) {
        hits.push(`${path.basename(resolved)}:${i + 1}`);
        if (hits.length >= 10) return hits;
      }
    }
  }
  return hits;
}

export function extractRequirements(userTexts) {
  const requirements = [];
  for (const text of userTexts) {
    for (const line of String(text).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (/^- \[[ xX]\]|^[-*] |^\d+[.)] /.test(trimmed)) {
        requirements.push(trimmed.replace(/^- \[[ xX]\]\s*|^[-*]\s*|^\d+[.)]\s*/, '').slice(0, 160));
      }
    }
  }
  if (requirements.length === 0 && userTexts.length > 0) {
    const first = String(userTexts[0]).replace(/\s+/g, ' ').trim();
    if (first && !first.startsWith('/')) requirements.push(first.slice(0, 160));
  }
  return requirements.filter(Boolean);
}

function hasEvidenceForRequirement(requirement, haystack) {
  const words = String(requirement)
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(word => word.length >= 2);
  if (words.length === 0) return true;
  return words.some(word => haystack.includes(word));
}

function summarize(report) {
  if (report.ok) return '모든 필수 검증 게이트 통과';
  const parts = [];
  if (report.missingEvidence.length) parts.push(`missing=${report.missingEvidence.join(',')}`);
  if (report.untriedChecks.length) parts.push(`untried=${report.untriedChecks.join(',')}`);
  if (report.unverifiedRequirements.length) parts.push(`unverified_requirements=${report.unverifiedRequirements.length}`);
  if (report.failedChecks.length) parts.push(`failed=${report.failedChecks.join(',')}`);
  if (report.requiresHumanInput) parts.push('human_input=true');
  return parts.join('; ') || '검증 부족';
}

export function loadHookInput(raw) {
  let input;
  try {
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    input = { arguments: raw };
  }
  if (input.transcript_path && fs.existsSync(input.transcript_path)) {
    try {
      input.transcriptText = fs.readFileSync(input.transcript_path, 'utf8');
    } catch (error) {
      input.transcriptReadError = error.message;
    }
  }
  return input;
}

export function persistReport(report, env = process.env) {
  try {
    const dir = dataDir(env);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'last-verification.json');
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    return file;
  } catch {
    return null;
  }
}

function readStdin() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.resume();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const observe = process.argv.includes('--observe');
  const raw = await readStdin();
  const input = loadHookInput(raw);
  const sessionId = input.session_id || 'unknown';
  const state = loadState(sessionId);
  const report = buildVerificationReport({
    transcriptText: input.transcriptText || '',
    state,
    cwd: input.cwd
  });
  persistReport({ ...report, sessionId, event: input.hook_event_name || null, at: new Date().toISOString() });

  if (observe) {
    process.exit(0);
  }

  if (report.ok) {
    saveState(sessionId, { ...state, retryCount: 0, falseCompletionClaims: 0, lastVerdict: report.verdict, language: report.language });
    if (report.verdict === 'strong_ok') {
      console.log(JSON.stringify({ systemMessage: `menhera-loop trust ${report.trust}% · ${report.retryMessage}` }));
    }
    process.exit(0);
  }

  if (state.retryCount >= MAX_RETRIES) {
    saveState(sessionId, { ...state, lastVerdict: 'gave_up', language: report.language });
    console.log(JSON.stringify({
      systemMessage: `${messageForRetry(MAX_RETRIES, report.language)} (미충족: ${report.summary})`
    }));
    process.exit(0);
  }

  const nextRetry = state.retryCount + 1;
  saveState(sessionId, {
    ...state,
    retryCount: nextRetry,
    falseCompletionClaims: state.falseCompletionClaims + (report.claimedComplete ? 1 : 0),
    lastVerdict: report.verdict,
    language: report.language
  });
  const reason = [
    `[MENHERA_LOOP:RETRY:${nextRetry}] ${messageForRetry(state.retryCount, report.language)}`,
    `trust: ${report.trust}%`,
    `미충족 게이트: ${report.summary}`,
    ...report.checks.filter(check => check.status !== 'pass').map(check => `- ${check.label}: ${check.reason}`),
    '완료를 선언하려면: 검증 명령을 직접 실행해 결과를 보여주고, 남은 TODO를 처리하고, 요구사항별 증거를 제시해. 진짜 외부 blocker면 어떤 입력이 필요한지 명시해.'
  ].join('\n');
  console.log(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}
