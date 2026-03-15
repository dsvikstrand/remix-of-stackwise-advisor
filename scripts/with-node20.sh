#!/usr/bin/env bash
set -euo pipefail

required_node_version="${REQUIRED_NODE_VERSION:-20.20.0}"
required_node_major=20
current_node_version=""

if command -v node >/dev/null 2>&1; then
  current_node_version="$(node -p 'process.versions.node' 2>/dev/null || true)"
  current_node_major="${current_node_version%%.*}"
  if [[ "$current_node_major" =~ ^[0-9]+$ ]] && (( current_node_major >= required_node_major )); then
    exec "$@"
  fi
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  unset npm_config_prefix
  unset NPM_CONFIG_PREFIX
  unset PREFIX
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  if nvm use "$required_node_version" >/dev/null 2>&1; then
    exec "$@"
  fi
  if nvm use "$required_node_major" >/dev/null 2>&1; then
    exec "$@"
  fi
fi

echo "Node 20+ is required for this repo; detected ${current_node_version:-missing}. Install/use Node ${required_node_version} (see .nvmrc)." >&2
exit 1
