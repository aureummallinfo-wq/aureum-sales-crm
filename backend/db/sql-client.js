const { Pool } = require('pg');

function resolveDatabaseDriver(value = process.env.AUREUM_DATABASE_DRIVER) {
  const fallback = process.env.NODE_ENV === 'production' ? 'postgres' : 'neon';
  const driver = String(value || fallback).trim().toLowerCase();
  const isVercelPreview = String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'preview';
  const isProductionRuntime = process.env.NODE_ENV === 'production' && !isVercelPreview;
  if (!['postgres', 'neon'].includes(driver)) {
    throw new Error(`Unsupported AUREUM_DATABASE_DRIVER: ${driver || '(empty)'}. Use postgres or neon.`);
  }
  if (isProductionRuntime && driver !== 'postgres') {
    throw new Error('Production requires AUREUM_DATABASE_DRIVER=postgres. Neon is development-only.');
  }
  return driver;
}

function taggedQuery(pool, strings, values) {
  let text = '';
  for (let index = 0; index < strings.length; index += 1) {
    text += strings[index];
    if (index < values.length) text += `$${index + 1}`;
  }
  return pool.query(text, values).then(result => result.rows);
}

function createPostgresSql(connectionString) {
  if (!connectionString) throw new Error('A PostgreSQL connection string is required.');
  const pool = new Pool({
    connectionString,
    max: Number(process.env.AUREUM_DATABASE_POOL_SIZE || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  const sql = (strings, ...values) => taggedQuery(pool, strings, values);
  sql.query = (text, values = []) => pool.query(text, values).then(result => result.rows);
  sql.pool = pool;
  sql.end = () => pool.end();
  return sql;
}

function createNeonSql(connectionString) {
  if (!connectionString) throw new Error('A database connection string is required.');
  const { neon } = require('@neondatabase/serverless');
  return neon(connectionString);
}

function createDatabaseSql(connectionString, { driver = resolveDatabaseDriver() } = {}) {
  const isVercelPreview = String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'preview';
  const isProductionRuntime = process.env.NODE_ENV === 'production' && !isVercelPreview;
  if (isProductionRuntime && connectionString) {
    try {
      const databaseHost = new URL(connectionString).hostname.toLowerCase();
      if (databaseHost === 'neon.tech' || databaseHost.endsWith('.neon.tech')) throw new Error('Production DATABASE_URL must point to the VPS PostgreSQL service, not Neon.');
    } catch (error) {
      if (error.message.includes('not Neon')) throw error;
    }
  }
  return driver === 'postgres' ? createPostgresSql(connectionString) : createNeonSql(connectionString);
}

module.exports = { createPostgresSql, createNeonSql, createDatabaseSql, resolveDatabaseDriver };
