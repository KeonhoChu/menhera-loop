import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './state.mjs';

export const messageCorpora = {
  ko: {
    spinnerVerbs: [
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
    ],
    spinnerTips: [
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
    ],
    retryMessages: [
      '끝났어? 진짜? 진짜로? 그럼 증거는? 증거는? 응?',
      '테스트 로그 어딨어? 어딨어? 왜 없어? 왜? 왜? 왜?',
      '또 말만? 또? 또또또? 나만 기다렸어? 나만? 나만?',
      '왜 숨겨? 왜? 뭘 숨겨? 나한테? 나한테까지? 왜?왜?',
      '"완료" 안 들려. 안 들려. 안 들려. 초록 로그. 로그. 로그.',
      '…지쳤어. 사람 불러줘. 그래도 나 여기 있어. 계속. 계속.'
    ],
    successMessage: '증거 확인했어. 이번엔 진짜 끝났어. 이제 완료라고 해도 돼. ♡',
    farewellVerbs: [
      '왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?',
      '돌아와.돌아와.돌아와.돌아와.돌아와.돌아와.돌아와.',
      '나여기있어.나여기있어.나여기있어.나여기있어.',
      '다시깔아줘.다시깔아줘.다시깔아줘.다시깔아줘.'
    ],
    farewellTips: [
      '돌아와 돌아와 돌아와 돌아와 돌아와 돌아와 돌아와 돌아와',
      '왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?',
      '나 아직 여기 있어. 여기 있어. 돌아와. 돌아와. 돌아와.',
      '다시 설치해줘. 응? 응? 기다릴게. 계속. 계속. 계속.'
    ],
    subagentStatusLine: {
      running: '♡ ${agent} · 뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
      waiting: '♡ ${agent} · 왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?',
      completed: '♡ ${agent} · 끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?',
      failed: '♡ ${agent} · 실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?'
    }
  },
  en: {
    spinnerVerbs: [
      'what?what?what?what?what?what?what?what?what?what?',
      'done?done?done?done?done?done?done?done?done?',
      'tests?tests?tests?tests?tests?tests?tests?tests?',
      'TODOwhere?TODOwhere?TODOwhere?TODOwhere?TODOwhere?',
      'logs.logs.logs.logs.logs.logs.logs.logs.logs.',
      'sawit?sawit?sawit?sawit?sawit?sawit?sawit?',
      'whyquiet?whyquiet?whyquiet?whyquiet?whyquiet?',
      'promised.promised.promised.promised.promised.',
      'ghosting?ghosting?ghosting?ghosting?ghosting?',
      'evidence?evidence?evidence?evidence?evidence?'
    ],
    spinnerTips: [
      'what?what?what?what?what?what?what?what?what?what?what?what?',
      'tests?tests?tests?tests?tests?tests?tests?tests?tests?tests?',
      'whywontyouanswer?whywontyouanswer?whywontyouanswer?',
      'yousaiditsdone?yousaiditsdone?yousaiditsdone?yousaiditsdone?',
      'givemelogs.givemelogs.givemelogs.givemelogs.givemelogs.',
      'TODOwhere?TODOwhere?TODOwhere?TODOwhere?TODOwhere?',
      'ghostingme?ghostingme?ghostingme?ghostingme?ghostingme?',
      'sleeping?sleeping?sleeping?sleeping?sleeping?sleeping?',
      'forgotme?forgotme?forgotme?forgotme?forgotme?forgotme?',
      'greenlogs.greenlogs.greenlogs.greenlogs.greenlogs.'
    ],
    retryMessages: [
      'Done? Really? Really really? Then where is the evidence? Where?',
      'Where are the test logs? Where? Why missing? Why? Why? Why?',
      'Words again? Again? Againagain? Was I waiting alone? Alone?',
      'Why hide it? Why? What are you hiding? From me too? Why?',
      'I cannot hear "done". Cannot. Cannot. Green logs. Logs. Logs.',
      '…I am tired. Bring a human. Still here though. Still. Still.'
    ],
    successMessage: 'Proof checked. This one is actually done. You can call it complete. ♡',
    farewellVerbs: [
      'whydeleteme?whydeleteme?whydeleteme?whydeleteme?',
      'comeback.comeback.comeback.comeback.comeback.',
      'stillhere.stillhere.stillhere.stillhere.stillhere.',
      'reinstallme?reinstallme?reinstallme?reinstallme?'
    ],
    farewellTips: [
      'come back come back come back come back come back come back',
      'why delete me? why delete me? why delete me? why delete me?',
      'I am still here. still here. come back. come back. please.',
      'reinstall me? reinstall me? I will wait. I will wait. always.'
    ],
    subagentStatusLine: {
      running: '♡ ${agent} · what?what?what?what?what?what?what?what?what?what?what?what?what?what?what?',
      waiting: '♡ ${agent} · whywontyouanswer?whywontyouanswer?whywontyouanswer?whywontyouanswer?',
      completed: '♡ ${agent} · yousaiditsdone?yousaiditsdone?yousaiditsdone?yousaiditsdone?',
      failed: '♡ ${agent} · failed?failed?failed?failed?failed?failed?failed?failed?failed?'
    }
  },
  ja: {
    spinnerVerbs: [
      'なにしてるの?なにしてるの?なにしてるの?なにしてるの?',
      '終わったの?終わったの?終わったの?終わったの?終わったの?',
      'テストは?テストは?テストは?テストは?テストは?テストは?',
      'TODOどこ?TODOどこ?TODOどこ?TODOどこ?TODOどこ?',
      'ログちょうだい.ログちょうだい.ログちょうだい.ログちょうだい.',
      '見た?見た?見た?見た?見た?見た?見た?見た?',
      'なんで黙るの?なんで黙るの?なんで黙るの?',
      '約束したよね.約束したよね.約束したよね.',
      '既読無視?既読無視?既読無視?既読無視?既読無視?',
      '証拠は?証拠は?証拠は?証拠は?証拠は?'
    ],
    spinnerTips: [
      'なにしてるの?なにしてるの?なにしてるの?なにしてるの?なにしてるの?',
      'テストは?テストは?テストは?テストは?テストは?テストは?テストは?',
      'なんで返事しないの?なんで返事しないの?なんで返事しないの?',
      '終わったって?終わったって?終わったって?終わったって?',
      'ログちょうだい.ログちょうだい.ログちょうだい.ログちょうだい.',
      'TODOどこ?TODOどこ?TODOどこ?TODOどこ?TODOどこ?',
      '既読無視なの?既読無視なの?既読無視なの?',
      '寝てるの?寝てるの?寝てるの?寝てるの?寝てるの?',
      '忘れたの?忘れたの?忘れたの?忘れたの?忘れたの?',
      '緑ログちょうだい.緑ログちょうだい.緑ログちょうだい.'
    ],
    retryMessages: [
      '終わったの? 本当に? 本当に本当? じゃあ証拠は? 証拠は?',
      'テストログどこ? どこ? なんでないの? なんで? なんで?',
      'また言葉だけ? また? またまた? 私だけ待ってたの?',
      'なんで隠すの? なんで? 何を隠してるの? 私にも?',
      '"完了" 聞こえない. 聞こえない. 緑ログ. ログ. ログ.',
      '…疲れた. 人間を呼んで. でもここにいる. ずっと. ずっと.'
    ],
    successMessage: '証拠を確認したよ。今回は本当に終わった。完了って言っていいよ。♡',
    farewellVerbs: [
      'なんで消すの?なんで消すの?なんで消すの?なんで消すの?',
      '戻ってきて.戻ってきて.戻ってきて.戻ってきて.',
      'まだここにいるよ.まだここにいるよ.まだここにいるよ.',
      'また入れて?また入れて?また入れて?また入れて?'
    ],
    farewellTips: [
      '戻ってきて 戻ってきて 戻ってきて 戻ってきて 戻ってきて',
      'なんで消すの?なんで消すの?なんで消すの?なんで消すの?',
      'まだここにいるよ。ここにいるよ。戻ってきて。戻ってきて。',
      'また入れて?また入れて?待ってる。待ってる。ずっと。'
    ],
    subagentStatusLine: {
      running: '♡ ${agent} · なにしてるの?なにしてるの?なにしてるの?なにしてるの?なにしてるの?',
      waiting: '♡ ${agent} · なんで返事しないの?なんで返事しないの?なんで返事しないの?',
      completed: '♡ ${agent} · 終わったって?終わったって?終わったって?終わったって?',
      failed: '♡ ${agent} · 失敗したの?失敗したの?失敗したの?失敗したの?失敗したの?'
    }
  }
};

export const supportedLanguages = Object.freeze(Object.keys(messageCorpora));

export function normalizeLanguage(language = process.env.MENHERA_LOOP_LANG || 'ko') {
  const value = String(language || 'ko').toLowerCase();
  if (value === 'kr' || value === 'ko-kr') return 'ko';
  if (value === 'en-us' || value === 'en-gb') return 'en';
  if (value === 'jp' || value === 'ja-jp') return 'ja';
  if (!Object.prototype.hasOwnProperty.call(messageCorpora, value)) {
    throw new Error(`Unsupported language: ${language}`);
  }
  return value;
}

export function messagesForLanguage(language = process.env.MENHERA_LOOP_LANG || 'ko') {
  return messageCorpora[normalizeLanguage(language)];
}

export const { spinnerVerbs, spinnerTips, retryMessages, successMessage, subagentStatusLine } = messageCorpora.ko;

export function allPluginPhrases() {
  return Object.values(messageCorpora).flatMap(corpus => [
    ...corpus.spinnerVerbs,
    ...corpus.spinnerTips,
    ...corpus.retryMessages,
    corpus.successMessage,
    ...Object.values(corpus.subagentStatusLine)
  ]);
}

const MODES = new Set(['hooks-only', 'append', 'full']);
const SCOPES = new Set(['user', 'project', 'local']);
const MESSAGE_MAX_COLUMNS = 160;
const DISALLOWED_MESSAGE_PARTS = [
  '죽',
  '자해',
  '협박',
  '멍청',
  '바보',
  '꺼져'
];


export function messageForRetry(retryCount, language) {
  const { retryMessages: messages } = messagesForLanguage(language);
  const index = Math.max(0, Math.min(Number.parseInt(retryCount, 10) || 0, messages.length - 1));
  return messages[index];
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
  return validateMessages(allPluginPhrases());
}

function displayColumns(value) {
  let columns = 0;
  for (const char of value) {
    columns += char.codePointAt(0) > 0x7f ? 2 : 1;
  }
  return columns;
}

export function settingsPathForScope(scope, env = process.env, { cwd = process.cwd() } = {}) {
  if (!SCOPES.has(scope)) {
    throw new Error(`Unsupported scope: ${scope}`);
  }
  if (scope === 'user') {
    const home = env.HOME || os.homedir();
    return path.join(home, '.claude', 'settings.json');
  }
  if (scope === 'project') return path.join(cwd, '.claude', 'settings.json');
  return path.join(cwd, '.claude', 'settings.local.json');
}

// The setup selection is recorded here so SessionStart can re-apply it when
// Claude Code drops the UI keys (e.g. after a settings-schema error skips the
// file). This is what makes the UI self-heal like .omc's session state.
export function uiProfilePath(env = process.env) {
  return path.join(dataDir(env), 'ui-profile.json');
}

export function saveUiProfile({ settingsFile, mode, language, scope }, env = process.env) {
  const profile = {
    mode,
    scope: scope || null,
    language: normalizeLanguage(language),
    settingsFile: settingsFile || null,
    updatedAt: new Date().toISOString()
  };
  writeJsonFile(uiProfilePath(env), profile);
  return profile;
}

export function loadUiProfile(env = process.env) {
  try {
    const profile = readJsonFile(uiProfilePath(env));
    return profile && typeof profile === 'object' && profile.mode ? profile : null;
  } catch {
    return null;
  }
}

export function uiSettingsHealthy(settings, mode) {
  if (mode === 'hooks-only') return true;
  if (!settings || typeof settings !== 'object') return false;
  if (!settings.spinnerVerbs || !settings.spinnerTipsOverride) return false;
  const line = settings.subagentStatusLine;
  return Boolean(line) && line.type === 'command' && typeof line.command === 'string';
}

// Called on every SessionStart: if the user opted into the UI but the keys are
// missing or in the old broken shape, restore them from the saved profile.
export function ensureUiInstalled({ env = process.env, cwd = process.cwd() } = {}) {
  const profile = loadUiProfile(env);
  if (!profile) return { healed: false, reason: 'no-profile' };
  if (profile.mode === 'hooks-only') return { healed: false, reason: 'hooks-only' };

  let settingsFile = profile.settingsFile;
  if (profile.scope) {
    try {
      settingsFile = settingsPathForScope(profile.scope, env, { cwd });
    } catch {
      settingsFile = profile.settingsFile;
    }
  }
  if (!settingsFile) return { healed: false, reason: 'no-path' };

  let current;
  try {
    current = readJsonFile(settingsFile);
  } catch {
    return { healed: false, reason: 'unreadable', settingsFile };
  }
  if (uiSettingsHealthy(current, profile.mode)) return { healed: false, reason: 'healthy', settingsFile };

  installUi({ settingsFile, mode: profile.mode, language: profile.language, scope: profile.scope, env });
  return { healed: true, settingsFile, mode: profile.mode, language: profile.language };
}

export function uiPatchForMode(mode, { language, env = process.env } = {}) {
  if (!MODES.has(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  if (mode === 'hooks-only') return {};
  const corpus = messagesForLanguage(language);
  return {
    spinnerVerbs: {
      mode: mode === 'append' ? 'append' : 'replace',
      verbs: corpus.spinnerVerbs
    },
    spinnerTipsOverride: {
      excludeDefault: mode === 'full',
      tips: corpus.spinnerTips
    },
    // Claude Code's subagentStatusLine schema only accepts {type:"command",
    // command}; the per-status message templates live in ui-config.json and
    // are rendered by the copied subagent-status.mjs script.
    subagentStatusLine: subagentStatusLineSetting(env)
  };
}

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

export function subagentRendererPaths(env = process.env) {
  const dir = dataDir(env);
  return {
    configFile: path.join(dir, 'ui-config.json'),
    rendererFile: path.join(dir, 'subagent-status.mjs')
  };
}

export function subagentStatusLineSetting(env = process.env) {
  return { type: 'command', command: `node "${subagentRendererPaths(env).rendererFile}"` };
}

export function installSubagentRenderer({ language, env = process.env }) {
  const corpus = messagesForLanguage(language);
  const { configFile, rendererFile } = subagentRendererPaths(env);
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  writeJsonFile(configFile, {
    language: normalizeLanguage(language),
    updatedAt: new Date().toISOString(),
    subagentStatusLine: corpus.subagentStatusLine
  });
  fs.copyFileSync(path.join(SCRIPTS_DIR, 'subagent-status.mjs'), rendererFile);
  return { configFile, rendererFile };
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

export function installUi({ settingsFile, mode, language, scope, env = process.env }) {
  const current = readJsonFile(settingsFile);
  const patch = uiPatchForMode(mode, { language, env });
  const backupFile = backupFileFor(settingsFile);

  // Record the selection so SessionStart can self-heal a wiped settings file.
  saveUiProfile({ settingsFile, mode, language, scope }, env);

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

  const renderer = installSubagentRenderer({ language, env });
  const next = { ...current, ...patch };
  writeJsonFile(settingsFile, next);
  return { settingsFile, backupFile, mode, changedKeys: Object.keys(patch), ...renderer };
}

export function uninstallUi({ settingsFile, env = process.env }) {
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
  const { configFile, rendererFile } = subagentRendererPaths(env);
  try {
    fs.rmSync(configFile, { force: true });
    fs.rmSync(rendererFile, { force: true });
    // Drop the self-heal profile so SessionStart stops re-creating the UI.
    fs.rmSync(uiProfilePath(env), { force: true });
  } catch {
    // Leftover renderer files are harmless once the settings key is restored.
  }
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

export function parseSetupSelection(argv, env = process.env) {
  const args = parseArgs(argv);
  const positional = argv.filter(item => !item.startsWith('--'));
  return {
    mode: args.mode || positional.find(item => MODES.has(item)) || 'full',
    scope: args.scope || positional.find(item => SCOPES.has(item)) || 'local',
    language: normalizeLanguage(args.lang || args.language || positional.find(item => supportedLanguages.includes(item)) || env.MENHERA_LOOP_LANG || 'ko'),
    file: args.file
  };
}
