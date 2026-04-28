#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const DEFAULT_HOST = 'oracle-free';
const DEFAULT_REPO_DIR = '/home/ubuntu/remix-of-stackwise-advisor';
const DEFAULT_BACKEND_SERVICE = 'agentic-backend.service';
const DEFAULT_WORKER_SERVICE = 'agentic-worker.service';
const DEFAULT_BACKEND_URL = 'https://api.bleup.app';
const REQUIRED_NODE_VERSION = '20.20.0';
const SERVER_ARTIFACT = 'dist/server/index.mjs';
const ENV_FILE = '/etc/agentic-backend.env';

function parseArgs(argv) {
  const args = argv.slice(2);
  const read = (flag, fallback = '') => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() : fallback;
  };

  return {
    sha: read('--sha', String(process.env.RELEASE_SHA || '').trim()),
    host: read('--host', DEFAULT_HOST),
    repoDir: read('--repo-dir', DEFAULT_REPO_DIR),
    backendService: read('--backend-service', DEFAULT_BACKEND_SERVICE),
    workerService: read('--worker-service', DEFAULT_WORKER_SERVICE),
    backendUrl: read('--backend-url', String(process.env.VITE_AGENTIC_BACKEND_URL || DEFAULT_BACKEND_URL).trim()),
    dryRun: args.includes('--dry-run'),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    input: options.input,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

function resolveSha(inputSha) {
  if (inputSha) return inputSha;
  return run('git', ['rev-parse', 'HEAD']);
}

function remoteScript() {
  return `set -Eeuo pipefail

target_sha="$1"
repo_dir="$2"
backend_url="$3"
backend_service="$4"
worker_service="$5"
dry_run="$6"

required_node_version="20.20.0"
server_artifact="dist/server/index.mjs"
env_file="/etc/agentic-backend.env"

log() {
  printf '[deploy_oracle_release] %s\n' "$*"
}

fail() {
  printf '[deploy_oracle_release] ERROR: %s\n' "$*" >&2
  exit 1
}

require_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"
  if ! grep -Fq "$needle" <<<"$haystack"; then
    fail "$label missing expected marker: $needle"
  fi
}

rollback_hint() {
  local previous_sha="$1"
  cat <<ROLLBACK
[deploy_oracle_release] Manual rollback commands:
  cd \${repo_dir}
  export NVM_DIR="\$HOME/.nvm"; . "\$NVM_DIR/nvm.sh"; nvm use \${required_node_version}
  git switch --detach \${previous_sha}
  GITHUB_SHA=\${previous_sha} VITE_AGENTIC_BACKEND_URL=\${backend_url} npm run build:release
  sudo -n systemctl restart \${backend_service}
  sudo -n systemctl restart \${worker_service}
  systemctl is-active \${backend_service} \${worker_service}
  curl -fsS http://127.0.0.1:8787/api/health
ROLLBACK
}

cd "$repo_dir"

previous_sha="$(git rev-parse HEAD)"
log "repo=\${repo_dir}"
log "previous_sha=\${previous_sha}"
log "target_sha=\${target_sha}"
log "dry_run=\${dry_run}"

tracked_dirty="$(git status --porcelain --untracked-files=no)"
if [ -n "$tracked_dirty" ]; then
  printf '%s\n' "$tracked_dirty" >&2
  fail "tracked production worktree changes must be resolved before deploy"
fi

untracked="$(git status --porcelain --untracked-files=all | grep '^\?\?' || true)"
if [ -n "$untracked" ]; then
  untracked_count="$(printf '%s\n' "$untracked" | grep -c '^' || true)"
  log "warning: \${untracked_count} untracked production files are present and will be ignored"
  printf '%s\n' "$untracked" | sed -n '1,20p'
  if [ "\${untracked_count}" -gt 20 ]; then
    log "warning: untracked output truncated after 20 entries"
  fi
fi

test -f "$env_file" || fail "missing runtime env file: \${env_file}"

backend_unit="$(systemctl cat "$backend_service")"
worker_unit="$(systemctl cat "$worker_service")"

require_contains "$backend_unit" "$env_file" "\${backend_service}"
require_contains "$worker_unit" "$env_file" "\${worker_service}"
require_contains "$backend_unit" "$required_node_version" "\${backend_service}"
require_contains "$worker_unit" "$required_node_version" "\${worker_service}"
require_contains "$backend_unit" "$server_artifact" "\${backend_service}"
require_contains "$worker_unit" "$server_artifact" "\${worker_service}"
require_contains "$backend_unit" "RUN_HTTP_SERVER=true" "\${backend_service}"
require_contains "$backend_unit" "RUN_INGESTION_WORKER=false" "\${backend_service}"
require_contains "$worker_unit" "RUN_HTTP_SERVER=false" "\${worker_service}"
require_contains "$worker_unit" "RUN_INGESTION_WORKER=true" "\${worker_service}"

systemctl is-active --quiet "$backend_service" || fail "\${backend_service} is not active before deploy"
systemctl is-active --quiet "$worker_service" || fail "\${worker_service} is not active before deploy"
sudo -n true >/dev/null 2>&1 || fail "passwordless sudo is required for service restart"

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"
nvm use "$required_node_version" >/dev/null
node_version="$(node -p 'process.versions.node')"
if [ "$node_version" != "$required_node_version" ]; then
  fail "expected Node \${required_node_version}, got \${node_version}"
fi

git fetch --prune origin
git cat-file -e "\${target_sha}^{commit}" || fail "target SHA is not available after fetch: \${target_sha}"

if [ "$dry_run" = "true" ]; then
  log "dry run passed: topology, sudo, Node, git target, and artifact contract inputs are valid"
  log "would build with GITHUB_SHA=\${target_sha} VITE_AGENTIC_BACKEND_URL=\${backend_url}"
  log "would restart \${backend_service}, then \${worker_service}"
  rollback_hint "$previous_sha"
  exit 0
fi

rollback_dir=".deploy"
mkdir -p "$rollback_dir"
rollback_file="\${rollback_dir}/last-deploy.json"
backend_state_before="$(systemctl is-active "$backend_service" || true)"
worker_state_before="$(systemctl is-active "$worker_service" || true)"
artifact_state_before="missing"
if [ -s "$server_artifact" ]; then
  artifact_state_before="present"
fi

cat > "$rollback_file" <<META
{
  "previous_sha": "\${previous_sha}",
  "target_sha": "\${target_sha}",
  "backend_service": "\${backend_service}",
  "worker_service": "\${worker_service}",
  "backend_state_before": "\${backend_state_before}",
  "worker_state_before": "\${worker_state_before}",
  "artifact_state_before": "\${artifact_state_before}",
  "captured_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
META
log "wrote rollback metadata: \${rollback_file}"

git switch --detach "$target_sha"

if [ ! -d node_modules ] || ! npm ls --depth=0 --silent >/dev/null 2>&1; then
  log "installing dependencies with npm ci"
  npm ci
else
  log "dependencies already satisfy npm ls --depth=0"
fi

log "building release artifact"
GITHUB_SHA="$target_sha" VITE_AGENTIC_BACKEND_URL="$backend_url" npm run build:release
GITHUB_SHA="$target_sha" VITE_AGENTIC_BACKEND_URL="$backend_url" npm run verify:release-artifact

log "restarting \${backend_service}"
sudo -n systemctl restart "$backend_service"
sleep 2
log "restarting \${worker_service}"
sudo -n systemctl restart "$worker_service"
sleep 2

if ! systemctl is-active --quiet "$backend_service"; then
  rollback_hint "$previous_sha"
  fail "\${backend_service} is not active after restart"
fi
if ! systemctl is-active --quiet "$worker_service"; then
  rollback_hint "$previous_sha"
  fail "\${worker_service} is not active after restart"
fi

health_body="$(curl -fsS http://127.0.0.1:8787/api/health)"
if ! grep -Fq '"ok":true' <<<"$health_body"; then
  printf '%s\n' "$health_body" >&2
  rollback_hint "$previous_sha"
  fail "backend health check did not return ok=true"
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
test -n "\${INGESTION_SERVICE_TOKEN:-}" || fail "INGESTION_SERVICE_TOKEN missing from \${env_file}"
queue_body="$(curl -fsS -H "x-service-token: \${INGESTION_SERVICE_TOKEN}" http://127.0.0.1:8787/api/ops/queue/health)"
if ! grep -Fq '"ok":true' <<<"$queue_body"; then
  printf '%s\n' "$queue_body" >&2
  rollback_hint "$previous_sha"
  fail "queue health check did not return ok=true"
fi

deployed_sha="$(git rev-parse HEAD)"
if [ "$deployed_sha" != "$target_sha" ]; then
  fail "deployed SHA mismatch: expected \${target_sha}, got \${deployed_sha}"
fi

log "deploy passed"
log "deployed_sha=\${deployed_sha}"
`;
}

function main() {
  const options = parseArgs(process.argv);
  const sha = resolveSha(options.sha);
  const remoteArgs = [
    options.host,
    'bash',
    '-s',
    '--',
    sha,
    options.repoDir,
    options.backendUrl,
    options.backendService,
    options.workerService,
    String(options.dryRun),
  ];

  console.log(`Oracle deploy ${options.dryRun ? 'dry-run' : 'run'} for ${sha}`);
  console.log(`Host: ${options.host}`);
  console.log(`Repo: ${options.repoDir}`);
  console.log(`Backend URL: ${options.backendUrl}`);

  const result = spawnSync('ssh', remoteArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: remoteScript(),
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
