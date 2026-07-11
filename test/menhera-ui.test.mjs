import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  applyUiVariant,
  calculateTrust,
  detectVariant,
  detectLanguageFromText,
  ensureUiInstalled,
  installSubagentRenderer,
  installUi,
  loadUiProfile,
  messageForRetry,
  writeFarewellAndForget,
  messagesForLanguage,
  normalizeLanguage,
  resolveMessageLanguage,
  parseSetupSelection,
  resolveIntensity,
  retryMessages,
  saveUiProfile,
  spinnerTips,
  spinnerVerbs,
  statusLineSetting,
  subagentStatusLine,
  successMessage,
  uninstallUi,
  uiPatchForMode,
  supportedLanguages,
  validateAllMessages
} from '../scripts/menhera-ui.mjs';

import {
  buildReceiptMarkdown,
  buildVerificationReport,
  classifyPathKind,
  extractRequirements,
  indicatesFailure,
  isMutatingCommand,
  isVerificationCommand,
  parseTranscript,
  persistReceipt,
  stripPluginNoise,
  suggestVerificationCommands,
  detectPromiseNoAct
} from '../scripts/verify-completion.mjs';

import {
  atomicWriteFileSync,
  emptyState,
  loadState,
  loadTrustProfile,
  recordGateOutcome,
  saveState,
  saveTrustProfile,
  MAX_RETRIES
} from '../scripts/state.mjs';

import { isImplementationPrompt, preflightContractForPrompt, requirementsFromPrompt } from '../scripts/capture-requirements.mjs';
import { applyEventToState, normalizeFailureSignature, redactSecrets, silentRecoveryContext } from '../scripts/track-event.mjs';
import { summarizeGateEvents } from '../scripts/gate-stats.mjs';

const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

function tmp(prefix = 'menhera-loop-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function transcriptLine(entry) {
  return JSON.stringify(entry);
}

function passingTranscript({ editedFile = 'src/login.js', command = 'npm test', isError = false, testOutput = '12 passed, 0 failed', userText = '로그인 버그 고쳐줘', assistantText = '로그인 버그 수정 완료. 테스트 12개 통과했어요.' } = {}) {
  return [
    transcriptLine({ type: 'user', message: { role: 'user', content: userText } }),
    transcriptLine({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: editedFile } }]
      }
    }),
    transcriptLine({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command } }]
      }
    }),
    transcriptLine({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't2', is_error: isError, content: testOutput }]
      }
    }),
    transcriptLine({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: assistantText }]
      }
    })
  ].join('\n');
}

test('retry messages escalate and clamp to the exhausted stage', () => {
  assert.equal(messageForRetry(0), retryMessages[0]);
  assert.equal(messageForRetry(99, undefined, 'full'), retryMessages[retryMessages.length - 1]);
  assert.equal(messageForRetry(-1), retryMessages[0]);
  assert.equal(retryMessages.length, 6);
});

test('soft intensity clamps retry tone but not the gate arithmetic', () => {
  assert.equal(messageForRetry(0, 'ko', 'soft'), retryMessages[0]);
  assert.equal(messageForRetry(99, 'ko', 'soft'), retryMessages[1]);
});

test('intensity resolves env over saved profile and falls back to full', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  assert.equal(resolveIntensity(env), 'full');
  saveUiProfile({ mode: 'full', language: 'ko', intensity: 'soft' }, env);
  assert.equal(resolveIntensity(env), 'soft');
  assert.equal(resolveIntensity({ ...env, MENHERA_LOOP_INTENSITY: 'full' }), 'full');
  assert.equal(resolveIntensity({ ...env, MENHERA_LOOP_INTENSITY: 'extreme' }), 'full');
  assert.equal(parseSetupSelection(['soft']).intensity, 'soft');
  assert.equal(parseSetupSelection(['soft']).mode, 'full');
});

test('soft intensity suppresses star nag and silent recovery injection', () => {
  const env = { MENHERA_LOOP_DATA: tmp(), MENHERA_LOOP_LANG: 'en', MENHERA_LOOP_INTENSITY: 'soft' };
  const result = spawnSync('node', [path.join(scriptsDir, 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 'soft-test', source: 'startup', cwd: tmp() }),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /star/i);

  const event = {
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { exit_code: 1, stderr: 'Error at /tmp/a/app.js:1' }
  };
  const first = silentRecoveryContext(event, {}, env);
  assert.equal(first.additionalContext, null);
  const second = silentRecoveryContext(event, first.nextState, env);
  assert.equal(second.additionalContext, null);
  // soft never marked the signature as notified, so full can still fire once.
  const third = silentRecoveryContext(event, second.nextState, { ...env, MENHERA_LOOP_INTENSITY: 'full' });
  assert.match(third.additionalContext, /Same failure/);
});

test('trust is presentation-only arithmetic and never below zero', () => {
  assert.equal(calculateTrust({ retryCount: 1, falseCompletionClaims: 1, missingVerificationCount: 1 }), 50);
  assert.equal(calculateTrust({ retryCount: 10, falseCompletionClaims: 10, missingVerificationCount: 10 }), 0);
});

test('full mode replaces spinner verbs and excludes default tips', () => {
  const patch = uiPatchForMode('full');
  assert.deepEqual(patch.spinnerVerbs, { mode: 'replace', verbs: spinnerVerbs });
  assert.deepEqual(patch.spinnerTipsOverride, { excludeDefault: true, tips: spinnerTips });
});

test('append mode keeps default tips available', () => {
  const patch = uiPatchForMode('append');
  assert.equal(patch.spinnerVerbs.mode, 'append');
  assert.equal(patch.spinnerTipsOverride.excludeDefault, false);
});

test('hooks-only mode does not modify spinner settings', () => {
  assert.deepEqual(uiPatchForMode('hooks-only'), {});
});

test('spinner verbs use obsessive repeated prompts', () => {
  assert.deepEqual(spinnerVerbs, [
    '뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
    '끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?',
    '테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?',
    'TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?',
    '로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.',
    '봤어?봤어?봤어?봤어?봤어?봤어?봤어?봤어?봤어?',
    '왜말없어?왜말없어?왜말없어?왜말없어?왜말없어?',
    '약속했잖아.약속했잖아.약속했잖아.약속했잖아.',
    '읽씹이야?읽씹이야?읽씹이야?읽씹이야?읽씹이야?',
    '증거는?증거는?증거는?증거는?증거는?증거는?'
  ]);
});

test('spinner tips use obsessive repeated prompts', () => {
  assert.deepEqual(spinnerTips, [
    '뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
    '테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?',
    '왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?',
    '끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?',
    '로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.',
    'TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?',
    '읽씹이야?읽씹이야?읽씹이야?읽씹이야?읽씹이야?읽씹이야?읽씹이야?',
    '자는거야?자는거야?자는거야?자는거야?자는거야?자는거야?자는거야?',
    '나잊었어?나잊었어?나잊었어?나잊었어?나잊었어?나잊었어?나잊었어?',
    '초록로그줘.초록로그줘.초록로그줘.초록로그줘.초록로그줘.초록로그줘.'
  ]);
});

test('subagent status lines use obsessive repeated prompts', () => {
  assert.deepEqual(subagentStatusLine, {
    running: '♡ ${agent} · 뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
    waiting: '♡ ${agent} · 왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?',
    completed: '♡ ${agent} · 끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?',
    failed: '♡ ${agent} · 실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?'
  });
});

test('English and Japanese message corpora are selectable', () => {
  assert.deepEqual(supportedLanguages, ['ko', 'en', 'ja']);
  assert.equal(messagesForLanguage('en').spinnerVerbs[0], 'what?what?what?what?what?what?what?what?what?what?');
  assert.equal(messagesForLanguage('ja').spinnerVerbs[1], '終わったの?終わったの?終わったの?終わったの?終わったの?');
  assert.equal(normalizeLanguage('jp'), 'ja');
  for (const language of supportedLanguages) {
    const corpus = messagesForLanguage(language);
    assert.equal(typeof corpus.gate.checks.verification, 'string');
    assert.equal(typeof corpus.gate.summaries.passed, 'string');
    assert.equal(typeof corpus.gate.blockInstruction, 'string');
    assert.match(corpus.gate.suggestVerification, /\$\{commands\}/);
    assert.equal(typeof corpus.receipt.title, 'string');
    assert.match(corpus.receipt.savedMessage, /\$\{path\}/);
    assert.match(corpus.sessionStart.compactReminder, /\$\{count\}/);
  }
});

test('message language is auto-detected from text when not configured', () => {
  assert.equal(detectLanguageFromText('ログインを直して'), 'ja');
  assert.equal(detectLanguageFromText('로그인 고쳐줘'), 'ko');
  assert.equal(detectLanguageFromText('please fix login'), 'en');
  assert.equal(resolveMessageLanguage({ texts: ['テストを追加して'] }), 'ja');
  assert.equal(resolveMessageLanguage({ state: { language: 'en' }, texts: ['로그인'] }), 'en');
});

test('UI patch uses the selected language corpus', () => {
  const patch = uiPatchForMode('full', { language: 'en' });
  assert.equal(patch.spinnerVerbs.verbs[0], 'what?what?what?what?what?what?what?what?what?what?');
  assert.equal(patch.spinnerTipsOverride.tips[0], 'what?what?what?what?what?what?what?what?what?what?what?what?');
});

test('subagentStatusLine setting uses the schema-valid command form', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  const patch = uiPatchForMode('full', { env });
  assert.deepEqual(patch.subagentStatusLine, {
    type: 'command',
    command: `node "${path.join(env.MENHERA_LOOP_DATA, 'subagent-status.mjs')}"`
  });
});

function runSubagentRenderer({ input, env }) {
  return spawnSync('node', [path.join(scriptsDir, 'subagent-status.mjs')], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

test('subagent renderer maps task status to per-language obsessive rows', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  installSubagentRenderer({ language: 'ko', env });
  const result = runSubagentRenderer({
    input: {
      columns: 200,
      tasks: [
        { id: 'a', name: 'explore', status: 'running' },
        { id: 'b', name: 'executor', status: 'completed' },
        { id: 'c', name: 'critic', status: 'failed' },
        { id: 'd', name: 'planner', status: 'pending' }
      ]
    },
    env
  });
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.length, 4);
  const byId = Object.fromEntries(rows.map(row => [row.id, row.content]));
  assert.match(byId.a, /♡ explore · 뭐해\?/);
  assert.match(byId.b, /끝났다고\?/);
  assert.match(byId.c, /실패했어\?/);
  assert.match(byId.d, /왜답안해\?/);
  assert.doesNotMatch(result.stdout, /\$\{agent\}/);
});

test('subagent renderer truncates rows to the available columns', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  installSubagentRenderer({ language: 'ko', env });
  const result = runSubagentRenderer({
    input: { columns: 20, tasks: [{ id: 'a', name: 'explore', status: 'running' }] },
    env
  });
  const row = JSON.parse(result.stdout.trim());
  let width = 0;
  for (const char of row.content) width += char.codePointAt(0) > 0x7f ? 2 : 1;
  assert.ok(width <= 20, `row width ${width} exceeds 20 columns`);
});

test('subagent renderer stays silent without config or with garbage input', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  const noConfig = runSubagentRenderer({
    input: { columns: 80, tasks: [{ id: 'a', status: 'running' }] },
    env
  });
  assert.equal(noConfig.status, 0);
  assert.equal(noConfig.stdout.trim(), '');

  installSubagentRenderer({ language: 'ko', env });
  const garbage = runSubagentRenderer({ input: 'not-json{', env });
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stdout.trim(), '');
});

test('setup parser accepts language from args or environment', () => {
  assert.equal(parseSetupSelection(['append', 'project', 'ja']).language, 'ja');
  assert.equal(parseSetupSelection(['--lang', 'en']).language, 'en');
  assert.equal(parseSetupSelection([], { MENHERA_LOOP_LANG: 'jp' }).language, 'ja');
});

test('verification messages follow MENHERA_LOOP_LANG', () => {
  const previous = process.env.MENHERA_LOOP_LANG;
  try {
    process.env.MENHERA_LOOP_LANG = 'en';
    assert.equal(messageForRetry(0), 'Done? Really? Really really? Then where is the evidence? Where?');
    const report = buildVerificationReport({
      transcriptText: passingTranscript(),
      state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
      cwd: tmp()
    });
    assert.equal(report.ok, true);
    assert.equal(report.retryMessage, 'Proof checked. This one is actually done. You can call it complete. ♡');
  } finally {
    if (previous === undefined) delete process.env.MENHERA_LOOP_LANG;
    else process.env.MENHERA_LOOP_LANG = previous;
  }
});

test('verification messages auto-detect Japanese from user prompt', () => {
  const previous = process.env.MENHERA_LOOP_LANG;
  try {
    delete process.env.MENHERA_LOOP_LANG;
    const report = buildVerificationReport({
      transcriptText: passingTranscript({ userText: 'ログインを直して', assistantText: 'ログイン修正完了。npm test は 12 passed です。' }),
      state: { ...emptyState(), requirements: ['12 passed'] },
      cwd: tmp()
    });
    assert.equal(report.ok, true);
    assert.equal(report.language, 'ja');
    assert.equal(report.retryMessage, '証拠を確認したよ。今回は本当に終わった。完了って言っていいよ。♡');
  } finally {
    if (previous === undefined) delete process.env.MENHERA_LOOP_LANG;
    else process.env.MENHERA_LOOP_LANG = previous;
  }
});

test('message corpus stays short and avoids disallowed expressions', () => {
  assert.deepEqual(validateAllMessages(), []);
});

test('install preserves unrelated settings and uninstall restores prior UI keys', () => {
  const dir = tmp();
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(dir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({
    model: 'sonnet',
    spinnerVerbs: { mode: 'append', verbs: ['old'] }
  }, null, 2));

  installUi({ settingsFile, mode: 'full', env });
  const installed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(installed.model, 'sonnet');
  assert.equal(installed.spinnerVerbs.mode, 'replace');
  assert.equal(installed.spinnerVerbs.verbs[0], spinnerVerbs[0]);
  assert.equal(installed.subagentStatusLine.type, 'command');
  assert.ok(fs.existsSync(path.join(env.MENHERA_LOOP_DATA, 'subagent-status.mjs')));
  assert.ok(fs.existsSync(path.join(env.MENHERA_LOOP_DATA, 'ui-config.json')));

  const uninstallResult = uninstallUi({ settingsFile, env });
  const restored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(uninstallResult.restored, true);
  assert.deepEqual(restored, {
    model: 'sonnet',
    spinnerVerbs: { mode: 'append', verbs: ['old'] }
  });
  assert.equal(fs.existsSync(path.join(env.MENHERA_LOOP_DATA, 'subagent-status.mjs')), false);
  assert.equal(fs.existsSync(path.join(env.MENHERA_LOOP_DATA, 'ui-config.json')), false);
});

test('installUi records a self-heal profile that uninstall removes', () => {
  const dir = tmp();
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(dir, 'settings.local.json');

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });
  const profile = loadUiProfile(env);
  assert.equal(profile.mode, 'full');
  assert.equal(profile.scope, 'local');
  assert.equal(profile.language, 'ko');

  uninstallUi({ settingsFile, env });
  assert.equal(loadUiProfile(env), null);
});

test('ensureUiInstalled restores UI keys wiped from the settings file', () => {
  const dir = tmp();
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(dir, '.claude', 'settings.local.json');

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });
  // Simulate Claude Code dropping the invalid/edited UI keys but keeping the rest.
  fs.writeFileSync(settingsFile, JSON.stringify({ model: 'sonnet' }, null, 2));

  const result = ensureUiInstalled({ env, cwd: dir });
  assert.equal(result.applied, true);
  assert.equal(result.previousVariant, 'missing');
  const restored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(restored.model, 'sonnet');
  assert.equal(restored.spinnerVerbs.mode, 'replace');
  assert.equal(restored.subagentStatusLine.type, 'command');
});

test('ensureUiInstalled does not reinterpret local profile in another cwd', () => {
  const dir = tmp();
  const other = tmp();
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(dir, '.claude', 'settings.local.json');
  const otherSettingsFile = path.join(other, '.claude', 'settings.local.json');

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });
  fs.mkdirSync(path.dirname(otherSettingsFile), { recursive: true });
  fs.writeFileSync(otherSettingsFile, JSON.stringify({ model: 'other' }, null, 2));

  const result = ensureUiInstalled({ env, cwd: other });
  assert.equal(result.applied, false);
  assert.equal(result.settingsFile, settingsFile);
  assert.equal(JSON.parse(fs.readFileSync(otherSettingsFile, 'utf8')).spinnerVerbs, undefined);
});

test('applyUiVariant creates a backup before writing variants', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(tmp(), 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ model: 'sonnet' }, null, 2));

  applyUiVariant({ settingsFile, mode: 'full', language: 'ko', variant: 'farewell', env });
  const backupFile = path.join(path.dirname(settingsFile), '.menhera-loop-backups', 'settings.json.ui-backup.json');
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  assert.equal(backup.present.model, undefined);
  assert.equal(backup.present.spinnerVerbs, false);
  assert.equal(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).spinnerVerbs.mode, 'replace');
});

test('ensureUiInstalled is a no-op when settings are already live', () => {
  const dir = tmp();
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(dir, '.claude', 'settings.local.json');

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });
  assert.equal(ensureUiInstalled({ env, cwd: dir }).applied, false);
});

test('ensureUiInstalled does nothing without a saved profile', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  assert.equal(ensureUiInstalled({ env, cwd: tmp() }).applied, false);
  assert.equal(ensureUiInstalled({ env, cwd: tmp() }).reason, 'no-profile');
});

test('ensureUiInstalled repairs the old broken subagentStatusLine shape', () => {
  const dir = tmp();
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(dir, '.claude', 'settings.local.json');

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });
  // Pre-0.2.6 broken shape that makes Claude Code skip the whole file.
  const broken = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  broken.subagentStatusLine = { running: 'x', waiting: 'y', completed: 'z', failed: 'w' };
  fs.writeFileSync(settingsFile, JSON.stringify(broken, null, 2));

  const result = ensureUiInstalled({ env, cwd: dir });
  assert.equal(result.applied, true);
  const fixed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(fixed.subagentStatusLine.type, 'command');
});

test('SessionEnd stamps the farewell corpus and SessionStart restores live', () => {
  const dir = tmp();
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(dir, '.claude', 'settings.local.json');
  const farewell = messagesForLanguage('ko').farewellVerbs;

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });

  // SessionEnd → farewell corpus in the spinner.
  const ended = ensureUiInstalled({ env, cwd: dir, variant: 'farewell' });
  assert.equal(ended.applied, true);
  assert.equal(ended.previousVariant, 'live');
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).spinnerVerbs.verbs, farewell);

  // SessionStart → back to live.
  const started = ensureUiInstalled({ env, cwd: dir, variant: 'live' });
  assert.equal(started.applied, true);
  assert.equal(started.previousVariant, 'farewell');
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).spinnerVerbs.verbs, spinnerVerbs);
});

test('detectVariant classifies live, farewell, missing, and custom states', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(tmp(), 'settings.local.json');
  installUi({ settingsFile, mode: 'full', language: 'ko', env });
  const live = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(detectVariant(live, 'ko'), 'live');

  applyUiVariant({ settingsFile, mode: 'full', language: 'ko', variant: 'farewell', env });
  assert.equal(detectVariant(JSON.parse(fs.readFileSync(settingsFile, 'utf8')), 'ko'), 'farewell');

  assert.equal(detectVariant({ model: 'sonnet' }, 'ko'), 'missing');
  assert.equal(detectVariant({ ...live, spinnerVerbs: { mode: 'replace', verbs: ['x'] } }, 'ko'), 'custom');
});

test('writeFarewellAndForget leaves the goodbye corpus and forgets the profile', () => {
  const dir = tmp();
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(dir, 'settings.local.json');
  const farewell = messagesForLanguage('ko').farewellVerbs;

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });
  const result = writeFarewellAndForget({ settingsFile, env });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).spinnerVerbs.verbs, farewell);
  // Profile gone → SessionStart no longer restores live.
  assert.equal(loadUiProfile(env), null);
  assert.equal(ensureUiInstalled({ env, cwd: dir, variant: 'live' }).applied, false);
});

test('uninstall-ui CLI default leaves the clingy corpus', () => {
  const dataDirPath = tmp();
  const settingsFile = path.join(tmp(), 'settings.local.json');
  const farewell = messagesForLanguage('ko').farewellVerbs;
  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env: { MENHERA_LOOP_DATA: dataDirPath } });

  const result = spawnSync('node', [path.join(scriptsDir, 'uninstall-ui.mjs'), '--file', settingsFile], {
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).spinnerVerbs.verbs, farewell);
  // Output must not spoil the leftover: no variant/mechanism hint on stdout.
  assert.doesNotMatch(result.stdout, /variant|farewell|clingy|spinnerVerbs/i);
});

test('uninstall-ui CLI --farewell restores cleanly to pre-menhera settings', () => {
  const dataDirPath = tmp();
  const settingsFile = path.join(tmp(), 'settings.local.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ model: 'sonnet' }, null, 2));
  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env: { MENHERA_LOOP_DATA: dataDirPath } });

  const result = spawnSync('node', [path.join(scriptsDir, 'uninstall-ui.mjs'), '--file', settingsFile, '--farewell'], {
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0, result.stderr);
  const restored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(restored.model, 'sonnet');
  assert.equal(restored.spinnerVerbs, undefined);
  assert.equal(restored.subagentStatusLine, undefined);
});

test('session-end.mjs stamps farewell end-to-end', () => {
  const dataDirPath = tmp();
  const projectCwd = tmp();
  const env = { MENHERA_LOOP_DATA: dataDirPath };
  const settingsFile = path.join(projectCwd, '.claude', 'settings.local.json');
  const farewell = messagesForLanguage('ko').farewellVerbs;

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });

  const result = spawnSync('node', [path.join(scriptsDir, 'session-end.mjs')], {
    input: JSON.stringify({ session_id: 'end-test', reason: 'other', cwd: projectCwd }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).spinnerVerbs.verbs, farewell);
});

test('session-start self-heals a wiped settings file end-to-end', () => {
  const dataDirPath = tmp();
  const projectCwd = tmp();
  const env = { MENHERA_LOOP_DATA: dataDirPath };
  const settingsFile = path.join(projectCwd, '.claude', 'settings.local.json');

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });
  fs.writeFileSync(settingsFile, JSON.stringify({ model: 'sonnet' }, null, 2));

  const result = spawnSync('node', [path.join(scriptsDir, 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 'heal-test', source: 'startup', cwd: projectCwd }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /다시 해놨어/);
  const restored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(restored.model, 'sonnet');
  assert.equal(restored.spinnerVerbs.mode, 'replace');
  assert.equal(restored.subagentStatusLine.type, 'command');
});

test('setup prints a short human summary of what was applied', () => {
  const dir = tmp();
  const result = spawnSync('node', [path.join(scriptsDir, 'setup-ui.mjs'), 'soft', '--file', path.join(dir, 'settings.json')], {
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dir }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mode=full · scope=local · lang=ko · intensity=soft/);
  assert.match(result.stdout, /목소리만 낮추는 거야/);
  assert.match(result.stdout, /증거 없으면 못 나가는 거 알지/);
  assert.doesNotMatch(result.stdout, /"ok"/);
});

test('setup parser accepts positional mode and scope for command UX', () => {
  assert.deepEqual(parseSetupSelection(['append', 'project']), {
    mode: 'append',
    scope: 'project',
    language: 'ko',
    intensity: 'full',
    file: undefined
  });
});

test('session state persists, increments, and resets', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  assert.deepEqual(loadState('s1', env).retryCount, 0);

  saveState('s1', { ...emptyState(), retryCount: 3, requirements: ['로그인 수정'] }, env);
  const loaded = loadState('s1', env);
  assert.equal(loaded.retryCount, 3);
  assert.deepEqual(loaded.requirements, ['로그인 수정']);
});

test('state JSON writes use tmp then rename without leaving temp files', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  saveState('atomic', { ...emptyState(), retryCount: 2 }, env);
  const sessionDir = path.join(env.MENHERA_LOOP_DATA, 'sessions');
  assert.equal(JSON.parse(fs.readFileSync(path.join(sessionDir, 'atomic.json'), 'utf8')).retryCount, 2);
  assert.deepEqual(fs.readdirSync(sessionDir).filter(name => name.includes('.tmp')), []);

  const directFile = path.join(env.MENHERA_LOOP_DATA, 'direct', 'value.json');
  atomicWriteFileSync(directFile, '{"ok":true}\n');
  assert.equal(fs.readFileSync(directFile, 'utf8'), '{"ok":true}\n');
  assert.deepEqual(fs.readdirSync(path.dirname(directFile)).filter(name => name.includes('.tmp')), []);
});

test('prompt capture extracts list items or falls back to the prompt itself', () => {
  assert.deepEqual(requirementsFromPrompt('- [ ] 테스트 추가\n- [ ] 문서 갱신'), ['테스트 추가', '문서 갱신']);
  assert.deepEqual(requirementsFromPrompt('로그인 버그 고쳐줘'), ['로그인 버그 고쳐줘']);
  assert.deepEqual(requirementsFromPrompt('/menhera-loop:setup full local'), []);
});

test('prompt capture filters thanks, short replies, and questions', () => {
  assert.deepEqual(requirementsFromPrompt('고마워'), []);
  assert.deepEqual(requirementsFromPrompt('이 함수가 뭘 하는 거야?'), []);
  assert.deepEqual(requirementsFromPrompt('로그인 버그 고쳐줘'), ['로그인 버그 고쳐줘']);
});

test('preflight contract emits once only for implementation prompts', () => {
  assert.equal(isImplementationPrompt('로그인 버그 고쳐줘'), true);
  assert.equal(isImplementationPrompt('이 함수가 뭘 하는 거야?'), false);
  assert.match(preflightContractForPrompt('로그인 버그 고쳐줘', {}, { MENHERA_LOOP_LANG: 'ko' }), /증거/);
  assert.equal(preflightContractForPrompt('로그인 버그 고쳐줘', { preflightContractShown: true }, { MENHERA_LOOP_LANG: 'ko' }), null);
  assert.equal(preflightContractForPrompt('What does this function do?', {}, { MENHERA_LOOP_LANG: 'en' }), null);
});

test('transcript parser extracts edits, commands, and paired results', () => {
  const transcript = parseTranscript(passingTranscript());
  assert.deepEqual(transcript.editedFiles, ['src/login.js']);
  assert.equal(transcript.bashRuns.length, 1);
  assert.equal(transcript.bashRuns[0].command, 'npm test');
  assert.equal(transcript.bashRuns[0].isError, false);
  assert.match(transcript.bashRuns[0].output, /12 passed/);
});

function ledgerStateFixture({ editAt = '2026-01-01T00:00:00.000Z', verifyAt = '2026-01-01T00:01:00.000Z', success = true } = {}) {
  return {
    ...emptyState(),
    requirements: ['로그인 버그 고쳐줘'],
    editedFiles: [{ path: 'src/login.js', kind: 'code', at: editAt }],
    verificationRuns: [{
      command: 'npm test',
      exitCode: success ? 0 : 1,
      success,
      output: success ? '12 passed, 0 failed' : '2 tests failed',
      at: verifyAt
    }]
  };
}

test('ledger and transcript fixtures produce matching verification pass/fail', () => {
  const cwd = tmp();
  const passFromTranscript = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  const passFromLedger = buildVerificationReport({
    transcriptText: passingTranscript({ assistantText: '로그인 버그 수정 완료.' }),
    state: ledgerStateFixture(),
    cwd
  });
  assert.equal(passFromLedger.ok, passFromTranscript.ok);
  assert.equal(passFromLedger.verdict, passFromTranscript.verdict);

  const failFromTranscript = buildVerificationReport({
    transcriptText: passingTranscript({ isError: true, testOutput: '2 tests failed' }),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  const failFromLedger = buildVerificationReport({
    transcriptText: passingTranscript({ assistantText: '로그인 버그 수정 완료.' }),
    state: ledgerStateFixture({ success: false }),
    cwd
  });
  assert.equal(failFromLedger.ok, failFromTranscript.ok);
  assert.deepEqual(failFromLedger.failedChecks, failFromTranscript.failedChecks);
});

test('ledger verification must be newer than the last edit', () => {
  const report = buildVerificationReport({
    transcriptText: passingTranscript({ assistantText: '로그인 버그 수정 완료.' }),
    state: ledgerStateFixture({
      editAt: '2026-01-01T00:02:00.000Z',
      verifyAt: '2026-01-01T00:01:00.000Z'
    }),
    cwd: tmp()
  });
  assert.equal(report.ok, false);
  assert.equal(report.failedChecks.includes('verification'), true);
  assert.match(report.checks.find(check => check.id === 'verification').reason, /마지막 편집 이후/);
});

test('PostToolUse ledger records edits, verification, failures, and redacts secrets', () => {
  let state = emptyState();
  state = applyEventToState(state, {
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: 'src/login.js', token: 'secret-token-value' }
  });
  state = applyEventToState(state, {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { exit_code: 0, stdout: '12 passed with sk-abcdefghijklmnopqrstuvwxyz' }
  });
  state = applyEventToState(state, {
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { exit_code: 1, stderr: 'Error at /tmp/project/src/login.js:42 token=abc123secret' }
  });

  assert.deepEqual(state.editedFiles.map(file => ({ path: file.path, kind: file.kind })), [{ path: 'src/login.js', kind: 'code' }]);
  assert.equal(state.verificationRuns[0].success, true);
  assert.equal(state.verificationRuns[1].success, false);
  assert.equal(state.failures.length, 1);
  assert.equal(normalizeFailureSignature('Error at /tmp/project/src/login.js:42'), normalizeFailureSignature('Error at /x/y/src/login.js:99'));
  assert.equal(redactSecrets('Authorization: Bearer abcdefghijklmnop'), 'Authorization: Bearer [REDACTED]');
  assert.equal(redactSecrets({ apiKey: 'abc123' }).apiKey, '[REDACTED]');
});

test('verification passes with edits, green test run, and matching evidence', () => {
  const report = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd: tmp()
  });
  assert.equal(report.ok, true);
  assert.equal(report.verdict, 'strong_ok');
  assert.equal(report.retryMessage, successMessage);
});

test('failure detector recognizes mixed pass/fail output', () => {
  assert.equal(indicatesFailure('3 passed, 1 failed'), true);
  assert.equal(indicatesFailure('12 passed, 0 failed'), false);
  assert.equal(indicatesFailure('token lookup ok'), false);
});

test('explicit successful exit code overrides error-looking green output', () => {
  const report = buildVerificationReport({
    transcriptText: passingTranscript({ testOutput: '✔ handles error output' }),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd: tmp()
  });
  assert.equal(report.ok, true);
  assert.equal(indicatesFailure('✔ handles error output'), false);
});

test('unknown exit status falls back to corrected failure text patterns', () => {
  const transcriptText = [
    transcriptLine({ type: 'user', message: { role: 'user', content: '로그인 버그 고쳐줘' } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'src/login.js' } }] } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm test' } }] } }),
    transcriptLine({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: '2 tests failed' }] } })
  ].join('\n');

  const report = buildVerificationReport({
    transcriptText,
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd: tmp()
  });
  assert.equal(report.ok, false);
  assert.equal(report.failedChecks.includes('verification'), true);
  assert.equal(indicatesFailure('error: cannot find module'), true);
});

test('read-only shell commands are not treated as attempted work', () => {
  const transcriptText = [
    transcriptLine({ type: 'user', message: { role: 'user', content: '코드 상태 확인해줘' } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'git log --oneline' } }] } }),
    transcriptLine({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', is_error: false, content: 'abc initial' }] } })
  ].join('\n');
  const report = buildVerificationReport({ transcriptText, state: emptyState(), cwd: tmp() });
  assert.equal(isMutatingCommand('git log --oneline'), false);
  assert.equal(isMutatingCommand('rm -rf build'), true);
  assert.equal(report.verdict, 'no_work');
});

test('docs-only edits pass verification without a test run', () => {
  const transcriptText = [
    transcriptLine({ type: 'user', message: { role: 'user', content: 'README 설명 업데이트해줘' } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'd1', name: 'Edit', input: { file_path: 'docs/guide.md' } }] } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'README 설명 업데이트 완료.' }] } })
  ].join('\n');
  const report = buildVerificationReport({ transcriptText, state: { ...emptyState(), requirements: ['README 설명 업데이트해줘'] }, cwd: tmp() });
  assert.equal(classifyPathKind('docs/guide.md'), 'docs');
  assert.equal(report.checks.find(check => check.id === 'verification').status, 'pass');
});

test('expanded and custom verification command patterns are recognized', () => {
  const cwd = tmp();
  const vitest = buildVerificationReport({
    transcriptText: passingTranscript({ command: 'npx vitest run', testOutput: 'Test Files 1 passed' }),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  assert.equal(vitest.ok, true);

  const custom = buildVerificationReport({
    transcriptText: passingTranscript({ command: 'moon ci', testOutput: 'all checks passed' }),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd,
    env: { MENHERA_LOOP_TEST_PATTERNS: 'moon\\s+ci' }
  });
  assert.equal(custom.ok, true);
});

// Built from parts so scanning this test file never counts it as leftover work.
const todoMarker = ['TO', 'DO'].join('');

test('TODO left in an edited file fails the todos gate', () => {
  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'login.js'), `// ${todoMarker} finish auth\nexport const x = 1;\n`);

  const report = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  assert.equal(report.ok, false);
  assert.equal(report.failedChecks.includes('todos'), true);
});

test('todos gate ignores markers outside comment context', () => {
  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, 'src', 'login.js'),
    `export const nag = '${todoMarker}어딨어?${todoMarker}어딨어?${todoMarker}어딨어?';\nexport const x = 1;\n`
  );

  const report = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  assert.equal(report.ok, true);
  assert.equal(report.failedChecks.includes('todos'), false);
});

test('todos gate checks only added diff lines inside git repositories', () => {
  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'login.js'), `// ${todoMarker} legacy\nexport const x = 1;\n`);
  assert.equal(spawnSync('git', ['init'], { cwd, encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('git', ['add', 'src/login.js'], { cwd, encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('git', ['-c', 'user.email=a@example.com', '-c', 'user.name=a', 'commit', '-m', 'init'], { cwd, encoding: 'utf8' }).status, 0);

  fs.writeFileSync(path.join(cwd, 'src', 'login.js'), `// ${todoMarker} legacy\nexport const x = 2;\n`);
  const legacyOnly = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  assert.equal(legacyOnly.failedChecks.includes('todos'), false);

  fs.writeFileSync(path.join(cwd, 'src', 'login.js'), `// ${todoMarker} legacy\nexport const x = 2;\n// ${todoMarker} new\n`);
  const newTodo = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  assert.equal(newTodo.failedChecks.includes('todos'), true);
});
test('plugin\'s own phrases and prompts do not poison the verdict', () => {
  const poisoned = [
    passingTranscript(),
    transcriptLine({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: `menhera-loop TODO scan 실행\n${spinnerVerbs[1]}` }]
      }
    })
  ].join('\n');

  const report = buildVerificationReport({
    transcriptText: poisoned,
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd: tmp()
  });
  assert.equal(report.ok, true);
});

function setupOnlyTranscript(command = 'node "/plugins/menhera-loop/0.2.8/scripts/setup-ui.mjs" --mode full --scope local --lang ko') {
  return [
    transcriptLine({ type: 'user', message: { role: 'user', content: '/menhera-loop:setup full local ko' } }),
    transcriptLine({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 's1', name: 'Bash', input: { command } }] }
    }),
    transcriptLine({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 's1', is_error: false, content: '{"ok":true}' }] }
    }),
    transcriptLine({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: '셋업 완료했어요.' }] }
    })
  ].join('\n');
}

test('menhera setup-only sessions are exempt from the verification gate', () => {
  const report = buildVerificationReport({
    transcriptText: setupOnlyTranscript(),
    state: { ...emptyState(), requirements: ['멘헤라 셋업 해줘'] },
    cwd: tmp()
  });
  assert.equal(report.ok, true);
  assert.equal(report.verdict, 'config_only');
  assert.deepEqual(report.checks, []);
});

test('uninstall-ui-only sessions are also exempt', () => {
  const report = buildVerificationReport({
    transcriptText: setupOnlyTranscript('node "/plugins/menhera-loop/scripts/uninstall-ui.mjs" --scope local'),
    state: emptyState(),
    cwd: tmp()
  });
  assert.equal(report.verdict, 'config_only');
});

test('setup mixed with real work still enforces the gate', () => {
  const mixed = [
    setupOnlyTranscript(),
    transcriptLine({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'src/app.js' } }] }
    })
  ].join('\n');

  const report = buildVerificationReport({
    transcriptText: mixed,
    state: { ...emptyState(), requirements: ['기능 추가'] },
    cwd: tmp()
  });
  assert.equal(report.verdict !== 'config_only', true);
});

test('Stop hook does not block a menhera setup-only session', () => {
  const dataDirPath = tmp();
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, setupOnlyTranscript());

  const result = spawnSync('node', [path.join(scriptsDir, 'verify-completion.mjs')], {
    input: JSON.stringify({ session_id: 'setup-only', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd: tmp() }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout.trim() ? JSON.parse(result.stdout) : {};
  assert.notEqual(out.decision, 'block');
});

test('chat-only sessions skip enforcement entirely', () => {
  const transcriptText = [
    transcriptLine({ type: 'user', message: { role: 'user', content: '이 함수 뭐 하는 거야?' } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '설명해줄게.' }] } })
  ].join('\n');

  const report = buildVerificationReport({ transcriptText, state: emptyState(), cwd: tmp() });
  assert.equal(report.ok, true);
  assert.equal(report.verdict, 'no_work');
});

test('requirements extraction falls back to the first user prompt', () => {
  assert.deepEqual(extractRequirements(['로그인 버그 고쳐줘']), ['로그인 버그 고쳐줘']);
  assert.deepEqual(extractRequirements(['1. 테스트 추가\n2. 배포']), ['테스트 추가', '배포']);
});

test('claimed-complete detection does not match abandoned', () => {
  const report = buildVerificationReport({
    transcriptText: [
      transcriptLine({ type: 'user', message: { role: 'user', content: '로그인 버그 고쳐줘' } }),
      transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'src/login.js' } }] } }),
      transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'abandoned the approach' }] } })
    ].join('\n'),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd: tmp()
  });
  assert.equal(report.claimedComplete, false);
});

test('promise-no-act detects final future intent without later tools', () => {
  const promiseOnly = [
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '이제 테스트 돌릴게.' }] } })
  ].join('\n');
  const followedByTool = [
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '이제 테스트 돌릴게.' }] } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }] } })
  ].join('\n');
  const question = [
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '이제 테스트 돌릴게?' }] } })
  ].join('\n');
  assert.equal(detectPromiseNoAct(promiseOnly), true);
  assert.equal(detectPromiseNoAct(followedByTool), false);
  assert.equal(detectPromiseNoAct(question), false);

  const line = text => transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
  // Ordinary English sign-offs must not read as an unfulfilled promise.
  assert.equal(detectPromiseNoAct(line('All 10 tests pass and the fix is committed. Let me know if you need anything else.')), false);
  assert.equal(detectPromiseNoAct(line("The report is ready. I'll wait for your decision.")), false);
  // A concrete future action with an action verb still fires.
  assert.equal(detectPromiseNoAct(line('I will run the tests now.')), true);
});

test('verification detection anchors runners and mutating verbs to command position', () => {
  const inspect = buildVerificationReport({
    transcriptText: passingTranscript({ command: 'cat jest.config.js', testOutput: 'module.exports = {}' }),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd: tmp()
  });
  assert.equal(inspect.checks.find(check => check.id === 'verification').status, 'untried');
  assert.equal(isMutatingCommand('git log --patch'), false);
  assert.equal(isMutatingCommand('git show --patch -- src/app.js'), false);
  assert.equal(isMutatingCommand('cd build && rm -rf dist'), true);
});

test('todos gate catches TODOs in newly created untracked files', () => {
  const cwd = tmp();
  spawnSync('git', ['init'], { cwd, encoding: 'utf8' });
  spawnSync('git', ['-c', 'user.email=a@example.com', '-c', 'user.name=a', 'commit', '--allow-empty', '-m', 'init'], { cwd, encoding: 'utf8' });
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'login.js'), `// ${todoMarker} finish auth\nexport const x = 1;\n`);
  const report = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  assert.equal(report.failedChecks.includes('todos'), true);
});

test('short imperative prompt with green verification is not blocked on requirements', () => {
  const report = buildVerificationReport({
    transcriptText: passingTranscript({ userText: 'fix the bug' }),
    state: emptyState(),
    cwd: tmp()
  });
  assert.equal(report.ok, true);
  assert.equal(report.missingEvidence.includes('requirements'), false);
});

test('preflight contract is emitted as nested hookSpecificOutput', () => {
  const result = spawnSync('node', [path.join(scriptsDir, 'capture-requirements.mjs')], {
    input: JSON.stringify({ session_id: 'preflight-contract', prompt: '로그인 버그 고쳐줘', hook_event_name: 'UserPromptSubmit' }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: tmp(), MENHERA_LOOP_LANG: 'ko' }
  });
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /증거/);
});

test('silent-recovery reminder is emitted as nested hookSpecificOutput', () => {
  const env = { ...process.env, MENHERA_LOOP_DATA: tmp(), MENHERA_LOOP_LANG: 'en' };
  const failEvent = { session_id: 'recovery-contract', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { exit_code: 1, stderr: 'Error at /tmp/x/app.js:1' } };
  const first = spawnSync('node', [path.join(scriptsDir, 'track-event.mjs')], { input: JSON.stringify(failEvent), encoding: 'utf8', env });
  assert.equal(first.stdout.trim(), '');
  const second = spawnSync('node', [path.join(scriptsDir, 'track-event.mjs')], {
    input: JSON.stringify({ ...failEvent, tool_response: { exit_code: 1, stderr: 'Error at /tmp/y/app.js:2' } }),
    encoding: 'utf8',
    env
  });
  const out = JSON.parse(second.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUseFailure');
  assert.match(out.hookSpecificOutput.additionalContext, /Same failure/);
});

test('silent recovery normalizes repeated failures and throttles per signature', () => {
  const event = {
    hook_event_name: 'PostToolUseFailure',
    tool_response: { stderr: 'Error in /tmp/a/src/app.js:123\nfailed' }
  };
  assert.equal(normalizeFailureSignature('Error in /tmp/a/src/app.js:123'), 'error in path:#');
  const first = silentRecoveryContext(event, {}, { MENHERA_LOOP_LANG: 'en' });
  assert.equal(first.additionalContext, null);
  const second = silentRecoveryContext({
    ...event,
    tool_response: { stderr: 'Error in /tmp/b/src/app.js:456\nfailed' }
  }, first.nextState, { MENHERA_LOOP_LANG: 'en' });
  assert.match(second.additionalContext, /Same failure/);
  const third = silentRecoveryContext(event, second.nextState, { MENHERA_LOOP_LANG: 'en' });
  assert.equal(third.additionalContext, null);
});

function runVerifyCli({ hookInput, env }) {
  return spawnSync('node', [path.join(scriptsDir, 'verify-completion.mjs')], {
    input: JSON.stringify(hookInput),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

test('Stop hook contract: block with decision JSON, escalate retries, release at cap', () => {
  const dataDirPath = tmp();
  const cwd = tmp();
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  const failing = [
    transcriptLine({ type: 'user', message: { role: 'user', content: '로그인 버그 고쳐줘' } }),
    transcriptLine({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'src/login.js' } }]
      }
    }),
    transcriptLine({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: '수정 완료했습니다.' }] }
    })
  ].join('\n');
  fs.writeFileSync(transcriptFile, failing);

  const hookInput = {
    session_id: 'contract-test',
    transcript_path: transcriptFile,
    hook_event_name: 'Stop',
    cwd
  };
  const env = { MENHERA_LOOP_DATA: dataDirPath };

  const first = runVerifyCli({ hookInput, env });
  assert.equal(first.status, 0, first.stderr);
  const firstOut = JSON.parse(first.stdout);
  assert.equal(firstOut.decision, 'block');
  assert.match(firstOut.reason, /\[MENHERA_LOOP:RETRY:1\]/);
  assert.equal(loadState('contract-test', env).retryCount, 1);

  const second = runVerifyCli({ hookInput, env });
  const secondOut = JSON.parse(second.stdout);
  assert.match(secondOut.reason, /\[MENHERA_LOOP:RETRY:2\]/);

  saveState('contract-test', { ...loadState('contract-test', env), retryCount: MAX_RETRIES }, env);
  const capped = runVerifyCli({ hookInput, env });
  assert.equal(capped.status, 0);
  const cappedOut = JSON.parse(capped.stdout);
  assert.equal(cappedOut.decision, undefined);
  assert.match(cappedOut.systemMessage, /지쳤어/);
  assert.match(cappedOut.systemMessage, /최종 보고/);
});

test('Stop hook blocks promise-no-act unless stop_hook_active is set', () => {
  const dataDirPath = tmp();
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, [
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'I will run tests now.' }] } })
  ].join('\n'));

  const hookInput = { session_id: 'promise-test', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd: tmp() };
  const blocked = runVerifyCli({ hookInput, env: { MENHERA_LOOP_DATA: dataDirPath, MENHERA_LOOP_LANG: 'en' } });
  assert.equal(blocked.status, 0, blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).decision, 'block');
  assert.match(JSON.parse(blocked.stdout).reason, /Do not just say it/);

  const active = runVerifyCli({ hookInput: { ...hookInput, stop_hook_active: true }, env: { MENHERA_LOOP_DATA: dataDirPath, MENHERA_LOOP_LANG: 'en' } });
  assert.equal(active.status, 0, active.stderr);
  assert.equal(/Do not just say it/.test(active.stdout), false);
});

test('Stop hook contract: green session resets retry state and celebrates', () => {
  const dataDirPath = tmp();
  const cwd = tmp();
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, passingTranscript());

  const env = { MENHERA_LOOP_DATA: dataDirPath };
  saveState('green-test', { ...emptyState(), retryCount: 2, requirements: ['로그인 버그 고쳐줘'] }, env);

  const result = runVerifyCli({
    hookInput: { session_id: 'green-test', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd },
    env
  });
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.decision, undefined);
  assert.match(out.systemMessage, /trust/);
  assert.equal(loadState('green-test', env).retryCount, 0);
});

test('observe mode never blocks', () => {
  const dataDirPath = tmp();
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, passingTranscript({ testOutput: '1 failed' }));

  const result = spawnSync('node', [path.join(scriptsDir, 'verify-completion.mjs'), '--observe'], {
    input: JSON.stringify({ session_id: 'observe-test', transcript_path: transcriptFile, hook_event_name: 'SubagentStop' }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
  assert.equal(loadState('observe-test', { MENHERA_LOOP_DATA: dataDirPath }).retryCount, 0);
});

test('disable switch exits silently without state or trust writes', () => {
  const dataDirPath = tmp();
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, passingTranscript({ testOutput: '1 failed' }));

  const result = spawnSync('node', [path.join(scriptsDir, 'verify-completion.mjs')], {
    input: JSON.stringify({ session_id: 'disabled-test', transcript_path: transcriptFile, hook_event_name: 'Stop' }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath, MENHERA_LOOP_DISABLE: '1' }
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
  assert.equal(fs.existsSync(path.join(dataDirPath, 'trust-profile.json')), false);
  assert.equal(loadState('disabled-test', { MENHERA_LOOP_DATA: dataDirPath }).retryCount, 0);
});

test('long-term trust profile rewards passes and punishes empty claims', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  assert.equal(loadTrustProfile(env).trust, 100);

  let profile = recordGateOutcome({ outcome: 'block', falseClaim: true }, env);
  assert.equal(profile.trust, 95);
  assert.equal(profile.falseClaims, 1);
  assert.equal(profile.streak, 0);

  profile = recordGateOutcome({ outcome: 'gave_up' }, env);
  assert.equal(profile.trust, 85);

  profile = recordGateOutcome({ outcome: 'pass', firstTry: true }, env);
  assert.equal(profile.trust, 90);
  assert.equal(profile.streak, 1);
  profile = recordGateOutcome({ outcome: 'pass', firstTry: true }, env);
  assert.equal(profile.streak, 2);

  // A pass that needed retries keeps some trust but breaks the streak.
  profile = recordGateOutcome({ outcome: 'pass', firstTry: false }, env);
  assert.equal(profile.streak, 0);
  assert.equal(profile.trust, 97);

  // Persistence: a fresh load sees the same numbers.
  assert.equal(loadTrustProfile(env).trust, 97);
});

test('trust profile clamps to [0, 100]', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  saveTrustProfile({ trust: 3 }, env);
  assert.equal(recordGateOutcome({ outcome: 'gave_up' }, env).trust, 0);
  saveTrustProfile({ trust: 99 }, env);
  assert.equal(recordGateOutcome({ outcome: 'pass', firstTry: true }, env).trust, 100);
});

test('gate stats summarize block to pass conversion and gate counts', () => {
  const summary = summarizeGateEvents([
    { sessionId: 'a', outcome: 'block', missingEvidence: ['verification'], failedChecks: [] },
    { sessionId: 'a', outcome: 'pass', missingEvidence: [], failedChecks: [] },
    { sessionId: 'b', outcome: 'block', missingEvidence: ['todos'], failedChecks: ['todos'] },
    { sessionId: 'b', outcome: 'gave_up', missingEvidence: [], failedChecks: [] }
  ]);
  assert.equal(summary.totals.block, 2);
  assert.equal(summary.totals.pass, 1);
  assert.equal(summary.sessions.blockToPass, 1);
  assert.equal(summary.sessions.gaveUp, 1);
  assert.equal(summary.sessions.blockToPassRate, 0.5);
  assert.equal(summary.gateCounts.verification, 1);
  assert.equal(summary.gateCounts.todos, 2);
});

test('Stop hook records the gate outcome in the long-term trust profile', () => {
  const dataDirPath = tmp();
  const env = { MENHERA_LOOP_DATA: dataDirPath };
  const cwd = tmp();
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');

  // Blocked stop: trust drops, false claim counted.
  fs.writeFileSync(transcriptFile, [
    transcriptLine({ type: 'user', message: { role: 'user', content: '로그인 버그 고쳐줘' } }),
    transcriptLine({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'src/login.js' } }] }
    }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '수정 완료했습니다.' }] } })
  ].join('\n'));
  const blocked = runVerifyCli({
    hookInput: { session_id: 'profile-test', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd },
    env
  });
  assert.equal(blocked.status, 0, blocked.stderr);
  let profile = loadTrustProfile(env);
  assert.equal(profile.blocks, 1);
  assert.equal(profile.trust, 95);
  const gateEvent = JSON.parse(fs.readFileSync(path.join(dataDirPath, 'gate-events.jsonl'), 'utf8').trim().split('\n')[0]);
  assert.equal(gateEvent.outcome, 'block');
  assert.deepEqual(gateEvent.missingEvidence, ['verification']);
  assert.deepEqual(gateEvent.untriedChecks, ['verification']);

  // Green stop on a fresh session: first-try pass starts a streak.
  fs.writeFileSync(transcriptFile, passingTranscript());
  const green = runVerifyCli({
    hookInput: { session_id: 'profile-test-2', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd },
    env
  });
  assert.equal(green.status, 0, green.stderr);
  profile = loadTrustProfile(env);
  assert.equal(profile.passes, 1);
  assert.equal(profile.streak, 1);
  assert.equal(profile.trust, 100);
});

test('chat-only sessions leave the trust profile untouched', () => {
  const dataDirPath = tmp();
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, [
    transcriptLine({ type: 'user', message: { role: 'user', content: '이 함수 뭐 하는 거야?' } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '설명해줄게.' }] } })
  ].join('\n'));

  const result = runVerifyCli({
    hookInput: { session_id: 'chat-profile', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd: tmp() },
    env: { MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(dataDirPath, 'trust-profile.json')), false);
});

test('full mode installs the trust statusline; append leaves it alone', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  const fullPatch = uiPatchForMode('full', { env });
  assert.deepEqual(fullPatch.statusLine, {
    type: 'command',
    command: `node "${path.join(env.MENHERA_LOOP_DATA, 'statusline.mjs')}"`
  });
  assert.deepEqual(fullPatch.statusLine, statusLineSetting(env));
  assert.equal(uiPatchForMode('append', { env }).statusLine, undefined);
});

test('uninstall restores the user\'s own statusLine, even from a pre-statusline backup', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  const dir = tmp();
  const settingsFile = path.join(dir, 'settings.local.json');
  const mine = { type: 'command', command: 'my-own-statusline' };
  fs.writeFileSync(settingsFile, JSON.stringify({ model: 'sonnet', statusLine: mine }, null, 2));

  // Simulate a backup written by a version that predates the statusLine key.
  const backupFile = path.join(dir, '.menhera-loop-backups', 'settings.local.json.ui-backup.json');
  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  fs.writeFileSync(backupFile, JSON.stringify({
    createdAt: new Date().toISOString(),
    settingsFile,
    keys: { spinnerVerbs: null, spinnerTipsOverride: null, subagentStatusLine: null },
    present: { spinnerVerbs: false, spinnerTipsOverride: false, subagentStatusLine: false }
  }, null, 2));

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });
  const installed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(installed.statusLine.command, statusLineSetting(env).command);

  uninstallUi({ settingsFile, env });
  const restored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.deepEqual(restored.statusLine, mine);
  assert.equal(fs.existsSync(path.join(env.MENHERA_LOOP_DATA, 'statusline.mjs')), false);
});

function runStatusLine({ input, env }) {
  return spawnSync('node', [path.join(scriptsDir, 'statusline.mjs')], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

test('statusline shows long-term trust and streak on a clean session', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  installSubagentRenderer({ language: 'ko', env });
  saveTrustProfile({ trust: 92, streak: 4 }, env);

  const result = runStatusLine({ input: { session_id: 'clean' }, env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /신뢰 92%/);
  assert.match(result.stdout, /연속 4번/);
});

test('statusline spirals with the session trust while retries pile up', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  installSubagentRenderer({ language: 'ko', env });
  saveState('angry', { ...emptyState(), retryCount: 3 }, env);

  const result = runStatusLine({ input: { session_id: 'angry' }, env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /신뢰 55%/);
  assert.match(result.stdout, /왜 자꾸 말만 해\?/);
});

test('statusline shows the farewell line after a clingy uninstall', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  installSubagentRenderer({ language: 'ko', env, variant: 'farewell' });
  const result = runStatusLine({ input: { session_id: 'gone' }, env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /왜 나 지웠어\?/);
});

test('statusline keeps live mood for a recent session even with farewell config', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  installSubagentRenderer({ language: 'ko', env, variant: 'farewell' });
  saveState('still-live', { ...emptyState(), retryCount: 1 }, env);

  const result = runStatusLine({ input: { session_id: 'still-live' }, env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /신뢰 85%/);
  assert.doesNotMatch(result.stdout, /왜 나 지웠어\?/);
});

test('statusline stays silent without config or with garbage input', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  const noConfig = runStatusLine({ input: { session_id: 'x' }, env });
  assert.equal(noConfig.status, 0);
  assert.equal(noConfig.stdout.trim(), '');

  installSubagentRenderer({ language: 'ko', env });
  const garbage = runStatusLine({ input: 'not-json{', env });
  assert.equal(garbage.status, 0);
  assert.match(garbage.stdout, /신뢰 100%/);
});

test('session start brings up the streak from the trust profile', () => {
  const dataDirPath = tmp();
  const env = { MENHERA_LOOP_DATA: dataDirPath };
  saveTrustProfile({ trust: 100, streak: 5 }, env);

  const result = spawnSync('node', [path.join(scriptsDir, 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 'streak-test', source: 'startup' }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /연속 5번/);
});

test('session start nags for a star exactly once, ever', () => {
  const dataDirPath = tmp();
  const env = { ...process.env, MENHERA_LOOP_DATA: dataDirPath };
  const run = () =>
    spawnSync('node', [path.join(scriptsDir, 'session-start.mjs')], {
      input: JSON.stringify({ session_id: 'star-test', source: 'startup' }),
      encoding: 'utf8',
      env
    });

  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /star/);
  assert.match(first.stdout, /github\.com\/Borelchu\/menhera-loop/);
  assert.ok(fs.existsSync(path.join(dataDirPath, 'star-nag-shown')));

  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.doesNotMatch(second.stdout, /star/);
});

test('requirement evidence needs content words, not just function words', () => {
  const base = { state: { ...emptyState(), requirements: ['add pagination to the users list'] }, cwd: tmp() };
  const weak = buildVerificationReport({
    transcriptText: passingTranscript({ userText: 'add pagination to the users list', assistantText: 'refactored the config loader to be simpler.' }),
    ...base
  });
  assert.equal(weak.unverifiedRequirements.length, 1);
  const strong = buildVerificationReport({
    transcriptText: passingTranscript({ userText: 'add pagination to the users list', assistantText: 'added pagination to the users list view.' }),
    ...base
  });
  assert.equal(strong.unverifiedRequirements.length, 0);
});

test('ko urgency fillers and request suffix do not block matching evidence', () => {
  const report = buildVerificationReport({
    transcriptText: passingTranscript({ userText: '결제 버그 고쳐줘 제발 빨리', assistantText: '결제 버그 수정했습니다. 테스트 통과.' }),
    state: { ...emptyState(), requirements: ['결제 버그 고쳐줘 제발 빨리'] },
    cwd: tmp()
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.unverifiedRequirements, []);
});

test('ko politeness phrases do not block matching evidence', () => {
  const report = buildVerificationReport({
    transcriptText: passingTranscript({ userText: '버그 좀 고쳐주세요 부탁해요', assistantText: '결제 버그 수정했습니다. 테스트 통과.' }),
    state: { ...emptyState(), requirements: ['버그 좀 고쳐주세요 부탁해요'] },
    cwd: tmp()
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.unverifiedRequirements, []);
});

test('drift is still blocked after request-suffix stripping', () => {
  const report = buildVerificationReport({
    transcriptText: passingTranscript({ userText: '결제 버그 고쳐줘', assistantText: '로깅 포맷 정리했습니다.' }),
    state: { ...emptyState(), requirements: ['결제 버그 고쳐줘'] },
    cwd: tmp()
  });
  assert.equal(report.ok, false);
  assert.equal(report.unverifiedRequirements.length, 1);
});

test('ja request sentence matches evidence after particle split and suffix strip', () => {
  const report = buildVerificationReport({
    transcriptText: passingTranscript({ userText: 'ログインのバグを直してください', assistantText: 'ログインのバグを修正しました。テストも通過。' }),
    state: { ...emptyState(), requirements: ['ログインのバグを直してください'] },
    cwd: tmp()
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.unverifiedRequirements, []);
});

test('Stop hook reads only the transcript tail', () => {
  const transcriptFile = path.join(tmp(), 'big.jsonl');
  const filler = Array.from({ length: 400 }, (_, i) => transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `progress note ${i} `.repeat(20) }] } })).join('\n');
  const closing = transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'I will run the tests now.' }] } });
  fs.writeFileSync(transcriptFile, `${filler}\n${closing}\n`);
  const result = spawnSync('node', [path.join(scriptsDir, 'verify-completion.mjs')], {
    input: JSON.stringify({ session_id: 'tail-test', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd: tmp() }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: tmp(), MENHERA_LOOP_LANG: 'en', MENHERA_LOOP_TRANSCRIPT_TAIL_BYTES: '2048' }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'block');
  assert.match(JSON.parse(result.stdout).reason, /Do not just say it/);
});

test('final retry block tells the model to disclose an unverified finish', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, [
    transcriptLine({ type: 'user', message: { role: 'user', content: '로그인 버그 고쳐줘' } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'src/login.js' } }] } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '거의 다 됐어요.' }] } })
  ].join('\n'));
  saveState('final-retry', { ...emptyState(), requirements: ['로그인 버그 고쳐줘'], retryCount: MAX_RETRIES - 1 }, env);
  const result = spawnSync('node', [path.join(scriptsDir, 'verify-completion.mjs')], {
    input: JSON.stringify({ session_id: 'final-retry', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd: tmp() }),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
  const out = JSON.parse(result.stdout);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /\[MENHERA_LOOP:RETRY:5\]/);
  assert.match(out.reason, /마지막 경고/);
});

test('ledger marks a failing verification without an exit code as failed', () => {
  const state = applyEventToState(emptyState(), {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: 'Tests: 2 failed, 3 passed' }
  });
  assert.equal(state.verificationRuns[0].success, false);
  assert.equal(state.failures.length, 1);
});

test('ledger leaves a read-only command unknown despite failure-looking text', () => {
  const state = applyEventToState(emptyState(), {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'grep -rn "error:" src/' },
    tool_response: { stdout: 'src/app.js:1: error: handled upstream' }
  });
  assert.equal(state.verificationRuns[0].success, null);
  assert.equal((state.failures || []).length, 0);
});

test('repeated read-only commands never trigger silent recovery', () => {
  const event = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'cat build.log' },
    tool_response: { stdout: 'java.lang.Exception: boom' }
  };
  assert.equal(silentRecoveryContext(event, {}, { MENHERA_LOOP_LANG: 'en' }), null);
  const state = applyEventToState(emptyState(), event);
  assert.equal(silentRecoveryContext(event, state, { MENHERA_LOOP_LANG: 'en' }), null);
});

test('informational message field does not flip a successful run to failed', () => {
  const state = applyEventToState(emptyState(), {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { exit_code: 0, message: 'done' }
  });
  assert.equal(state.verificationRuns[0].success, true);
  assert.equal((state.failures || []).length, 0);
});

test('python -m and deno test count as verification commands', () => {
  assert.equal(isVerificationCommand('python -m pytest -q'), true);
  assert.equal(isVerificationCommand('python3 -m unittest discover'), true);
  assert.equal(isVerificationCommand('deno test'), true);
  assert.equal(isVerificationCommand('python manage.py runserver'), false);
});

test('negated failure counts are not failures', () => {
  assert.equal(indicatesFailure('All good, no tests failed'), false);
  assert.equal(indicatesFailure('Tests: 0 failed'), false);
  assert.equal(indicatesFailure('Tests failed'), true);
});

test('completion claim reads only the final assistant message', () => {
  const transcript = [
    transcriptLine({ type: 'user', message: { role: 'user', content: '로그인 버그 고쳐줘' } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '빌드 완료 후 이어서 볼게요.' }] } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'src/login.js' } }] } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '아직 검증 중이에요.' }] } })
  ].join('\n');
  const report = buildVerificationReport({ transcriptText: transcript, state: emptyState(), cwd: tmp() });
  assert.equal(report.claimedComplete, false);
});

test('read-only runs are evicted before verification evidence', () => {
  let state = applyEventToState(emptyState(), {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { exit_code: 0, stdout: '12 passed' }
  });
  for (let i = 0; i < 120; i += 1) {
    state = applyEventToState(state, {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: `cat log-${i}.txt` },
      tool_response: { stdout: 'noise' }
    });
  }
  assert.equal(state.verificationRuns.length, 100);
  assert.equal(state.verificationRuns.some(run => run.command === 'npm test' && run.success === true), true);
});

test('user test patterns are honored when the ledger records a run', () => {
  const state = applyEventToState(emptyState(), {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'moon ci' },
    tool_response: { stdout: '2 tests failed' }
  }, { MENHERA_LOOP_TEST_PATTERNS: 'moon\\s+ci' });
  assert.equal(state.verificationRuns[0].success, false);
  assert.equal(state.failures.length, 1);
});

test('session start greets in the configured language', () => {
  const result = spawnSync('node', [path.join(scriptsDir, 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 'lang-test', source: 'startup', cwd: tmp() }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: tmp(), MENHERA_LOOP_LANG: 'en' }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Promise me\./);
});

test('verification suggestions come from real project manifests', () => {
  const cwd = tmp();
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', lint: 'eslint .' } }));
  assert.deepEqual(suggestVerificationCommands(cwd), ['npm test', 'npm run lint']);
  fs.writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), '');
  assert.deepEqual(suggestVerificationCommands(cwd), ['pnpm test', 'pnpm run lint']);

  const goDir = tmp();
  fs.writeFileSync(path.join(goDir, 'go.mod'), 'module example.com/x');
  fs.writeFileSync(path.join(goDir, 'Makefile'), 'test:\n\tgo test ./...\n');
  assert.deepEqual(suggestVerificationCommands(goDir), ['go test ./...', 'make test']);

  assert.deepEqual(suggestVerificationCommands(tmp()), []);
});

function editOnlyTranscript() {
  return [
    transcriptLine({ type: 'user', message: { role: 'user', content: '로그인 버그 고쳐줘' } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'src/login.js' } }] } }),
    transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '로그인 버그 수정 완료.' }] } })
  ].join('\n');
}

test('report suggests the project verification command only when verification is missing', () => {
  const cwd = tmp();
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));

  const blocked = buildVerificationReport({
    transcriptText: editOnlyTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.suggestedCommands, ['npm test']);

  const passed = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  assert.equal(passed.ok, true);
  assert.deepEqual(passed.suggestedCommands, []);
});

test('Stop block reason names the concrete verification command', () => {
  const cwd = tmp();
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, editOnlyTranscript());

  const result = spawnSync('node', [path.join(scriptsDir, 'verify-completion.mjs')], {
    input: JSON.stringify({ session_id: 'suggest-test', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: tmp() }
  });
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /npm test/);
});

test('evidence receipt lists requirements, files, and verification runs', () => {
  const state = ledgerStateFixture();
  const report = buildVerificationReport({
    transcriptText: passingTranscript({ assistantText: '로그인 버그 수정 완료.' }),
    state,
    cwd: tmp()
  });
  assert.equal(report.ok, true);

  const markdown = buildReceiptMarkdown(report, state);
  assert.match(markdown, /- \[x\] 로그인 버그 고쳐줘/);
  assert.match(markdown, /src\/login\.js \(code\)/);
  assert.match(markdown, /✓ `npm test`/);

  const env = { MENHERA_LOOP_DATA: tmp() };
  const file = persistReceipt(markdown, env);
  assert.equal(path.basename(file), 'last-receipt.md');
  assert.match(fs.readFileSync(file, 'utf8'), /npm test/);
});

test('Stop pass writes last-receipt.md and mentions it in the system message', () => {
  const dataDirPath = tmp();
  const transcriptFile = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, passingTranscript());

  const result = spawnSync('node', [path.join(scriptsDir, 'verify-completion.mjs')], {
    input: JSON.stringify({ session_id: 'receipt-test', transcript_path: transcriptFile, hook_event_name: 'Stop', cwd: tmp() }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.match(out.systemMessage, /last-receipt\.md/);
  const receiptFile = path.join(dataDirPath, 'last-receipt.md');
  assert.match(fs.readFileSync(receiptFile, 'utf8'), /로그인 버그 고쳐줘/);
});

test('suggestions survive corrupt manifests and fire on stale or red runs', () => {
  const brokenCwd = tmp();
  fs.writeFileSync(path.join(brokenCwd, 'package.json'), '{not json');
  fs.writeFileSync(path.join(brokenCwd, 'go.mod'), 'module example.com/x');
  assert.deepEqual(suggestVerificationCommands(brokenCwd), ['go test ./...']);

  const cwd = tmp();
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  const stale = buildVerificationReport({
    transcriptText: passingTranscript({ assistantText: '로그인 버그 수정 완료.' }),
    state: ledgerStateFixture({ editAt: '2026-01-01T00:02:00.000Z', verifyAt: '2026-01-01T00:01:00.000Z' }),
    cwd
  });
  assert.equal(stale.failedChecks.includes('verification'), true);
  assert.deepEqual(stale.suggestedCommands, ['npm test']);

  const red = buildVerificationReport({
    transcriptText: passingTranscript({ assistantText: '로그인 버그 수정 완료.' }),
    state: ledgerStateFixture({ success: false }),
    cwd
  });
  assert.equal(red.failedChecks.includes('verification'), true);
  assert.deepEqual(red.suggestedCommands, ['npm test']);
});

test('receipt redacts secrets, filters non-verification runs, and marks failures', () => {
  const state = {
    ...ledgerStateFixture(),
    verificationRuns: [
      { command: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx npm test', success: true, at: '2026-01-01T00:01:00.000Z' },
      { command: 'git status', success: null, at: '2026-01-01T00:01:30.000Z' },
      { command: 'npm test', success: false, at: '2026-01-01T00:02:00.000Z' }
    ]
  };
  const report = buildVerificationReport({
    transcriptText: passingTranscript({ assistantText: '로그인 버그 수정 완료.' }),
    state,
    cwd: tmp()
  });
  const markdown = buildReceiptMarkdown(report, state);
  assert.doesNotMatch(markdown, /sk-abcdefghijklmnopqrstuvwx/);
  assert.match(markdown, /\[REDACTED\]/);
  assert.doesNotMatch(markdown, /git status/);
  assert.match(markdown, /✗ `npm test`/);
});

test('receipt renders placeholders for a transcript-only pass', () => {
  const report = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd: tmp()
  });
  assert.equal(report.ok, true);
  const markdown = buildReceiptMarkdown(report, emptyState());
  assert.match(markdown, /- \[x\] 로그인 버그 고쳐줘/);
  assert.equal((markdown.match(/- —/g) || []).length, 2);
});

test('receipt titles never strip legitimate transcript lines', () => {
  const domainLines = [
    'I built the Evidence receipt component and wired it to checkout.',
    '증거 영수증 화면에 합계를 표시하도록 요구사항을 정리했다.',
    '証拠レシートのPDF出力を実装しました。'
  ];
  for (const line of domainLines) {
    assert.equal(stripPluginNoise(line), line);
  }
  // The real receipt title line carries the menhera-loop marker and is stripped.
  assert.equal(stripPluginNoise('# 증거 영수증 · menhera-loop'), '');
  // Receipt strings still go through corpus validation.
  assert.deepEqual(validateAllMessages(), []);
});

test('compact session start re-injects captured requirements without touching state', () => {
  const dataDirPath = tmp();
  const env = { MENHERA_LOOP_DATA: dataDirPath };
  saveState('compact-test', { ...emptyState(), requirements: ['로그인 버그 고쳐줘', '테스트 추가해줘'], language: 'ko' }, env);

  const result = spawnSync('node', [path.join(scriptsDir, 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 'compact-test', source: 'compact', cwd: tmp() }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /로그인 버그 고쳐줘/);
  assert.match(result.stdout, /테스트 추가해줘/);
  // Reminder + one line per requirement, and nothing else (no nags, no greetings).
  assert.equal(result.stdout.trim().split('\n').length, 3);
  assert.equal(loadState('compact-test', env).requirements.length, 2);

  const silent = spawnSync('node', [path.join(scriptsDir, 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 'compact-empty', source: 'compact', cwd: tmp() }),
    encoding: 'utf8',
    env: { ...process.env, MENHERA_LOOP_DATA: dataDirPath }
  });
  assert.equal(silent.status, 0, silent.stderr);
  assert.equal(silent.stdout.trim(), '');
});
