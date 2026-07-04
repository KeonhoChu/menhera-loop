import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  const raw = fs.readFileSync(path.join(root, relativePath), 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    assert.fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

const HOOK_EVENTS = new Set([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'TaskCreated',
  'TaskCompleted',
  'Stop',
  'Notification',
  'PreCompact',
  'PostCompact',
  'SessionEnd'
]);

test('hooks.json parses and every hook entry is well-formed', () => {
  const manifest = readJson('hooks/hooks.json');
  assert.ok(manifest.hooks && typeof manifest.hooks === 'object', 'hooks.json needs a hooks object');

  const events = Object.entries(manifest.hooks);
  assert.ok(events.length > 0, 'hooks.json must register at least one event');

  for (const [event, matchers] of events) {
    assert.ok(HOOK_EVENTS.has(event), `unknown hook event: ${event}`);
    assert.ok(Array.isArray(matchers) && matchers.length > 0, `${event} must be a non-empty array`);
    for (const matcher of matchers) {
      assert.ok(Array.isArray(matcher.hooks) && matcher.hooks.length > 0, `${event} matcher needs hooks`);
      for (const hook of matcher.hooks) {
        assert.equal(hook.type, 'command', `${event} hook type must be "command"`);
        assert.equal(typeof hook.command, 'string', `${event} hook command must be a string`);
        if (hook.args !== undefined) {
          assert.ok(Array.isArray(hook.args), `${event} hook args must be an array`);
          for (const arg of hook.args) assert.equal(typeof arg, 'string');
        }
        if (hook.timeout !== undefined) {
          assert.ok(Number.isFinite(hook.timeout) && hook.timeout > 0, `${event} timeout must be positive`);
        }
        if (hook.statusMessage !== undefined) {
          assert.equal(typeof hook.statusMessage, 'string');
        }
      }
    }
  }
});

test('every script referenced from hooks.json exists in the repo', () => {
  const manifest = readJson('hooks/hooks.json');
  for (const matchers of Object.values(manifest.hooks)) {
    for (const matcher of matchers) {
      for (const hook of matcher.hooks) {
        const refs = [hook.command, ...(hook.args || [])]
          .filter(value => value.includes('${CLAUDE_PLUGIN_ROOT}'));
        for (const ref of refs) {
          const relative = ref.replace('${CLAUDE_PLUGIN_ROOT}/', '');
          assert.ok(
            fs.existsSync(path.join(root, relative)),
            `hooks.json references a missing file: ${relative}`
          );
        }
      }
    }
  }
});

test('plugin.json is valid and points at real command paths', () => {
  const plugin = readJson('.claude-plugin/plugin.json');
  assert.equal(plugin.name, 'menhera-loop');
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.ok(fs.existsSync(path.join(root, plugin.commands)), `missing commands dir: ${plugin.commands}`);
});

test('plugin.json does not re-declare the auto-loaded hooks/hooks.json', () => {
  // Claude Code loads hooks/hooks.json automatically; declaring it again in
  // manifest.hooks is a duplicate and makes the whole plugin fail to load.
  const plugin = readJson('.claude-plugin/plugin.json');
  const declared = [].concat(plugin.hooks || []);
  for (const ref of declared) {
    const normalized = String(ref).replace(/^\.\//, '');
    assert.notEqual(normalized, 'hooks/hooks.json', 'manifest.hooks must not reference the standard hooks/hooks.json');
  }
  assert.ok(fs.existsSync(path.join(root, 'hooks/hooks.json')), 'standard hooks/hooks.json must exist');
});

test('package.json, plugin.json, and marketplace.json versions stay in sync', () => {
  const pkg = readJson('package.json');
  const plugin = readJson('.claude-plugin/plugin.json');
  const marketplace = readJson('.claude-plugin/marketplace.json');

  assert.equal(plugin.version, pkg.version, 'plugin.json version differs from package.json');
  assert.equal(marketplace.version, pkg.version, 'marketplace.json version differs from package.json');
  const entry = marketplace.plugins.find(item => item.name === 'menhera-loop');
  assert.ok(entry, 'marketplace.json must list menhera-loop');
  assert.equal(entry.version, pkg.version, 'marketplace plugin entry version differs from package.json');
});
