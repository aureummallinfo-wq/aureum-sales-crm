'use strict';

// Read-only pagination primitives for Aureum CRM.
// Callers MUST supply a workspace/role-scoped WHERE and a fixed, deterministic ORDER BY.
// Never concatenate user-supplied SQL identifiers or sort expressions.

const PAGE_SIZES = Object.freeze([10, 25, 50, 100]);
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE = 1_000_000;

class PaginationValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaginationValidationError';
    this.status = 400;
  }
}

function readPositiveInteger(raw, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new PaginationValidationError(`${label} must be an integer.`);
  }
  const value = String(raw);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new PaginationValidationError(`${label} must be a positive integer.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new PaginationValidationError(`${label} must be between ${min} and ${max}.`);
  }
  return number;
}

function parsePagination(searchParams, { defaultPageSize = DEFAULT_PAGE_SIZE } = {}) {
  const params = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams);
  const requested = params.has('page') || params.has('pageSize');
  if (!requested) return null; // Backward-compatible, unpaged legacy call.
  if (!PAGE_SIZES.includes(defaultPageSize)) {
    throw new TypeError('Default page size is not an allowed size.');
  }
  const page = params.has('page') ? readPositiveInteger(params.get('page'), 'page', { max: MAX_PAGE }) : 1;
  const pageSize = params.has('pageSize') ? readPositiveInteger(params.get('pageSize'), 'pageSize', { max: 100 }) : defaultPageSize;
  if (!PAGE_SIZES.includes(pageSize)) {
    throw new PaginationValidationError('pageSize must be 10, 25, 50, or 100.');
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function paginationMeta({ page, pageSize }, totalValue) {
  const total = Number(totalValue);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new TypeError('Invalid total count returned from database.');
  }
  const totalPages = Math.ceil(total / pageSize);
  return {
    page, pageSize, total, totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

function safeSqlFragment(fragment, label) {
  if (typeof fragment !== 'string' || !fragment.trim()) {
    throw new TypeError(`Missing static ${label} SQL.`);
  }
  return fragment;
}

/**
 * Read an authorized, filtered page from PostgreSQL.
 *
 * `fromSql`: STATIC FROM/JOIN clause, e.g. 'FROM crm.leads l LEFT JOIN ...'
 * `whereSql`: SAME security-scoped AND filtered predicates in data and count
 * `selectSql`: STATIC SELECT clause, e.g. 'SELECT l.*, u.full_name AS ...'
 * `orderBySql`: STATIC deterministic ORDER BY, ending in unique primary ID
 * `params`: SQL values for the where predicate (no dynamic SQL fragments)
 * `sql.query`: async (query, params) => rows[]
 *
 * Counts and rows use separate read-only SELECTs. Concurrent writes can cause
 * a slight drift between the two unless the caller uses a read-only repeatable
 * read transaction; consumers should handle last-page shrink gracefully.
 */
async function selectPage({ sql, selectSql, fromSql, whereSql, orderBySql, params = [], pagination }) {
  if (!pagination || !Number.isSafeInteger(pagination.offset) || pagination.offset < 0 || !PAGE_SIZES.includes(pagination.pageSize)) {
    throw new TypeError('Expected validated pagination.');
  }
  if (!sql || typeof sql.query !== 'function') throw new TypeError('A SQL query executor is required.');
  if (!Array.isArray(params)) throw new TypeError('SQL params must be an array.');
  const from = safeSqlFragment(fromSql, 'FROM');
  const where = safeSqlFragment(whereSql, 'WHERE');
  const orderBy = safeSqlFragment(orderBySql, 'ORDER BY');
  const select = safeSqlFragment(selectSql, 'SELECT');
  const countQuery = `SELECT COUNT(*)::bigint AS total ${from} WHERE ${where}`;
  const countResult = await sql.query(countQuery, params);
  const countRaw = countResult?.[0]?.total ?? 0;
  const meta = paginationMeta(pagination, countRaw);
  const limitIndex = params.length + 1;
  const offsetIndex = limitIndex + 1;
  const rows = await sql.query(
    `${select} ${from} WHERE ${where} ORDER BY ${orderBy} LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    [...params, pagination.pageSize, pagination.offset]
  );
  return { rows, meta };
}

module.exports = {
  PAGE_SIZES, DEFAULT_PAGE_SIZE, PaginationValidationError,
  parsePagination, paginationMeta, selectPage,
};
