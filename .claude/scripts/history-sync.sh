#!/usr/bin/env bash
#
# Sandbox side of .claude/scripts/hop-sandbox.ps1.
#
# WHY THIS EXISTS
#
# Inside the sandbox these paths are separate ext4 volumes, not part of the host
# mount (`findmnt` shows /dev/vde, /dev/vdg, ... on them):
#
#     /home/agent/.claude/projects          transcripts + the agent memory dir
#     /home/agent/.claude/todos             per-session todo lists
#
# `sbx rm` destroys those volumes, so a recreate loses every conversation and every
# saved memory. The repo root, by contrast, is a live two-way virtiofs mount
# (host[/d/Repos/55candles]), so anything mirrored into .claude-history/ survives.
#
# The same mount is how a fresh STS token reaches the sandbox: hop-sandbox.ps1 mints
# it on the host and writes .claude-history/aws-credentials; `creds` installs it.
#
# Usage:
#   history-sync.sh backup          mirror sandbox history -> host store
#   history-sync.sh restore         mirror host store -> sandbox history
#   history-sync.sh creds           install the staged AWS credentials
#   history-sync.sh session-start   creds + restore, never fails (SessionStart hook)
#   history-sync.sh status          show what is mirrored and how old the token is
set -uo pipefail

SELF_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# Derived from the script's own location, not $CLAUDE_PROJECT_DIR: this file only
# ever lives in <repo>/.claude/scripts, and hooks are not the only caller.
PROJECT_DIR=$(cd -- "$SELF_DIR/../.." && pwd)
STORE=${CLAUDE_HISTORY_STORE:-$PROJECT_DIR/.claude-history}
CLAUDE_HOME=${CLAUDE_CONFIG_DIR:-$HOME/.claude}

# Only volumes worth persisting. Deliberately excluded:
#   sessions/         keyed by PID (sessions/367.json) -- meaningless next boot
#   shell-snapshots/  regenerated on every shell start
#   statsig/          telemetry cache
SYNC_DIRS=(projects todos)

# Progress goes to stderr so callers can capture data on stdout. hop-sandbox.ps1
# knows this and merges the streams on purpose.
say()  { printf '    %s\n' "$*" >&2; }
die()  { printf 'history-sync: %s\n' "$*" >&2; exit 1; }

# rsync is present in this image; the cp fallback keeps the script honest if a
# future image drops it. lost+found comes with every ext4 volume and is not ours.
# $2 extra args are rsync-only, so the fallback stays additive/no-clobber, which is
# the safe direction for both copies.
sync_dir() {
  local src=$1 dest=$2 extra=${3:-}
  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    # shellcheck disable=SC2086 -- $extra is an intentional word-split flag list
    rsync -a $extra --exclude 'lost+found/' "$src/" "$dest/"
  else
    cp -an "$src/." "$dest/" 2>/dev/null || true
  fi
}

cmd_backup() {
  local n=0
  for d in "${SYNC_DIRS[@]}"; do
    [ -d "$CLAUDE_HOME/$d" ] || continue
    # No --delete: the store is the durable copy. Mirroring a deletion because the
    # sandbox volume was wiped is precisely the failure this script exists to stop.
    sync_dir "$CLAUDE_HOME/$d" "$STORE/$d"
    n=$((n + 1))
  done
  say "backed up $n dir(s) -> $STORE"
}

cmd_restore() {
  local n=0
  for d in "${SYNC_DIRS[@]}"; do
    [ -d "$STORE/$d" ] || continue
    # --update: never overwrite a file that is newer in the sandbox. The transcript
    # of the session running this hook is being appended to right now; the mirrored
    # copy is older by definition and must not clobber it.
    sync_dir "$STORE/$d" "$CLAUDE_HOME/$d" --update
    n=$((n + 1))
  done
  say "restored $n dir(s) <- $STORE"
}

cmd_creds() {
  local src=$STORE/aws-credentials
  [ -f "$src" ] || die "no staged credentials at $src -- run hop-sandbox.ps1 -Refresh on the host"
  grep -q 'aws_access_key_id' "$src" || die "$src does not look like an AWS credentials file"

  # 0600 and no BOM/rewrite: hop-sandbox.ps1 already emits a clean ini.
  install -D -m 600 "$src" "$HOME/.aws/credentials"
  say "installed fresh AWS credentials (region ${AWS_REGION:-unset})"

  # STS session tokens from the kit last about an hour. If the staged file is older
  # than that, the install "succeeded" and Bedrock will still throw
  # ExpiredTokenException -- worth saying out loud rather than debugging twice.
  local age
  age=$(( $(date +%s) - $(stat -c %Y "$src") ))
  if [ "$age" -gt 3300 ]; then
    say "WARNING: staged token is $((age / 60))m old and has probably expired -- re-run -Refresh"
  fi
}

# SessionStart hook entry point: best effort, never blocks a session from starting.
cmd_session_start() {
  # Subshells, not `|| true`: die() calls exit, and exit inside a function would
  # take the whole script (and the hook's exit status) with it.
  if [ -f "$STORE/aws-credentials" ]; then ( cmd_creds ) || true; fi
  ( cmd_restore ) || true
  exit 0
}

cmd_status() {
  printf 'store:       %s\n' "$STORE"
  printf 'claude home: %s\n' "$CLAUDE_HOME"
  for d in "${SYNC_DIRS[@]}"; do
    printf '%-12s sandbox=%s  store=%s\n' "$d" \
      "$(find "$CLAUDE_HOME/$d" -type f -not -path '*lost+found*' 2>/dev/null | wc -l)" \
      "$(find "$STORE/$d"       -type f 2>/dev/null | wc -l)"
  done
  if [ -f "$STORE/aws-credentials" ]; then
    printf 'token:       staged %sm ago\n' \
      "$(( ( $(date +%s) - $(stat -c %Y "$STORE/aws-credentials") ) / 60 ))"
  else
    printf 'token:       not staged\n'
  fi
}

case "${1:-status}" in
  backup)               cmd_backup ;;
  restore)              cmd_restore ;;
  creds)                cmd_creds ;;
  session-start|hook)   cmd_session_start ;;
  status)               cmd_status ;;
  *) die "unknown command '$1' (backup|restore|creds|session-start|status)" ;;
esac
