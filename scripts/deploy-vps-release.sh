#!/usr/bin/env bash
set -Eeuo pipefail

release_dir="${1:?release directory is required}"
release_sha="${2:?release commit is required}"
container_name="${AUREUM_CONTAINER_NAME:-aureum-sales-crm}"
health_url="${AUREUM_HEALTH_URL:-http://127.0.0.1:4173/api/health/ready}"
image_name="${AUREUM_IMAGE_NAME:-aureum-sales-crm}:${release_sha}"
candidate_name="${container_name}.candidate-${release_sha:0:12}"
backup_name="${container_name}.previous"
migration_mode="${AUREUM_MIGRATION_MODE:-apply}"

die() {
  echo "deploy-vps-release: $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || die 'Docker is not available to the deploy user.'
test -d "$release_dir" || die "Release directory does not exist: $release_dir"
docker inspect "$container_name" >/dev/null 2>&1 || die "Existing container not found: $container_name"

network_mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$container_name")"
restart_policy="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$container_name")"
container_user="$(docker inspect -f '{{.Config.User}}' "$container_name")"
working_dir="$(docker inspect -f '{{.Config.WorkingDir}}' "$container_name")"

# The current VPS deployment uses host networking. Refuse an unfamiliar
# networking mode rather than silently dropping port or network settings.
test "$network_mode" = host || die "Unsupported existing network mode: $network_mode"

mapfile -t env_values < <(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container_name")
mapfile -t mount_values < <(docker inspect -f '{{range .Mounts}}{{.Type}}|{{.Source}}|{{.Destination}}|{{.RW}}{{"\n"}}{{end}}' "$container_name")
mapfile -t entrypoint_values < <(docker inspect -f '{{range .Config.Entrypoint}}{{println .}}{{end}}' "$container_name")
mapfile -t command_values < <(docker inspect -f '{{range .Config.Cmd}}{{println .}}{{end}}' "$container_name")

docker build \
  --label "org.opencontainers.image.revision=${release_sha}" \
  --tag "$image_name" \
  "$release_dir"

# Schema gate: the release's code must not serve traffic against an older schema.
# It runs in the new image with the live container's environment, applies only
# migrations not yet recorded in crm.schema_migrations, and needs a backup first.
gate_args=(--rm --network "$network_mode")
for env_value in "${env_values[@]}"; do
  [[ -n "$env_value" ]] && gate_args+=(--env "$env_value")
done
run_gate() {
  docker run "${gate_args[@]}" "$image_name" node scripts/apply-schema-migrations.js "$@"
}

backup_database() {
  local backup_command="${AUREUM_DB_BACKUP_COMMAND:-}"
  if [[ -z "$backup_command" && -x "$release_dir/scripts/backup-vps-postgres.sh" ]]; then
    backup_command="bash '$release_dir/scripts/backup-vps-postgres.sh' '$container_name'"
  fi
  test -n "$backup_command" || die 'Migrations are pending but no database backup command is available.'
  bash -c "$backup_command" || die 'Database backup failed; nothing was migrated.'
}

backup_and_apply() {
  backup_database
  run_gate --apply || die 'Schema migration failed; the running container was not changed.'
}

gate_status=0
run_gate --status || gate_status=$?
if [[ "$migration_mode" = require-current ]]; then
  case "$gate_status" in
    0)
      echo 'Database schema is current; migration-free deployment may continue.'
      ;;
    3)
      die 'Database migrations are pending. Migration-free deployment stopped before changing the running container.'
      ;;
    4)
      die 'The database has no recorded migration baseline. Migration-free deployment stopped before changing the running container.'
      ;;
    *)
      die "Schema status check failed (exit ${gate_status})."
      ;;
  esac
elif [[ "$migration_mode" = apply ]]; then
  case "$gate_status" in
    0)
      echo 'Database schema is current.'
      ;;
    3)
      backup_and_apply
      ;;
    4)
      test -n "${AUREUM_SCHEMA_BASELINE_THROUGH:-}" || die 'The database has no migration baseline. Set AUREUM_SCHEMA_BASELINE_THROUGH only after confirming the existing schema.'
      backup_database
      run_gate "--baseline-through=${AUREUM_SCHEMA_BASELINE_THROUGH}" || die 'The existing schema did not pass the baseline verification; nothing was migrated.'
      run_gate --apply || die 'Schema migration failed; the running container was not changed.'
      ;;
    *)
      die "Schema status check failed (exit ${gate_status})."
      ;;
  esac
else
  die "Unsupported AUREUM_MIGRATION_MODE: ${migration_mode}"
fi
run_gate --require-current || die 'Schema verification failed; the running container was not changed.'

docker rm -f "$candidate_name" >/dev/null 2>&1 || true
docker rm -f "$backup_name" >/dev/null 2>&1 || true

create_args=(--name "$candidate_name" --network "$network_mode")
case "$restart_policy" in
  always|unless-stopped|on-failure)
    create_args+=(--restart "$restart_policy")
    ;;
  '')
    ;;
  *)
    die "Unsupported restart policy: $restart_policy"
    ;;
esac

if [[ -n "$container_user" ]]; then
  create_args+=(--user "$container_user")
fi
if [[ -n "$working_dir" ]]; then
  create_args+=(--workdir "$working_dir")
fi

for env_value in "${env_values[@]}"; do
  [[ -n "$env_value" ]] && create_args+=(--env "$env_value")
done

for mount_value in "${mount_values[@]}"; do
  IFS='|' read -r mount_type mount_source mount_destination mount_rw <<< "$mount_value"
  [[ -n "$mount_source" && -n "$mount_destination" ]] || continue
  mount_spec="type=${mount_type},source=${mount_source},destination=${mount_destination}"
  [[ "$mount_rw" == true ]] || mount_spec+=',readonly'
  create_args+=(--mount "$mount_spec")
done

if ((${#entrypoint_values[@]} > 0)); then
  create_args+=(--entrypoint "${entrypoint_values[0]}")
fi

docker create "${create_args[@]}" "$image_name" "${command_values[@]}" >/dev/null

rollback() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  docker rm -f "$candidate_name" >/dev/null 2>&1 || true
  if docker inspect "$backup_name" >/dev/null 2>&1; then
    docker rename "$backup_name" "$container_name" >/dev/null 2>&1 || true
    docker start "$container_name" >/dev/null 2>&1 || true
  fi
}

docker stop "$container_name" >/dev/null
docker rename "$container_name" "$backup_name"
docker rename "$candidate_name" "$container_name"
docker start "$container_name" >/dev/null

healthy=0
for _ in {1..30}; do
  if curl --fail --silent --show-error --max-time 3 "$health_url" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" != 1 ]]; then
  rollback
  die "New container failed readiness; the previous container was restored."
fi

echo "CRM deployed: ${release_sha}"
