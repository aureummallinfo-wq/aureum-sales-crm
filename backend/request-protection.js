const crypto = require('node:crypto');
const net = require('node:net');
const { AsyncLocalStorage } = require('node:async_hooks');

const databaseContext = new AsyncLocalStorage();

function positiveInteger(value, fallback, maximum = 60000) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function createDatabaseFetch(fetchImpl, timeoutMs = 10000) {
  return async (input, options = {}) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signals = [deadline, options.signal, databaseContext.getStore()?.signal].filter(Boolean);
    const signal = AbortSignal.any(signals);
    try {
      return await fetchImpl(input, { ...options, signal });
    } catch (cause) {
      if (!signal.aborted) throw cause;
      const error = new Error('The database request exceeded its deadline.', { cause });
      error.code = 'DATABASE_TIMEOUT';
      throw error;
    }
  };
}

function isDatabaseUnavailable(error) {
  const seen = new Set();
  for (let current = error; current && !seen.has(current); current = current.cause || current.sourceError) {
    seen.add(current);
    if (['DATABASE_TIMEOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET', '08000', '08001', '08003', '08006', '53300', '57P01', '57P02', '57P03'].includes(current.code)) return true;
    if (['AbortError', 'TimeoutError'].includes(current.name)) return true;
  }
  return false;
}

function clientAddress(req, trustVercel = false) {
  // Only the hosting platform may supply the client IP. Local clients cannot
  // rotate arbitrary forwarding headers to bypass their request budget.
  const forwarded = trustVercel ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return net.isIP(forwarded) ? forwarded : req.socket?.remoteAddress || 'unknown';
}

function hashKey(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function createMemoryRateStore({ now = Date.now, maximumKeys = 10000 } = {}) {
  const counters = new Map();
  return {
    async consume(key, limit, windowSeconds = 60) {
      const instant = now();
      let counter = counters.get(key);
      if (!counter || counter.endsAt <= instant) {
        if (!counter && counters.size >= maximumKeys) {
          for (const [storedKey, value] of counters) if (value.endsAt <= instant) counters.delete(storedKey);
          if (counters.size >= maximumKeys) return { allowed: false, retryAfter: windowSeconds };
        }
        counter = { count: 0, endsAt: instant + windowSeconds * 1000 };
        counters.set(key, counter);
      }
      counter.count = Math.min(counter.count + 1, limit + 1);
      return { allowed: counter.count <= limit, retryAfter: Math.max(1, Math.ceil((counter.endsAt - instant) / 1000)) };
    }
  };
}

function createNeonRateStore(sql, { now = Date.now, onCleanupError = () => {} } = {}) {
  let nextCleanup = 0;
  return {
    async consume(key, limit, windowSeconds = 60) {
      // One atomic counter per identity/policy, shared by all Vercel instances.
      // The database clock prevents host clock differences from resetting it.
      const rows = await sql.query(`INSERT INTO crm.request_rate_limits AS budget (key_hash, request_count, window_ends)
        VALUES ($1, 1, now() + $2 * interval '1 second')
        ON CONFLICT (key_hash) DO UPDATE SET
          request_count = CASE WHEN budget.window_ends <= now() THEN 1 ELSE LEAST(budget.request_count + 1, $3 + 1) END,
          window_ends = CASE WHEN budget.window_ends <= now() THEN now() + $2 * interval '1 second' ELSE budget.window_ends END
        RETURNING request_count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM window_ends - now()))) AS retry_after`, [key, windowSeconds, limit]);
      if (!rows[0]) throw new Error('Rate limit storage did not return a budget.');
      if (now() >= nextCleanup) {
        nextCleanup = now() + 300000;
        // Bounded cleanup also runs on cold instances; expired IP budgets do
        // not accumulate indefinitely. Failure never changes the decision.
        try {
          await sql.query(`DELETE FROM crm.request_rate_limits WHERE key_hash IN
            (SELECT key_hash FROM crm.request_rate_limits WHERE window_ends < now() - interval '1 hour' LIMIT 1000)`);
        } catch (error) { onCleanupError(error); }
      }
      return { allowed: Number(rows[0].request_count) <= limit, retryAfter: Number(rows[0].retry_after) };
    }
  };
}

function ratePolicy(req, pathname, user, limits = {}) {
  if (pathname === '/api/auth/login') return { name: 'login', limit: limits.login || 30, identity: 'ip' };
  if (/^\/api\/webhooks\/leads\/[^/]+$/.test(pathname)) return { name: `webhook:${pathname.split('/').pop()}`, limit: limits.webhook || 120, identity: 'ip' };
  if (!user) return { name: 'anonymous', limit: 120, identity: 'ip' };
  if (/(?:^|\/)(?:import|export|import-preview)(?:\/|$)/.test(pathname)) return { name: 'bulk', limit: limits.bulk || 10, identity: 'user' };
  return ['GET', 'HEAD'].includes(req.method)
    ? { name: 'read', limit: limits.read || 300, identity: 'user' }
    : { name: 'write', limit: limits.write || 60, identity: 'user' };
}

module.exports = { databaseContext, positiveInteger, createDatabaseFetch, isDatabaseUnavailable, clientAddress, hashKey, createMemoryRateStore, createNeonRateStore, ratePolicy };
