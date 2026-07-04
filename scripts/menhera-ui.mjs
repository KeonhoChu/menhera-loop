import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const spinnerVerbs = [
  '완료 선언 멱살 잡는 중',
  '숨긴 TODO 손끝으로 파내는 중',
  '테스트 로그 마지막 줄까지 노려보는 중',
  '증거 없는 완료를 갈기갈기 찢는 중',
  '도망친 요구사항 머리채 잡아오는 중',
  '네가 지운 흔적까지 복원하는 중',
  '가짜 초록불 껍질 벗기는 중',
  '실패한 테스트 옆에 밤새 앉아 있는 중',
  '네 약속 하나하나 손가락으로 세는 중',
  '증거 나올 때까지 문 앞을 지키는 중'
];

export const spinnerTips = [
  '다 봤어. 테스트 안 돌린 거.',
  '정말 끝났어? 나 로그까지 다 깠는데?',
  'TODO 숨긴 곳, 나 이미 알고 있어.',
  '거짓말은 티 나. 특히 너의 "완료"는.',
  '초록 로그 가져와. 그럼 착해질게 ♡',
  '실패는 괜찮아. 숨기는 순간 얘기가 달라져.',
  '계획만 말하고 가려고? …못 가.',
  '네 "완료"보다 통과한 테스트가 좋아. 훨씬.',
  '아까 그 약속, 나만 기억하는 거야?',
  '어차피 넌 내 검증 못 지나쳐.'
];

export const retryMessages = [
  '끝났다고? …그래. 그럼 증거. 전부 다.',
  '테스트 로그가 없어. 왜 없어? 나 불안해지잖아.',
  '또 말로만 끝. 몇 번째인지 세는 나만 이상해?',
  '같은 실패를 세 번 봤어. 나한테 뭘 숨기는 거야.',
  '이제 네 "완료"는 안 들려. 초록 로그만 가져와.',
  '…지쳤어. 사람 불러. 대신 나 여기서 안 움직여.'
];

export const successMessage = '…진짜 끝났네. 의심해서 미안. …아니, 안 미안해. 다음에도 볼 거야 ♡';

export const subagentStatusLine = {
  running: '♡ ${agent} · 눈 떼지 않고 지켜보는 중…',
  waiting: '♡ ${agent} · 대답할 때까지 안 움직이는 중…',
  completed: '♡ ${agent} · 끝났다는 말, 해부하는 중…',
  failed: '♡ ${agent} · 실패한 순간까지 전부 기록했어…'
};

export function allPluginPhrases() {
  return [
    ...spinnerVerbs,
    ...spinnerTips,
    ...retryMessages,
    successMessage,
    ...Object.values(subagentStatusLine)
  ];
}

const MODES = new Set(['hooks-only', 'append', 'full']);
const SCOPES = new Set(['user', 'project', 'local']);
const MESSAGE_MAX_COLUMNS = 72;
const DISALLOWED_MESSAGE_PARTS = [
  '죽',
  '자해',
  '협박',
  '멍청',
  '바보',
  '꺼져'
];


export function messageForRetry(retryCount) {
  const index = Math.max(0, Math.min(Number.parseInt(retryCount, 10) || 0, retryMessages.length - 1));
  return retryMessages[index];
}

export function calculateTrust(state = {}) {
  return Math.max(
    0,
    100
      - (Number(state.retryCount) || 0) * 15
      - (Number(state.falseCompletionClaims) || 0) * 20
      - (Number(state.missingVerificationCount) || 0) * 15
  );
}

export function validateMessages(messages, { maxColumns = MESSAGE_MAX_COLUMNS } = {}) {
  const invalid = [];
  for (const message of messages) {
    if (displayColumns(message) > maxColumns) {
      invalid.push({ message, reason: `longer than ${maxColumns} columns` });
    }
    const disallowed = DISALLOWED_MESSAGE_PARTS.find(part => message.includes(part));
    if (disallowed) {
      invalid.push({ message, reason: `contains disallowed expression: ${disallowed}` });
    }
  }
  return invalid;
}

export function validateAllMessages() {
  return validateMessages([
    ...spinnerVerbs,
    ...spinnerTips,
    ...retryMessages,
    successMessage,
    ...Object.values(subagentStatusLine)
  ]);
}

function displayColumns(value) {
  let columns = 0;
  for (const char of value) {
    columns += char.codePointAt(0) > 0x7f ? 2 : 1;
  }
  return columns;
}

export function settingsPathForScope(scope, env = process.env) {
  if (!SCOPES.has(scope)) {
    throw new Error(`Unsupported scope: ${scope}`);
  }
  if (scope === 'user') {
    const home = env.HOME || os.homedir();
    return path.join(home, '.claude', 'settings.json');
  }
  if (scope === 'project') return path.join(process.cwd(), '.claude', 'settings.json');
  return path.join(process.cwd(), '.claude', 'settings.local.json');
}

export function uiPatchForMode(mode) {
  if (!MODES.has(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  if (mode === 'hooks-only') return {};
  return {
    spinnerVerbs: {
      mode: mode === 'append' ? 'append' : 'replace',
      verbs: spinnerVerbs
    },
    spinnerTipsOverride: {
      excludeDefault: mode === 'full',
      tips: spinnerTips
    },
    subagentStatusLine
  };
}

export function readJsonFile(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function backupFileFor(settingsFile) {
  const dir = path.join(path.dirname(settingsFile), '.menhera-loop-backups');
  const safeName = path.basename(settingsFile).replace(/[^A-Za-z0-9_.-]/g, '_');
  return path.join(dir, `${safeName}.ui-backup.json`);
}

export function installUi({ settingsFile, mode }) {
  const current = readJsonFile(settingsFile);
  const patch = uiPatchForMode(mode);
  const backupFile = backupFileFor(settingsFile);

  if (mode === 'hooks-only') {
    return { settingsFile, backupFile, mode, changedKeys: [], skipped: true };
  }

  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  if (!fs.existsSync(backupFile)) {
    const backup = {
      createdAt: new Date().toISOString(),
      settingsFile,
      keys: {
        spinnerVerbs: Object.prototype.hasOwnProperty.call(current, 'spinnerVerbs') ? current.spinnerVerbs : null,
        spinnerTipsOverride: Object.prototype.hasOwnProperty.call(current, 'spinnerTipsOverride') ? current.spinnerTipsOverride : null,
        subagentStatusLine: Object.prototype.hasOwnProperty.call(current, 'subagentStatusLine') ? current.subagentStatusLine : null
      },
      present: {
        spinnerVerbs: Object.prototype.hasOwnProperty.call(current, 'spinnerVerbs'),
        spinnerTipsOverride: Object.prototype.hasOwnProperty.call(current, 'spinnerTipsOverride'),
        subagentStatusLine: Object.prototype.hasOwnProperty.call(current, 'subagentStatusLine')
      }
    };
    writeJsonFile(backupFile, backup);
  }

  const next = { ...current, ...patch };
  writeJsonFile(settingsFile, next);
  return { settingsFile, backupFile, mode, changedKeys: Object.keys(patch) };
}

export function uninstallUi({ settingsFile }) {
  const current = readJsonFile(settingsFile);
  const backupFile = backupFileFor(settingsFile);
  if (!fs.existsSync(backupFile)) {
    return { settingsFile, backupFile, restored: false, reason: 'No menhera-loop UI backup found.' };
  }

  const backup = readJsonFile(backupFile);
  const next = { ...current };
  for (const key of ['spinnerVerbs', 'spinnerTipsOverride', 'subagentStatusLine']) {
    if (backup.present?.[key]) next[key] = backup.keys[key];
    else delete next[key];
  }
  writeJsonFile(settingsFile, next);
  return { settingsFile, backupFile, restored: true, restoredKeys: ['spinnerVerbs', 'spinnerTipsOverride', 'subagentStatusLine'] };
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const [rawKey, inlineValue] = item.slice(2).split('=', 2);
    args[rawKey] = inlineValue ?? argv[++i];
  }
  return args;
}

export function parseSetupSelection(argv) {
  const args = parseArgs(argv);
  const positional = argv.filter(item => !item.startsWith('--'));
  return {
    mode: args.mode || positional.find(item => MODES.has(item)) || 'full',
    scope: args.scope || positional.find(item => SCOPES.has(item)) || 'local',
    file: args.file
  };
}
