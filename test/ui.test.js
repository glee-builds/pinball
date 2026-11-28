#!/usr/bin/env node
/*
 * Checks the page script of index.html without running it in a browser.
 *
 *   node --test test/ui.test.js
 *
 * 1. Compile check: every inline <script> body must parse. Nothing is run.
 * 2. Event check: every event name the sim emits (emit('NAME')) must have a
 *    handler in the display script (a key of the ON_EVENT handler table), and the display must not
 *    handle a name the sim never emits. ALLOWED_UNHANDLED is the only
 *    exception, and it is intentionally small.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ALLOWED_UNHANDLED = new Set(['orbit', 'shieldGone']);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Every <script ...>...</script> block that has no src attribute.
function inlineScripts(source) {
  const found = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    found.push({ attrs, body: m[2] });
  }
  return found;
}

const scripts = inlineScripts(html);
const simScript = scripts.find((s) => /\bid\s*=\s*["']sim["']/i.test(s.attrs));
const displayScript = scripts.find((s) => s !== simScript);

function names(source, re) {
  const out = new Set();
  let m;
  while ((m = re.exec(source)) !== null) out.add(m[1]);
  return out;
}

// Keys of the display script's `var ON_EVENT = { name: function (e) {...}, ... };`
// handler table, found by text. Each handler starts at the table's own indent level.
function handlerTableKeys(source) {
  const start = source.indexOf('var ON_EVENT = {\n');
  assert.ok(start >= 0, 'the ON_EVENT handler table was not found in the display script');
  const end = source.indexOf('\n  };\n', start);
  assert.ok(end > start, 'the end of the ON_EVENT handler table was not found');
  return names(source.slice(start, end), /^ {4}(\w+): function \(e\) \{$/gm);
}

test('index.html has exactly two inline script bodies and both compile', () => {
  assert.strictEqual(scripts.length, 2, `expected 2 inline script bodies, found ${scripts.length}`);
  assert.ok(simScript, 'the sim script (id="sim") was not found');
  scripts.forEach((s, i) => {
    // new vm.Script compiles only; it never runs the code.
    assert.doesNotThrow(
      () => new vm.Script(s.body, { filename: `index.html script ${i + 1}` }),
      (err) => `script ${i + 1} failed to compile: ${err && err.message}`
    );
  });
});

test('sim emits and display handles the same event names', () => {
  const emitted = names(simScript.body, /emit\(\s*['"](\w+)['"]/g);
  const handled = handlerTableKeys(displayScript.body);

  assert.ok(emitted.size > 0, 'no emit(\'NAME\') calls found in the sim');
  assert.ok(handled.size > 0, 'no handlers found in the ON_EVENT table of the display script');

  const unhandled = [...emitted].filter((n) => !handled.has(n) && !ALLOWED_UNHANDLED.has(n)).sort();
  const neverEmitted = [...handled].filter((n) => !emitted.has(n)).sort();

  const problems = [];
  if (unhandled.length) {
    problems.push(`sim emits, display does not handle: ${unhandled.join(', ')}`);
  }
  if (neverEmitted.length) {
    problems.push(`display handles, sim never emits: ${neverEmitted.join(', ')}`);
  }
  assert.strictEqual(problems.length, 0, problems.join('\n'));
});
