#!/usr/bin/env bash
set -Eeuo pipefail

container_name="${1:-${AUREUM_CONTAINER_NAME:-aureum-sales-crm}}"
backup_root="${AUREUM_DB_BACKUP_DIR:-/opt/aureum-sales-crm/backups}"
pgdump_image="${AUREUM_PGDUMP_IMAGE:-postgres:18-alpine}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="aureum-crm-${timestamp}.dump"
backup_path="${backup_root}/${backup_name}"

die() {
  echo "backup-vps-postgres: $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || die 'Docker is not available.'
docker inspect "$container_name" >/dev/null 2>&1 || die "CRM container not found: ${container_name}"

database_url=''
pooled_url=''
while IFS= read -r env_value; do
  case "$env_value" in
    DATABASE_URL_UNPOOLED=*) database_url="${env_value#DATABASE_URL_UNPOOLED=}" ;;
    DATABASE_URL=*) pooled_url="${env_value#DATABASE_URL=}" ;;
  esac
done < <(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container_name")
[[ -n "$database_url" ]] || database_url="$pooled_url"
[[ -n "$database_url" ]] || die 'The CRM container has no PostgreSQL connection string.'
case "$database_url" in
  *neon.tech*) die 'Refusing to back up Neon from the VPS release path.' ;;
esac

umask 077
mkdir -p "$backup_root"
chmod 700 "$backup_root"

docker run --rm --network host \
  --env "DATABASE_URL=${database_url}" \
  --env "BACKUP_NAME=${backup_name}" \
  --mount "type=bind,source=${backup_root},destination=/backup" \
  "$pgdump_image" \
  sh -eu -c 'pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="/backup/$BACKUP_NAME"; pg_restore --list "/backup/$BACKUP_NAME" >/dev/null'

[[ -s "$backup_path" ]] || die 'The PostgreSQL dump was not created or is empty.'
chmod 600 "$backup_path"
sha256sum "$backup_path"
echo "PostgreSQL backup verified: ${backup_path}"
