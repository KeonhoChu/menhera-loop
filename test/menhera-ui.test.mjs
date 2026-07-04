import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  calculateTrust,
  ensureUiInstalled,
  installSubagentRenderer,
  installUi,
  loadUiProfile,
  messageForRetry,
  messagesForLanguage,
  normalizeLanguage,
  parseSetupSelection,
  retryMessages,
  spinnerTips,
  spinnerVerbs,
  subagentStatusLine,
  successMessage,
  uninstallUi,
  uiPatchForMode,
  supportedLanguages,
  validateAllMessages
} from '../scripts/menhera-ui.mjs';

import {
  buildVerificationReport,
  extractRequirements,
  indicatesFailure,
  parseTranscript
} from '../scripts/verify-completion.mjs';

import { emptyState, loadState, saveState, MAX_RETRIES } from '../scripts/state.mjs';

import { requirementsFromPrompt } from '../scripts/capture-requirements.mjs';

const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

function tmp(prefix = 'menhera-loop-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function transcriptLine(entry) {
  return JSON.stringify(entry);
}

function passingTranscript({ editedFile = 'src/login.js', testOutput = '12 passed, 0 failed' } = {}) {
  return [
    transcriptLine({ type: 'user', message: { role: 'user', content: '로그인 버그 고쳐줘' } }),
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
        content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm test' } }]
      }
    }),
    transcriptLine({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't2', is_error: false, content: testOutput }]
      }
    }),
    transcriptLine({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '로그인 버그 수정 완료. 테스트 12개 통과했어요.' }]
      }
    })
  ].join('\n');
}

test('retry messages escalate and clamp to the exhausted stage', () => {
  assert.equal(messageForRetry(0), retryMessages[0]);
  assert.equal(messageForRetry(99), retryMessages[retryMessages.length - 1]);
  assert.equal(messageForRetry(-1), retryMessages[0]);
  assert.equal(retryMessages.length, 6);
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
    assert.equal(report.retryMessage, '…done. actually done. it was real. thank god… you will come back tomorrow, right? right? ♡');
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
  assert.equal(result.healed, true);
  const restored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(restored.model, 'sonnet');
  assert.equal(restored.spinnerVerbs.mode, 'replace');
  assert.equal(restored.subagentStatusLine.type, 'command');
});

test('ensureUiInstalled is a no-op when settings are already healthy', () => {
  const dir = tmp();
  const env = { MENHERA_LOOP_DATA: tmp() };
  const settingsFile = path.join(dir, '.claude', 'settings.local.json');

  installUi({ settingsFile, mode: 'full', language: 'ko', scope: 'local', env });
  assert.equal(ensureUiInstalled({ env, cwd: dir }).healed, false);
});

test('ensureUiInstalled does nothing without a saved profile', () => {
  const env = { MENHERA_LOOP_DATA: tmp() };
  assert.equal(ensureUiInstalled({ env, cwd: tmp() }).healed, false);
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
  assert.equal(result.healed, true);
  const fixed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(fixed.subagentStatusLine.type, 'command');
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

test('setup parser accepts positional mode and scope for command UX', () => {
  assert.deepEqual(parseSetupSelection(['append', 'project']), {
    mode: 'append',
    scope: 'project',
    language: 'ko',
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

test('prompt capture extracts list items or falls back to the prompt itself', () => {
  assert.deepEqual(requirementsFromPrompt('- [ ] 테스트 추가\n- [ ] 문서 갱신'), ['테스트 추가', '문서 갱신']);
  assert.deepEqual(requirementsFromPrompt('로그인 버그 고쳐줘'), ['로그인 버그 고쳐줘']);
  assert.deepEqual(requirementsFromPrompt('/menhera-loop:setup full local'), []);
});

test('transcript parser extracts edits, commands, and paired results', () => {
  const transcript = parseTranscript(passingTranscript());
  assert.deepEqual(transcript.editedFiles, ['src/login.js']);
  assert.equal(transcript.bashRuns.length, 1);
  assert.equal(transcript.bashRuns[0].command, 'npm test');
  assert.equal(transcript.bashRuns[0].isError, false);
  assert.match(transcript.bashRuns[0].output, /12 passed/);
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

test('mixed pass/fail output is treated as a failed verification', () => {
  assert.equal(indicatesFailure('3 passed, 1 failed'), true);
  assert.equal(indicatesFailure('12 passed, 0 failed'), false);
  assert.equal(indicatesFailure('token lookup ok'), false);

  const report = buildVerificationReport({
    transcriptText: passingTranscript({ testOutput: '3 passed, 1 failed' }),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd: tmp()
  });
  assert.equal(report.ok, false);
  assert.equal(report.failedChecks.includes('verification'), true);
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
