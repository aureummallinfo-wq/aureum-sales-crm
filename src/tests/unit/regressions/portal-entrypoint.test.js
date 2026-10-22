const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../../../frontend');

test('the shipped page loads the boot and binding provider before its consumers', () => {
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)];
  const files = scripts.map(match => match[2]);
  const runtime = files.indexOf('/app-runtime.js');
  assert.equal(files.filter(file => file === '/app-runtime.js').length, 1);
  assert.ok(files.indexOf('/app-shell.js') < runtime);
  for (const [index, script] of scripts.entries()) {
    assert.match(script[1] + script[3], /\bdefer\b/);
    assert.doesNotMatch(script[1] + script[3], /\basync\b/);
    const source = fs.readFileSync(path.join(frontend, script[2].slice(1)), 'utf8');
    if (/window\.aureumFinal(?:Boot|Bind)\s*\(/.test(source)) {
      assert.ok(index > runtime, `${script[2]} must load after the runtime`);
    }
  }
});
