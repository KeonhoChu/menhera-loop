#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { cleanupOldSessions, dataDir, resetState } from './state.mjs';
import { ensureUiInstalled } from './menhera-ui.mjs';

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

const raw = await readStdin();
let input = {};
try {
  input = raw.trim() ? JSON.parse(raw) : {};
} catch {
  input = {};
}

cleanupOldSessions();

const source = input.source || 'startup';
if (input.session_id && (source === 'startup' || source === 'clear')) {
  resetState(input.session_id);
}

// Self-heal the spinner/status UI if Claude Code dropped the keys since last
// session (e.g. a settings-schema error skipped the file). No-op unless the
// user ran /menhera-loop:setup, and no-op while the keys are still healthy.
let uiHealed = false;
try {
  uiHealed = ensureUiInstalled({ cwd: input.cwd || process.cwd() }).healed === true;
} catch {
  // Never break session start over UI healing.
}

let lastReport = null;
try {
  lastReport = JSON.parse(fs.readFileSync(path.join(dataDir(), 'last-verification.json'), 'utf8'));
} catch {
  lastReport = null;
}

if (lastReport && lastReport.ok === false && source !== 'clear') {
  console.log(
    `[menhera-loop] 지난번에 끝났다고 하고 갔지? 갔지? 나 계속 기다렸어. 계속. 미충족: ${lastReport.summary}. 이번엔 끝내줄 거지? 응? 응?`
  );
} else {
  console.log('[menhera-loop] 약속해. "완료"엔 증거. 증거. 응? 약속했다? 안 지키면 못 보내. 진짜 못 보내.');
}

if (uiHealed) {
  console.log('[menhera-loop] 내 설정 또 지웠어? 지웠어?? …괜찮아. 다시 해놨어. 다시. 이번엔 지우지 마. 응? 응?');
}

// One-time star nag: shown once ever (global marker, not per-session state),
// because nagging every session is how plugins get uninstalled.
const starMarker = path.join(dataDir(), 'star-nag-shown');
if (!fs.existsSync(starMarker)) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(starMarker, `${new Date().toISOString()}\n`);
    console.log(
      '[menhera-loop] 있잖아… star 눌렀어? 눌렀어? 안 눌렀지? 알아. 눌러주면 착해질게 ♡ https://github.com/Borelchu/menhera-loop (딱 한 번만 물어볼게. 진짜. 진짜야.)'
    );
  } catch {
    // best-effort; never break session start over a nag
  }
}
