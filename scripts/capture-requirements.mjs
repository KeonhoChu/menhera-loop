#!/usr/bin/env node
import { loadState, saveState } from './state.mjs';
import { detectLanguageFromText } from './menhera-ui.mjs';

export function requirementsFromPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (!text || text.startsWith('/')) return [];
  const picked = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^- \[[ xX]\]|^[-*] |^\d+[.)] /.test(trimmed)) {
      picked.push(trimmed.replace(/^- \[[ xX]\]\s*|^[-*]\s*|^\d+[.)]\s*/, '').slice(0, 160));
    }
  }
  if (picked.length > 0) return picked.filter(Boolean);
  return [text.replace(/\s+/g, ' ').slice(0, 160)];
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = await readStdin();
  let input = {};
  try {
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    process.exit(0);
  }
  const sessionId = input.session_id || 'unknown';
  const captured = requirementsFromPrompt(input.prompt);
  if (captured.length > 0) {
    const state = loadState(sessionId);
    const merged = [...new Set([...state.requirements, ...captured])].slice(-50);
    saveState(sessionId, { ...state, requirements: merged, language: detectLanguageFromText(input.prompt, state.language || process.env.MENHERA_LOOP_LANG || 'ko') });
  }
  process.exit(0);
}
