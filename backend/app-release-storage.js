const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_APK_BYTES = Number(process.env.AUREUM_MAX_APK_BYTES || 250 * 1024 * 1024);
const STORAGE_ROOT = path.resolve(process.env.AUREUM_RELEASE_STORAGE_DIR || path.join(process.cwd(), 'storage', 'android-releases'));

function safeStorageKey(value) {
  const key = String(value || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120);
  if (!key || key.includes('..') || path.isAbsolute(key)) throw new Error('Invalid release storage key.');
  return key;
}

function storagePath(storageKey) {
  const key = safeStorageKey(storageKey);
  const target = path.resolve(STORAGE_ROOT, key);
  const relative = path.relative(STORAGE_ROOT, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Release storage path is outside the configured directory.');
  return target;
}

async function writeApkRequest(req, storageKey) {
  const target = storagePath(storageKey);
  await fs.promises.mkdir(STORAGE_ROOT, { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.part`;
  const hash = crypto.createHash('sha256');
  let size = 0;
  let firstChunk = Buffer.alloc(0);
  const output = fs.createWriteStream(temporary, { flags: 'wx', mode: 0o640 });
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const fail = error => { if (settled) return; settled = true; reject(error); };
      const finish = () => { if (settled) return; settled = true; resolve(); };
      req.on('data', chunk => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (firstChunk.length < 4) firstChunk = Buffer.concat([firstChunk, buffer]).subarray(0, 4);
        if (size > MAX_APK_BYTES) { const error = new Error('APK file is too large.'); error.code = 'PAYLOAD_TOO_LARGE'; fail(error); req.destroy(); return; }
        hash.update(buffer);
        if (!output.write(buffer)) req.pause();
      });
      output.on('drain', () => req.resume());
      req.on('end', () => output.end(finish));
      req.on('aborted', () => fail(new Error('APK upload was interrupted.')));
      req.on('error', fail);
      output.on('error', fail);
    });
    if (size < 4 || firstChunk.toString('hex') !== '504b0304') { const error = new Error('The uploaded file is not a valid APK archive.'); error.code = 'INVALID_APK'; throw error; }
    await fs.promises.rename(temporary, target);
    return { size, sha256: hash.digest('hex'), storageKey: safeStorageKey(storageKey) };
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function createReadStream(storageKey) { return fs.createReadStream(storagePath(storageKey)); }
function fileExists(storageKey) { try { return fs.statSync(storagePath(storageKey)).isFile(); } catch { return false; } }
async function remove(storageKey) { await fs.promises.rm(storagePath(storageKey), { force: true }); }

module.exports = { MAX_APK_BYTES, STORAGE_ROOT, writeApkRequest, createReadStream, fileExists, remove };
