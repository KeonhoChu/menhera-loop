#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { allPluginPhrases, calculateTrust, messageForRetry, messagesForLanguage, resolveMessageLanguage } from './menhera-ui.mjs';
import { MAX_RETRIES, atomicWriteFileSync, dataDir, loadState, recordGateOutcome, redactSecrets, saveState } from './state.mjs';

const TEST_COMMAND_PATTERNS = [
  /npm\s+run\s+(?:validate|test|lint|build)\b/i,
  /npm\s+test\b/i,
  /node\s+--test\b/i,
  /pnpm\s+(?:test|run\s+(?:validate|lint|build))\b/i,
  /yarn\s+(?:test|run\s+(?:validate|lint|build))\b/i,
  /bun\s+test\b/i,
  /pytest\b/i,
  /python3?\s+-m\s+(?:pytest|unittest)\b/i,
  /deno\s+test\b/i,
  /cargo\s+test\b/i,
  /go\s+test\b/i,
  /claude\s+plugin\s+validate\b/i,
  /mvn\s+test\b/i,
  /(?:\.\/)?gradlew?\s+test\b/i,
  /dotnet\s+test\b/i,
  /rspec\b/i,
  /mix\s+test\b/i,
  /make\s+test\b/i,
  /(?:npx\s+)?(?:vitest|jest|playwright|cypress)\b/i,
  /tsc(?:\s+--noEmit)?\b/i,
  /eslint\b/i,
  /ruff\b/i,
  /mypy\b/i,
  /pyright\b/i,
  /phpunit\b/i,
  /swift\s+test\b/i
];
const MUTATING_BASH_PATTERN = /\b(?:rm|mv|cp|mkdir|touch|chmod|chown|ln|patch|apply_patch)\b|\bgit\s+(?:commit|push|merge|rebase|checkout\s+-b)\b|\bnpm\s+(?:i|install)\b|\bpip\s+install\b|\bsed\s+-i\b/i;
const DOC_EXTS = new Set(['.md', '.mdx', '.rst', '.txt', '.adoc']);

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
  { id: 'requirements', phase: 'phase0', required: true },
  { id: 'changes', phase: 'phase1', required: true },
  { id: 'verification', phase: 'phase2', required: true },
  { id: 'todos', phase: 'phase2', required: true },
  { id: 'blockers', phase: 'phase3', required: false }
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
        const hasIsError = Object.prototype.hasOwnProperty.call(item, 'is_error');
        resultsById.set(item.tool_use_id, {
          isError: hasIsError ? Boolean(item.is_error) : null,
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

function ledgerTranscript(state) {
  const editedFiles = Array.isArray(state.editedFiles)
    ? state.editedFiles.map(file => (typeof file === 'string' ? file : file?.path)).filter(Boolean)
    : [];
  const verificationRuns = Array.isArray(state.verificationRuns) ? state.verificationRuns : [];
  return {
    userTexts: [],
    assistantTexts: [],
    bashRuns: verificationRuns.map(run => ({
      id: null,
      command: run.command || '',
      isError: typeof run.success === 'boolean' ? !run.success : (run.exitCode === null || run.exitCode === undefined ? null : run.exitCode !== 0),
      output: [run.output, run.error].filter(Boolean).join('\n'),
      at: run.at || null,
      success: run.success
    })),
    editedFiles: [...new Set(editedFiles)],
    editedFileDetails: Array.isArray(state.editedFiles) ? state.editedFiles : [],
    source: 'ledger'
  };
}

function hasLedgerEvidence(state) {
  return (Array.isArray(state?.editedFiles) && state.editedFiles.length > 0)
    || (Array.isArray(state?.verificationRuns) && state.verificationRuns.length > 0);
}

export function buildVerificationReport(input = {}) {
  const parsedTranscript = input.transcript || parseTranscript(input.transcriptText || '');
  const state = input.state || { retryCount: 0, falseCompletionClaims: 0, requirements: [] };
  const useLedger = input.useLedger !== false && hasLedgerEvidence(state);
  const transcript = useLedger ? ledgerTranscript(state) : parsedTranscript;
  const cwd = input.cwd || process.cwd();
  const language = resolveMessageLanguage({
    explicit: input.language,
    state,
    texts: [...parsedTranscript.userTexts, ...state.requirements],
    env: input.env || process.env
  });
  const messages = messagesForLanguage(language);

  const workAttempted = transcript.editedFiles.length > 0 || transcript.bashRuns.some(run => isMutatingCommand(run.command));
  const assistantText = parsedTranscript.assistantTexts.join('\n');
  // Only the final assistant message is a completion claim — "빌드 완료 후 계속"
  // in an earlier progress note is narration, and counting it inflates
  // falseCompletionClaims (and burns long-term trust) on nearly every block.
  const claimedComplete = /\b(done|finished|completed?)\b|완료|끝났|完了|終わった/i.test(parsedTranscript.assistantTexts.at(-1) || '');
  const requiresHumanInput = Boolean(input.requiresHumanInput)
    || /사용자 확인|수동 승인|manual approval|requires human|human input|credential|api key/i.test(assistantText);

  // A menhera setup/uninstall session touches no source files and only runs
  // config commands: exempt it so setup does not burn tokens on the retry loop.
  const configOnly = !workAttempted
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
        ? messages.setupSkipMessage
        : messages.chatSkipMessage,
      exhausted: true,
      claimedComplete,
      checks: [],
      untriedChecks: [],
      missingEvidence: [],
      unverifiedRequirements: [],
      failedChecks: [],
      requirements: [],
      suggestedCommands: [],
      requiresHumanInput,
      summary: configOnly ? messages.gate.summaries.configOnly : messages.gate.summaries.noWork,
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
    evaluateCheck({ ...check, label: messages.gate.checks[check.id] }, { transcript, requirements, requiresHumanInput, cwd, env: input.env || process.env })
  );
  const untriedChecks = checks.filter(check => check.status === 'untried').map(check => check.id);
  const missingEvidence = checks.filter(check => check.required && check.status !== 'pass').map(check => check.id);
  const failedChecks = checks.filter(check => check.status === 'fail').map(check => check.id);
  const unverifiedRequirements = requirements.filter(
    requirement => !hasEvidenceForRequirement(requirement, evidenceHaystack)
  );

  const exhausted = untriedChecks.length === 0 && missingEvidence.length === 0 && unverifiedRequirements.length === 0;
  const ok = exhausted && failedChecks.length === 0;
  // Covers both "never ran" and "stale since last edit" — the two cases where
  // naming the project's own command shortens the retry loop.
  const suggestedCommands = missingEvidence.includes('verification') ? suggestVerificationCommands(cwd) : [];
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
    retryMessage: ok ? messages.successMessage : messageForRetry(state.retryCount, language),
    language,
    exhausted,
    claimedComplete,
    checks,
    untriedChecks,
    missingEvidence,
    unverifiedRequirements,
    failedChecks,
    requirements,
    suggestedCommands,
    requiresHumanInput,
    summary: summarize({ ok, missingEvidence, untriedChecks, unverifiedRequirements, failedChecks, requiresHumanInput }, messages)
  };
}

function fill(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`\${${key}}`, String(value)), template);
}

// The evidence receipt is the user-facing payoff of a strong_ok pass: the
// ledger's edited files, verification runs, and requirement coverage in a
// form that can go straight into a commit message or PR body.
export function buildReceiptMarkdown(report, state = {}, { now = new Date(), env = process.env } = {}) {
  const messages = messagesForLanguage(report.language || 'ko');
  const unverified = new Set(report.unverifiedRequirements || []);
  const requirements = report.requirements || [];
  const editedFiles = (state.editedFiles || []).map(file => (typeof file === 'string' ? { path: file } : file)).filter(file => file?.path);
  const runs = (state.verificationRuns || []).filter(run => isVerificationCommand(run?.command || '', env));
  const empty = ['- —'];
  return [
    `# ${messages.receipt.title} · menhera-loop`,
    '',
    `- ${now.toISOString()}`,
    `- verdict: ${report.verdict} · trust: ${report.trust}%`,
    '',
    `## ${messages.gate.checks.requirements}`,
    // The receipt is meant to be pasted into commits/PRs, so requirement text
    // (raw user input) and commands (may carry env-var prefixes) get redacted.
    ...(requirements.length ? requirements.map(requirement => `- [${unverified.has(requirement) ? ' ' : 'x'}] ${redactSecrets(requirement)}`) : empty),
    '',
    `## ${messages.gate.checks.changes}`,
    ...(editedFiles.length ? editedFiles.map(file => `- ${file.path}${file.kind ? ` (${file.kind})` : ''}`) : empty),
    '',
    `## ${messages.gate.checks.verification}`,
    ...(runs.length ? runs.map(run => `- ${run.success === false ? '✗' : '✓'} \`${redactSecrets(run.command)}\`${run.at ? ` — ${run.at}` : ''}`) : empty),
    ''
  ].join('\n');
}

export function persistReceipt(markdown, env = process.env) {
  try {
    const file = path.join(dataDir(env), 'last-receipt.md');
    atomicWriteFileSync(file, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
    return file;
  } catch {
    return null;
  }
}

function evaluateCheck(check, { transcript, requirements, requiresHumanInput, cwd, env = process.env }) {
  if (check.id === 'requirements') {
    // No captured requirements (short/question/thanks prompts get filtered) must
    // not manufacture a block on its own — the other gates still apply.
    if (requirements.length === 0) return status(check, 'pass', '캡처된 요구사항 없음 — 게이트 생략');
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
    if (transcript.editedFiles.length > 0 && transcript.editedFiles.every(file => classifyPathKind(file) === 'docs')) {
      return status(check, 'pass', '문서 변경 — 검증 대상 아님');
    }
    const testRuns = transcript.bashRuns.filter(run => isVerificationCommand(run.command, env));
    if (testRuns.length === 0) return status(check, 'untried', '테스트/빌드/검증 명령 실행 안 됨');
    const failedRun = testRuns.find(run => run.isError === true || (run.isError === null && indicatesFailure(run.output)));
    if (failedRun) return status(check, 'fail', `검증 실패: ${failedRun.command.slice(0, 80)}`);
    const lastEditAt = latestTimestamp(transcript.editedFileDetails || []);
    if (lastEditAt !== null) {
      const freshRuns = testRuns.filter(run => run.isError === false && timestampMs(run.at) > lastEditAt);
      if (freshRuns.length === 0) return status(check, 'fail', '마지막 편집 이후 성공한 검증 없음');
    }
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

// Split a shell command into its individual sub-commands and strip leading
// env assignments / launchers, so a runner or mutating verb is only recognized
// when it actually leads a command — `cat jest.config.js` and `git log --patch`
// must not read as "ran jest" or "mutated files".
function commandSegments(command) {
  return String(command || '')
    .split(/\n|&&|\|\||[;|]/)
    .map(segment => segment.trim())
    .map(segment => segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, ''))
    .map(segment => segment.replace(/^(?:sudo|time|env|poetry\s+run|uv\s+run|pdm\s+run|rye\s+run|bundle\s+exec)\s+/i, ''))
    .filter(Boolean);
}

function segmentMatches(command, pattern) {
  const anchored = new RegExp(`^(?:${pattern.source})`, pattern.flags.replace('g', ''));
  return commandSegments(command).some(segment => anchored.test(segment));
}

export function isMutatingCommand(command) {
  return segmentMatches(command, MUTATING_BASH_PATTERN);
}

// Single source of truth for "is this a verification run" — the Stop gate and
// the PostToolUse ledger must never disagree on it.
export function isVerificationCommand(command, env = process.env) {
  return testCommandPatterns(env).some(pattern => segmentMatches(command, pattern));
}

function timestampMs(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
}

function latestTimestamp(items) {
  const times = items.map(item => timestampMs(item?.at)).filter(time => time !== null);
  return times.length ? Math.max(...times) : null;
}

function testCommandPatterns(env = process.env) {
  const extra = String(env.MENHERA_LOOP_TEST_PATTERNS || '')
    .split(',')
    .map(pattern => pattern.trim())
    .filter(Boolean)
    .map(pattern => {
      try {
        return new RegExp(pattern, 'i');
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return [...TEST_COMMAND_PATTERNS, ...extra];
}

// Turn "verification not run" into an actionable block: read the project's
// own manifests and name the exact command to run. Suggestions only — the
// gate's pass/fail arithmetic never depends on them.
export function suggestVerificationCommands(cwd) {
  const base = cwd || process.cwd();
  const has = name => {
    try {
      return fs.existsSync(path.join(base, name));
    } catch {
      return false;
    }
  };
  const suggestions = [];
  try {
    if (has('package.json')) {
      const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
      const scripts = pkg.scripts || {};
      const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : (has('bun.lockb') || has('bun.lock')) ? 'bun' : 'npm';
      for (const name of ['test', 'lint', 'build']) {
        if (scripts[name]) suggestions.push(name === 'test' ? `${pm} test` : `${pm} run ${name}`);
      }
    }
  } catch {
    // unreadable package.json — other manifests may still match
  }
  if (has('Cargo.toml')) suggestions.push('cargo test');
  if (has('go.mod')) suggestions.push('go test ./...');
  if (has('pyproject.toml') || has('pytest.ini')) suggestions.push('pytest');
  if (has('mix.exs')) suggestions.push('mix test');
  if (has('gradlew')) suggestions.push('./gradlew test');
  else if (has('pom.xml')) suggestions.push('mvn test');
  try {
    if (has('Makefile') && /^test\s*:/m.test(fs.readFileSync(path.join(base, 'Makefile'), 'utf8'))) {
      suggestions.push('make test');
    }
  } catch {
    // unreadable Makefile — skip
  }
  return [...new Set(suggestions)].slice(0, 3);
}

export function classifyPathKind(filePath) {
  const normalized = String(filePath || '').replaceAll('\\', '/');
  const name = path.basename(normalized);
  if (normalized === 'docs' || normalized.startsWith('docs/')) return 'docs';
  if (/^README(?:\..*)?$/i.test(name) || /^AGENTS\.md$/i.test(name)) return 'docs';
  if (DOC_EXTS.has(path.extname(name).toLowerCase())) return 'docs';
  return 'code';
}

function status(check, statusValue, reason) {
  return { ...check, status: statusValue, reason };
}

export function indicatesFailure(output) {
  const text = String(output || '');
  const failedCount = text.match(FAILED_COUNT_PATTERN);
  if (failedCount) return true;
  // Negated/zero counts ("no tests failed", "0 failed") must win over the
  // bare "tests failed" substring check below.
  if (/\b(?:no|0)\s+(?:tests?\s+)?(?:errors?|failures?|failed)\b/i.test(text)) return false;
  return /\berror:/i.test(text)
    || /\b[1-9]\d*\s+errors?\b/i.test(text)
    || /\bexit code\s+[1-9]\d*\b/i.test(text)
    || /\btests?\s+failed\b/i.test(text)
    || /\bbuild failed\b/i.test(text)
    || /\btraceback\b/i.test(text)
    || /\bcommand not found\b/i.test(text)
    || /\bpanic\b/i.test(text)
    || /\bexception\b/i.test(text)
    || /\bFAILED\b/.test(text);
}

// promise-no-act (F-2): the closing statement announces future action but no
// tool call follows. English is two-stage (intent + action verb) so ordinary
// sign-offs never trip it; PROMISE_ASKS_USER exempts conversational closings
// ("Let me know…", "I'll wait…", questions).
const PROMISE_ASKS_USER = /\b(?:let me know|i'?ll wait|i will wait|feel free|if you (?:want|need|prefer|'d like|would like)|shall i|would you like|do you want|which option)\b|알려(?:줘|주세요|드릴게)|필요하면|원하시면|괜찮으면|教えて|お知らせ|必要なら|よければ/i;
const PROMISE_EN = /\b(?:i'?ll|i will|i'?m going to|i am going to|let me|next,?\s+i|now i'?ll)\b[^.?!]{0,60}\b(?:now|next|then|implement|create|write|add|run|fix|save|build|start|proceed|update|refactor|install|deploy|commit|test|continue|make|generate|configure|remove|delete)\b/i;
const PROMISE_KO = /(?:할게|하겠습니다|하겠어|해둘게|해놓을게)|(?:이제|지금|다음으로|먼저)\s*.{0,20}(?:하|만들|돌리|돌릴|실행|추가|작성|고치|구현|수정|시작|진행|빌드|설치|커밋|테스트)/;
const PROMISE_JA = /(?:これから|次に|今から)\s*.{0,20}(?:します|やります|実装|作成|修正|追加|書き|実行|始め)|(?:やります|実装します|作成します|修正します|追加します)/;

export function detectPromiseNoAct(transcriptText) {
  const events = [];
  for (const line of String(transcriptText || '').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const message = entry.message && typeof entry.message === 'object' ? entry.message : entry;
    if ((message.role || entry.type) !== 'assistant') continue;
    const content = Array.isArray(message.content)
      ? message.content
      : typeof message.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : [];
    for (const item of content) {
      if (item?.type === 'tool_use') events.push({ type: 'tool' });
      else if (item?.type === 'text' && item.text) events.push({ type: 'text', text: stripPluginNoise(item.text) });
    }
  }
  const lastTextIndex = events.findLastIndex(event => event.type === 'text' && event.text.trim());
  if (lastTextIndex < 0) return false;
  if (events.slice(lastTextIndex + 1).some(event => event.type === 'tool')) return false;
  const tail = events[lastTextIndex].text.trim().slice(-400);
  if (/[?？]\s*$/.test(tail)) return false;
  if (PROMISE_ASKS_USER.test(tail)) return false;
  const lastSentence = tail.split(/[.?!。！？…\n]+/).map(segment => segment.trim()).filter(Boolean).pop() || tail;
  return PROMISE_EN.test(lastSentence) || PROMISE_KO.test(lastSentence) || PROMISE_JA.test(lastSentence);
}

function scanTodos(editedFiles, cwd) {
  const hits = [];
  for (const file of editedFiles) {
    const diffLines = changedDiffLines(file, cwd);
    if (diffLines) {
      for (const hit of diffLines) {
        hits.push(hit);
        if (hits.length >= 10) return hits;
      }
      continue;
    }

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

function changedDiffLines(file, cwd) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null; // not a git repo — caller falls back to a full-file scan
  }
  try {
    // Untracked/new files never appear in `git diff HEAD`; every line is new, so
    // a full-file scan is exact (no legacy-TODO false positive to worry about).
    execFileSync('git', ['ls-files', '--error-unmatch', '--', file], { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
  } catch {
    return null;
  }
  try {
    const diff = execFileSync('git', ['diff', '-U0', 'HEAD', '--', file], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (!diff.trim()) return [];
    const hits = [];
    let newLine = 0;
    for (const line of diff.split(/\r?\n/)) {
      const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        newLine = Number(hunk[1]);
        continue;
      }
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) {
        if (COMMENT_CONTEXT_PATTERN.test(line.slice(1)) && TODO_PATTERN.test(line.slice(1))) {
          hits.push(`${path.basename(file)}:${newLine}`);
        }
        newLine += 1;
      } else if (!line.startsWith('-')) {
        newLine += 1;
      }
    }
    return hits;
  } catch {
    return null;
  }
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
    if (isCapturableRequirement(first)) requirements.push(first.slice(0, 160));
  }
  return requirements.filter(Boolean);
}

function isCapturableRequirement(text) {
  if (!text || text.startsWith('/')) return false;
  if (Buffer.byteLength(text, 'utf8') < 20) return false;
  if (/[?？]\s*$/.test(text)) return false;
  if (/^(?:고마워|감사|ㅇㅇ|응|네|좋아|그래|thanks|thank you|ok|okay|yes|lgtm|good|nice|了解|ありがとう)[.!。！\s]*$/i.test(text)) return false;
  return true;
}

// Function words carry no evidentiary weight; without removing them an English
// requirement trivially "matches" on the/to/of and the gate never bites.
const REQUIREMENT_STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'but', 'is', 'are', 'be', 'it',
  'this', 'that', 'with', 'as', 'at', 'by', 'from', 'into', 'please', 'make', 'sure', 'can',
  'you', 'we', 'my', 'me', 'so', 'if', 'then', 'do', 'does',
  // ko/ja politeness, urgency, and deixis fillers: they count as content words
  // but can never appear in evidence text, so they only inflate the denominator.
  '제발', '빨리', '부탁', '부탁해', '부탁해요', '부탁합니다', '그냥', '먼저', '다시', '지금', '오늘',
  '이거', '그거', '저거', '이것', '그것', '그리고', '해서', '해줘',
  'お願い', 'お願いします', 'ください', '早く', 'すぐ', 'まず', 'これ', 'それ', 'あれ', 'あと'
]);
const KO_PARTICLE = /(?:으로|에서|에게|한테|까지|부터|이라고|라고|과|와|를|을|이|가|은|는|에|로|도|만|의)$/;
const JA_PARTICLE = /(?:から|まで|を|が|は|に|へ|と|で|も|の)$/;
// Request suffixes name the ask, not the outcome ("수정해줘" can only ever match
// evidence as "수정"); strip them to the stem before particle stripping.
const KO_REQUEST_SUFFIX = /(?:해\s?주세요|해\s?줘요|해\s?줘|해\s?달라(?:고)?|해\s?봐요|해\s?봐|하세요|합시다|해라|해요|하자|주세요|줘요|줘)$/;
const JA_REQUEST_SUFFIX = /(?:してください|してほしい|しなさい|して|ください)$/;
// Japanese has no spaces, so a whole request is one token; splitting on common
// particles frees the nouns ("ログインのバグを直して…" → ログイン/バグ/…).
// ko/en tokens never contain these kana — a no-op for them.
const JA_PARTICLE_SPLIT = /から|まで|を|が|は|に|へ|と|で|も|の/;

// Korean/Japanese words often carry a trailing particle the evidence text lacks
// ("버그를" vs "버그"); strip it so a stem match still counts, but never below 2 chars.
function stripParticle(word) {
  for (const re of [KO_PARTICLE, JA_PARTICLE]) {
    const stripped = word.replace(re, '');
    if (stripped !== word && stripped.length >= 2) return stripped;
  }
  return word;
}

function normalizeWord(word) {
  let out = word;
  for (const re of [KO_REQUEST_SUFFIX, JA_REQUEST_SUFFIX]) {
    const stripped = out.replace(re, '');
    if (stripped !== out && stripped.length >= 2) {
      out = stripped;
      break;
    }
  }
  return stripParticle(out);
}

function contentWords(text) {
  return String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .flatMap(word => word.split(JA_PARTICLE_SPLIT))
    .filter(Boolean)
    .map(normalizeWord)
    .filter(word => word.length >= 2 && !REQUIREMENT_STOPWORDS.has(word));
}

function hasEvidenceForRequirement(requirement, haystack) {
  const words = contentWords(requirement);
  if (words.length === 0) return true;
  const matched = words.filter(word => haystack.includes(word)).length;
  // A majority of content words must show up — one incidental function word is
  // no longer enough to call a requirement verified.
  return matched / words.length >= 0.5;
}

function summarize(report, messages = messagesForLanguage('ko')) {
  if (report.ok) return messages.gate.summaries.passed;
  const parts = [];
  if (report.missingEvidence.length) parts.push(`missing=${report.missingEvidence.join(',')}`);
  if (report.untriedChecks.length) parts.push(`untried=${report.untriedChecks.join(',')}`);
  if (report.unverifiedRequirements.length) parts.push(`unverified_requirements=${report.unverifiedRequirements.length}`);
  if (report.failedChecks.length) parts.push(`failed=${report.failedChecks.join(',')}`);
  if (report.requiresHumanInput) parts.push('human_input=true');
  return parts.join('; ') || messages.gate.summaries.insufficient;
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
      input.transcriptText = readTranscriptTail(input.transcript_path);
    } catch (error) {
      input.transcriptReadError = error.message;
    }
  }
  return input;
}

// Long sessions produce multi-MB JSONL transcripts. The Stop-time signals we
// still parse from text (claimedComplete / promise-no-act / requiresHumanInput)
// all live near the end, so read only the tail. A partial first line is dropped;
// parseTranscript already skips unparseable lines.
function readTranscriptTail(file, env = process.env) {
  const maxBytes = Number.parseInt(env.MENHERA_LOOP_TRANSCRIPT_TAIL_BYTES, 10) || 512 * 1024;
  const { size } = fs.statSync(file);
  if (size <= maxBytes) return fs.readFileSync(file, 'utf8');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    fs.readSync(fd, buffer, 0, maxBytes, size - maxBytes);
    const text = buffer.toString('utf8');
    const newline = text.indexOf('\n');
    return newline >= 0 ? text.slice(newline + 1) : text;
  } finally {
    fs.closeSync(fd);
  }
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

function failOpen(error) {
  const message = String(error?.message || error || 'unknown hook error').replace(/\s+/g, ' ').slice(0, 180);
  console.log(JSON.stringify({ systemMessage: `[menhera-loop] hook failed open: ${message}` }));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
  if (process.env.MENHERA_LOOP_DISABLE === '1') process.exit(0);
  const observe = process.argv.includes('--observe');
  const raw = await readStdin();
  const input = loadHookInput(raw);
  const sessionId = input.session_id || 'unknown';
  const state = loadState(sessionId);
  if (input.hook_event_name === 'Stop' && !input.stop_hook_active && detectPromiseNoAct(input.transcriptText || '')) {
    const language = resolveMessageLanguage({ state, texts: [input.transcriptText || ''], env: process.env });
    console.log(JSON.stringify({ decision: 'block', reason: messagesForLanguage(language).promiseNoActMessage }));
    process.exit(0);
  }

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
      // Long-term trust: chat-only/config-only sessions never move it.
      recordGateOutcome({ outcome: 'pass', firstTry: state.retryCount === 0, sessionId });
      const receiptFile = persistReceipt(buildReceiptMarkdown(report, state));
      const receiptNote = receiptFile
        ? ` · ${fill(messagesForLanguage(report.language).receipt.savedMessage, { path: receiptFile })}`
        : '';
      console.log(JSON.stringify({ systemMessage: `menhera-loop trust ${report.trust}% · ${report.retryMessage}${receiptNote}` }));
    }
    process.exit(0);
  }

  if (state.retryCount >= MAX_RETRIES) {
    saveState(sessionId, { ...state, lastVerdict: 'gave_up', language: report.language });
    recordGateOutcome({ outcome: 'gave_up', sessionId });
    console.log(JSON.stringify({
      systemMessage: `${messageForRetry(MAX_RETRIES, report.language)} (미충족: ${report.summary}) ${messagesForLanguage(report.language).gaveUpReportMessage}`
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
  const outcomeDetails = {
    missingEvidence: report.missingEvidence,
    failedChecks: report.failedChecks,
    untriedChecks: report.untriedChecks
  };
  recordGateOutcome({ outcome: 'block', falseClaim: report.claimedComplete, sessionId, ...outcomeDetails });
  const localized = messagesForLanguage(report.language);
  const reason = [
    `[MENHERA_LOOP:RETRY:${nextRetry}] ${messageForRetry(state.retryCount, report.language)}`,
    `trust: ${report.trust}%`,
    `미충족 게이트: ${report.summary}`,
    ...report.checks.filter(check => check.status !== 'pass').map(check => `- ${check.label}: ${check.reason}`),
    ...(report.suggestedCommands.length
      ? [fill(localized.gate.suggestVerification, { commands: report.suggestedCommands.join(' / ') })]
      : []),
    localized.gate.blockInstruction,
    // Last block before the cap releases: tell the model — while it can still act
    // on it — to disclose the unverified finish in its final report if it gives up.
    ...(nextRetry >= MAX_RETRIES ? [localized.finalRetryConfession] : [])
  ].join('\n');
  console.log(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
  } catch (error) {
    failOpen(error);
  }
}
