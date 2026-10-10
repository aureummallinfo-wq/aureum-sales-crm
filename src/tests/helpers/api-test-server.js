const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startApiServer(t) {
  const port = 4300 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;
  let output = '';
  const server = spawn(process.execPath, ['backend/crm-api-server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${base}/`);
      if (response.ok) break;
    } catch {
      await wait(80);
    }
    if (attempt === 49) throw new Error(`API server did not start. Output: ${output}`);
  }

  t.after(() => {
    if (!server.killed) server.kill();
  });

  async function request(route, options = {}) {
    const response = await fetch(`${base}${route}`, options);
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    return { response, body, text };
  }

  async function login(identifier, password = 'Aureum123!') {
    const result = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    if (result.response.status !== 200) throw new Error(`Login failed for ${identifier}: ${result.text}`);
    return result.response.headers.get('set-cookie');
  }

  return { base, request, login, output: () => output };
}

module.exports = { ROOT, startApiServer };
