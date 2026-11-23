const { spawnSync } = require('node:child_process');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.error) return { ok: false, error: result.error };
  return { ok: result.status === 0, output: String(result.stdout || '').trim(), errorOutput: String(result.stderr || '').trim() };
}

const version = run('adb', ['version']);
if (!version.ok) {
  console.error('Android device QA is not available: adb was not found or could not start.');
  console.error('Install Android platform-tools, connect a device or start an emulator, then run this command again.');
  process.exitCode = 2;
} else {
  const devices = run('adb', ['devices', '-l']);
  const connected = devices.output.split(/\r?\n/).filter(line => /^\S+\s+device\b/.test(line));
  if (!connected.length) {
    console.error('Android platform-tools are installed, but no authorized device or emulator is connected.');
    console.error(devices.output || 'adb returned no devices.');
    process.exitCode = 2;
  } else {
    const model = run('adb', ['shell', 'getprop', 'ro.product.model']).output || 'Unknown model';
    const android = run('adb', ['shell', 'getprop', 'ro.build.version.release']).output || 'Unknown Android version';
    const size = run('adb', ['shell', 'wm', 'size']).output || 'Unknown screen size';
    console.log('Android device preflight passed.');
    console.log(`Device: ${model}`);
    console.log(`Android: ${android}`);
    console.log(`Screen: ${size}`);
    console.log(`Connected targets: ${connected.length}`);
  }
}
