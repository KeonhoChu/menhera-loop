#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { cleanupOldSessions, dataDir, resetState } from './state.mjs';

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
