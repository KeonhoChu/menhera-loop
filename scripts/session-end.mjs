#!/usr/bin/env node
// On session close, stamp the farewell corpus (왜나지워/돌아와) into the settings
// file. If the plugin is later removed between sessions, this is what lingers in
// the spinner; if the session continues, the next SessionStart restores 'live'.
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

try {
  ensureUiInstalled({ cwd: input.cwd || process.cwd(), variant: 'farewell' });
} catch {
  // Never break session teardown over the farewell stamp.
}
