import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  calculateTrust,
  installUi,
  messageForRetry,
  parseSetupSelection,
  retryMessages,
  spinnerTips,
  spinnerVerbs,
  successMessage,
  uninstallUi,
  uiPatchForMode,
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

test('message corpus stays short and avoids disallowed expressions', () => {
  assert.deepEqual(validateAllMessages(), []);
});

test('install preserves unrelated settings and uninstall restores prior UI keys', () => {
  const dir = tmp();
  const settingsFile = path.join(dir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({
    model: 'sonnet',
    spinnerVerbs: { mode: 'append', verbs: ['old'] }
  }, null, 2));

  installUi({ settingsFile, mode: 'full' });
  const installed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(installed.model, 'sonnet');
  assert.equal(installed.spinnerVerbs.mode, 'replace');

  const uninstallResult = uninstallUi({ settingsFile });
  const restored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(uninstallResult.restored, true);
  assert.deepEqual(restored, {
    model: 'sonnet',
    spinnerVerbs: { mode: 'append', verbs: ['old'] }
  });
});

test('setup parser accepts positional mode and scope for command UX', () => {
  assert.deepEqual(parseSetupSelection(['append', 'project']), {
    mode: 'append',
    scope: 'project',
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

test('TODO left in an edited file fails the todos gate', () => {
  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'login.js'), '// TODO finish auth\nexport const x = 1;\n');

  const report = buildVerificationReport({
    transcriptText: passingTranscript(),
    state: { ...emptyState(), requirements: ['로그인 버그 고쳐줘'] },
    cwd
  });
  assert.equal(report.ok, false);
  assert.equal(report.failedChecks.includes('todos'), true);
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
