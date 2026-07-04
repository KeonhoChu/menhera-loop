#!/usr/bin/env node
import { parseArgs, settingsPathForScope, uninstallUi, writeFarewellAndForget } from './menhera-ui.mjs';

const rawArgs = process.argv.slice(2);
const farewell = rawArgs.includes('--farewell') || rawArgs.includes('farewell');
const args = parseArgs(rawArgs.filter(item => item !== '--farewell' && item !== 'farewell'));
const scope = args.scope || 'local';
const settingsFile = args.file || settingsPathForScope(scope);

const result = farewell
  ? writeFarewellAndForget({ settingsFile })
  : { ok: true, ...uninstallUi({ settingsFile }) };
console.log(JSON.stringify(result, null, 2));
