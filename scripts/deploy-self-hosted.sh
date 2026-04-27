#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly APP_ROOT="${BLOG_APP_ROOT:-/srv/blog}"
readonly SOURCE_DIR="${BLOG_SOURCE_DIR:-${APP_ROOT}/source}"
readonly RELEASES_DIR="${BLOG_RELEASES_DIR:-${APP_ROOT}/releases}"
readonly CURRENT_LINK="${BLOG_CURRENT_LINK:-${APP_ROOT}/current}"
readonly LOG_DIR="${BLOG_LOG_DIR:-${APP_ROOT}/logs}"
readonly LOCK_FILE="${BLOG_LOCK_FILE:-${APP_ROOT}/deploy.lock}"
readonly REMOTE="${BLOG_REMOTE:-origin}"
readonly BRANCH="${BLOG_BRANCH:-main}"
readonly KEEP_RELEASES="${BLOG_KEEP_RELEASES:-5}"
readonly BUILD_COMMAND="${BLOG_BUILD_COMMAND:-pnpm build:site}"
readonly DIST_DIR="${BLOG_DIST_DIR:-${SOURCE_DIR}/frontend/dist}"
readonly HEALTHCHECK_URL="${BLOG_HEALTHCHECK_URL:-}"
readonly HEALTHCHECK_TIMEOUT="${BLOG_HEALTHCHECK_TIMEOUT:-10}"
readonly RELOAD_COMMAND="${BLOG_RELOAD_COMMAND:-}"
readonly TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
readonly RELEASE_DIR="${RELEASES_DIR}/${TIMESTAMP}"
readonly LOG_FILE="${LOG_DIR}/build-${TIMESTAMP}.log"

active_release_dir=""
previous_release_target=""

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_command() {
  local command_name="$1"

  command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: ${command_name}"
}

validate_positive_integer() {
  local name="$1"
  local value="$2"

  [[ "$value" =~ ^[1-9][0-9]*$ ]] || fail "${name} must be a positive integer."
}

validate_paths() {
  [[ -d "$SOURCE_DIR" ]] || fail "Source directory does not exist: ${SOURCE_DIR}"
  [[ -d "${SOURCE_DIR}/.git" ]] || fail "Source directory is not a git repository: ${SOURCE_DIR}"

  mkdir -p "$RELEASES_DIR" "$LOG_DIR"

  if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
    fail "Current path exists but is not a symlink: ${CURRENT_LINK}"
  fi

  case "$(realpath -m "$RELEASE_DIR")" in
    "$(realpath -m "$RELEASES_DIR")"/*) ;;
    *) fail "Release directory must stay inside releases root: ${RELEASE_DIR}" ;;
  esac
}

remember_previous_release() {
  if [[ -L "$CURRENT_LINK" ]]; then
    previous_release_target="$(readlink -f "$CURRENT_LINK")"
  fi
}

install_dependencies() {
  log "Installing dependencies"
  pnpm install --frozen-lockfile
}

sync_source() {
  log "Fetching ${REMOTE}/${BRANCH}"
  git fetch --all --prune
  git reset --hard "${REMOTE}/${BRANCH}"
}

build_site() {
  log "Running build command: ${BUILD_COMMAND}"
  bash -lc "$BUILD_COMMAND"

  [[ -f "${DIST_DIR}/index.html" ]] || fail "Build output is missing index.html: ${DIST_DIR}"
}

copy_release() {
  log "Copying ${DIST_DIR} to ${RELEASE_DIR}"
  mkdir -p "$RELEASE_DIR"
  active_release_dir="$RELEASE_DIR"
  rsync -a --delete "${DIST_DIR}/" "${RELEASE_DIR}/"

  cat > "${RELEASE_DIR}/release.json" <<EOF
{
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit": "$(git rev-parse HEAD)",
  "branch": "${BRANCH}",
  "source": "${REMOTE}/${BRANCH}"
}
EOF
}

switch_current_symlink() {
  local next_link="${CURRENT_LINK}.next"

  log "Switching current symlink to ${RELEASE_DIR}"
  ln -sfn "$RELEASE_DIR" "$next_link"
  mv -Tf "$next_link" "$CURRENT_LINK"
}

reload_static_server() {
  if [[ -z "$RELOAD_COMMAND" ]]; then
    return
  fi

  log "Reloading static server"
  bash -lc "$RELOAD_COMMAND"
}

run_healthcheck() {
  if [[ -z "$HEALTHCHECK_URL" ]]; then
    log "Healthcheck skipped because BLOG_HEALTHCHECK_URL is not set"
    return
  fi

  log "Checking ${HEALTHCHECK_URL}"
  curl --fail --silent --show-error --max-time "$HEALTHCHECK_TIMEOUT" "$HEALTHCHECK_URL" >/dev/null
}

rollback_current_symlink() {
  if [[ -z "$previous_release_target" ]]; then
    log "No previous release target is available for rollback"
    return
  fi

  log "Rolling back current symlink to ${previous_release_target}"
  ln -sfn "$previous_release_target" "${CURRENT_LINK}.rollback"
  mv -Tf "${CURRENT_LINK}.rollback" "$CURRENT_LINK"
  reload_static_server
}

cleanup_old_releases() {
  local release_count
  local -a stale_releases

  release_count="$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"

  if (( release_count <= KEEP_RELEASES )); then
    return
  fi

  log "Keeping newest ${KEEP_RELEASES} releases"
  mapfile -t stale_releases < <(
    find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
      sort -rn |
      tail -n +"$((KEEP_RELEASES + 1))" |
      cut -d' ' -f2-
  )

  for stale_release in "${stale_releases[@]}"; do
    [[ -n "$stale_release" ]] || continue
    [[ "$(realpath -m "$stale_release")" == "$(realpath -m "$RELEASES_DIR")"/* ]] || continue
    log "Removing old release ${stale_release}"
    rm -rf -- "$stale_release"
  done
}

handle_failure() {
  local exit_code=$?

  log "Deployment failed with exit code ${exit_code}"

  if [[ -n "$active_release_dir" && "$active_release_dir" == "$RELEASE_DIR" && ! -e "${RELEASE_DIR}/index.html" ]]; then
    log "Removing incomplete release ${RELEASE_DIR}"
    rm -rf -- "$RELEASE_DIR"
  fi

  exit "$exit_code"
}

main() {
  require_command bash
  require_command curl
  require_command date
  require_command cut
  require_command find
  require_command flock
  require_command git
  require_command pnpm
  require_command readlink
  require_command realpath
  require_command rsync
  require_command sort
  require_command tail
  require_command tee
  require_command tr
  require_command wc
  validate_positive_integer BLOG_KEEP_RELEASES "$KEEP_RELEASES"
  validate_positive_integer BLOG_HEALTHCHECK_TIMEOUT "$HEALTHCHECK_TIMEOUT"
  validate_paths

  exec > >(tee -a "$LOG_FILE") 2>&1
  exec 9>"$LOCK_FILE"

  flock -n 9 || fail "Another deployment is already running."
  trap handle_failure ERR

  log "Starting deployment"
  remember_previous_release

  cd "$SOURCE_DIR"
  sync_source
  install_dependencies
  build_site
  copy_release
  switch_current_symlink
  reload_static_server

  if ! run_healthcheck; then
    rollback_current_symlink
    fail "Healthcheck failed after switching release."
  fi

  cleanup_old_releases
  log "Deployment completed: ${RELEASE_DIR}"
}

main "$@"
