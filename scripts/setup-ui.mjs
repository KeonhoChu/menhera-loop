#!/usr/bin/env node
import { installUi, parseSetupSelection, settingsPathForScope } from './menhera-ui.mjs';

const selection = parseSetupSelection(process.argv.slice(2));
const settingsFile = selection.file || settingsPathForScope(selection.scope);

const result = installUi({ settingsFile, mode: selection.mode, language: selection.language, scope: selection.scope });
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
