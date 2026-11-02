#!/usr/bin/env bash
# Deploys the AI worker on the VPS (docs/crm-v1/WORKER-IA.md): bundles it here, sends a small build context over SSH
# (the deploy account, host key pinned), and lets worker/remote-deploy.sh build, start and health-check it there,
# rolling back to the previous image if the new one is not healthy.
#
# Needs, in ${CLEADS_SECRETS_DIR:-~/.config/cleads}: vps.env (VPS_HOST, VPS_DEPLOY_USER), deploy_ed25519, known_hosts
# (the same files as the Extractor's deployment).
set -euo pipefail
cd "$(dirname "$0")/.."

DIR="${CLEADS_SECRETS_DIR:-$HOME/.config/cleads}"
HOST="$(sed -n 's/^VPS_HOST=//p' "$DIR/vps.env" | tail -n1)"
DEPLOY_USER="$(sed -n 's/^VPS_DEPLOY_USER=//p' "$DIR/vps.env" | tail -n1)"
SSH=(ssh -i "$DIR/deploy_ed25519" -o UserKnownHostsFile="$DIR/known_hosts" -o StrictHostKeyChecking=yes -o BatchMode=yes "$DEPLOY_USER@$HOST")

TAG="$(git rev-parse --short HEAD)"
git diff --quiet HEAD -- worker features lib prisma || TAG="$TAG-dirty"

WORKER_VERSION="$TAG" npm run -s worker:build

CTX="$(mktemp -d)"
trap 'rm -rf "$CTX"' EXIT
cp worker/Dockerfile "$CTX/Dockerfile"
cp worker/compose.yml "$CTX/docker-compose.yml"
cp prisma/schema.prisma "$CTX/schema.prisma"
cp -R worker/dist "$CTX/dist"
PRISMA_VERSION="$(node -p 'require("@prisma/client/package.json").version')"
# E23: the Studio's browser and accessibility checker, at the versions the bundle was tested with.
PLAYWRIGHT_VERSION="$(node -p 'require("playwright-core/package.json").version')"
AXE_VERSION="$(node -p 'require("axe-core/package.json").version')"
printf '{"name":"cleads-ai-worker","private":true,"dependencies":{"@prisma/client":"%s","prisma":"%s","playwright-core":"%s","axe-core":"%s"}}\n' "$PRISMA_VERSION" "$PRISMA_VERSION" "$PLAYWRIGHT_VERSION" "$AXE_VERSION" >"$CTX/package.json"

echo "→ envoi de cleads-ai-worker:$TAG vers $HOST"
tar -C "$CTX" -czf - . | "${SSH[@]}" 'set -e; mkdir -p /opt/cleads/ai; rm -rf /opt/cleads/ai/build; mkdir /opt/cleads/ai/build; tar -xzf - -C /opt/cleads/ai/build'
"${SSH[@]}" "bash -s -- '$TAG'" <worker/remote-deploy.sh
