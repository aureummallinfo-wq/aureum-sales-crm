const { Pool } = require('pg');

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
  sql.end = () => pool.end();
  return sql;
}

module.exports = { createPostgresSql };
