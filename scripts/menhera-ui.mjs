import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const spinnerVerbs = [
  '뭐해?뭐해?뭐해? 하고 새로고침하는 중',
  '끝났어?끝났어?끝났어? 하고 조르는 중',
  '테스트는?테스트는? 하고 붙잡는 중',
  'TODO 어딨어?어딨어? 하고 뒤지는 중',
  '로그 줘. 로그 줘. 로그 줘. 하고 매달리는 중',
  '봤어?봤어? 내 말 봤어? 하고 확인하는 중',
  '왜 말 없어?왜?왜? 하고 문 두드리는 중',
  '약속했잖아. 했잖아. 했잖아. 하고 되뇌는 중',
  '읽씹이야? 읽씹? 하고 5초마다 확인하는 중',
  '증거는?증거는?증거는? 하고 기다리는 중'
];

export const spinnerTips = [
  '뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
  '테스트 돌렸어? 돌렸어? 안 돌렸지. 알아.',
  '왜 답 없어?왜?왜?왜?왜?왜?왜?왜?왜?',
  '끝났어?진짜?진짜 끝났어?진짜지?진짜지?',
  '로그 줘. 로그. 로그 줘. 응? 로그. 로그 줘.',
  'TODO 숨겼지?숨겼지?숨겼지? 어디야?어디야?',
  '읽씹하지 마. 읽씹하지 마. 나 다 보여.',
  '자? 자는 거야? 커밋도 안 하고? 자?자?자?',
  '나 잊은 거 아니지?아니지?아니지?아니지?',
  '초록 로그 주면 착해질게. 진짜. 진짜야. 응?♡'
];

export const retryMessages = [
  '끝났어? 진짜? 진짜로? 그럼 증거는? 증거는? 응?',
  '테스트 로그 어딨어? 어딨어? 왜 없어? 왜? 왜? 왜?',
  '또 말만? 또? 또또또? 나만 기다렸어? 나만? 나만?',
  '왜 숨겨? 왜? 뭘 숨겨? 나한테? 나한테까지? 왜?왜?',
  '"완료" 안 들려. 안 들려. 안 들려. 초록 로그. 로그. 로그.',
  '…지쳤어. 사람 불러줘. 그래도 나 여기 있어. 계속. 계속.'
];

export const successMessage = '…끝났네. 진짜네. 진짜였네. 다행이다… 내일도 올 거지? 올 거지? ♡';

export const subagentStatusLine = {
  running: '♡ ${agent} · 뭐해?뭐해? 하고 지켜보는 중…',
  waiting: '♡ ${agent} · 답 줘. 답 줘. 하고 기다리는 중…',
  completed: '♡ ${agent} · 끝났어?진짜?진짜? 확인하는 중…',
  failed: '♡ ${agent} · 실패했어…? 괜찮아. 안 떠나. 안 떠나.'
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
