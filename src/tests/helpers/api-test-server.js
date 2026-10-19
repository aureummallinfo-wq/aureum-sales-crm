const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.resolve(__dirname, '../../..');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startApiServer(t) {
  // Ask the OS for a free port rather than occasionally choosing a blocked port such as 5060.
  const reservation = net.createServer();
  await new Promise((resolve,reject) => { reservation.once('error',reject); reservation.listen(0,'127.0.0.1',resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let output = '';
  const server = spawn(process.execPath, ['backend/crm-api-server.js'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: '', AUREUM_PERSISTENCE: '0', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });
  t.after(() => { if (!server.killed) server.kill(); });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${base}/`);
      if (response.ok) break;
    } catch {
      await wait(80);
    }
    if (attempt === 49) throw new Error(`API server did not start. Output: ${output}`);
  }

  async function request(route, options = {}) {
    const response = await fetch(`${base}${route}`, options);
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    return { response, body, text };
  }

  async function login(identifier, password) {
    const defaultPasswords = {
      'waqas@aureum.com': 'Waqas@123',
      'dua@aureum.com': 'Rana@123',
      'adan@aureum.com': 'Rehman@123'
    };
    const resolvedPassword = password || defaultPasswords[String(identifier).toLowerCase()] || 'Aureum123!';
    const result = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password: resolvedPassword })
    });
    if (result.response.status !== 200) throw new Error(`Login failed for ${identifier}: ${result.text}`);
    return result.response.headers.get('set-cookie');
  }

  return { base, request, login, output: () => output };
}

module.exports = { ROOT, startApiServer };
