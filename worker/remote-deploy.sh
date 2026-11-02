#!/usr/bin/env bash
# Runs ON THE VPS, sent by scripts/deploy-ai-worker.sh (docs/crm-v1/WORKER-IA.md): builds the image from
# /opt/cleads/ai/build, installs the Compose file, starts the new image, waits until it is healthy and rolls back to
# the previous image otherwise. Secrets stay in /opt/cleads/ai/worker.env and are never printed.
set -euo pipefail
TAG="$1"
APP=/opt/cleads/ai
cd "$APP"
umask 077

docker build --pull -t "cleads-ai-worker:$TAG" build
install -m 644 build/docker-compose.yml docker-compose.yml

if [ ! -f worker.env ]; then
  cat >worker.env <<'EOF'
# Secrets of the AI worker. Fill them from your computer with scripts/set-ai-worker-env.sh (values are never printed).
DATABASE_URL=
AI_GATEWAY_API_KEY=
EXTRACTOR_API_KEY=
NEXT_PUBLIC_PUSHER_APP_ID=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=
PUSHER_SECRET=
WORKER_CONCURRENCY=3
EOF
fi
# The Extractor's "crm" key is already on this server: copy it here, never over the network.
if ! grep -q '^EXTRACTOR_API_KEY=.' worker.env; then
  key="$(sed -n 's/^API_KEYS=//p' /opt/cleads/.env | tr ',' '\n' | sed -n 's/^crm://p' | head -n1)"
  if [ -n "$key" ]; then
    { grep -v '^EXTRACTOR_API_KEY=' worker.env; printf 'EXTRACTOR_API_KEY=%s\n' "$key"; } >worker.env.tmp
    mv worker.env.tmp worker.env
  fi
fi
chmod 600 worker.env

PREV="$(sed -n 's/^IMAGE_TAG=//p' .env 2>/dev/null || true)"
printf 'IMAGE_TAG=%s\n' "$TAG" >.env

if ! grep -q '^DATABASE_URL=.' worker.env; then
  echo "NOTICE: image cleads-ai-worker:$TAG prête, mais DATABASE_URL est vide dans $APP/worker.env."
  echo "        Lancez scripts/set-ai-worker-env.sh depuis votre poste, puis relancez le déploiement."
  exit 0
fi

docker compose config -q
docker compose up -d
for _ in $(seq 1 40); do
  id="$(docker compose ps -q ai-worker)"
  status="$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)"
  if [ "$status" = healthy ]; then
    echo "OK: cleads-ai-worker:$TAG en ligne"
    # Keep the three most recent images for a manual rollback.
    docker images cleads-ai-worker --format '{{.Tag}}' | tail -n +4 | xargs -r -I{} docker rmi -f "cleads-ai-worker:{}" >/dev/null 2>&1 || true
    rm -rf build
    exit 0
  fi
  [ "$status" = unhealthy ] && break
  sleep 3
done

echo "ERREUR: cleads-ai-worker:$TAG n'est pas devenu sain. Derniers journaux :" >&2
docker compose logs --tail=60 ai-worker >&2 || true
if [ -n "$PREV" ] && [ "$PREV" != "$TAG" ]; then
  printf 'IMAGE_TAG=%s\n' "$PREV" >.env
  docker compose up -d
  echo "Retour à cleads-ai-worker:$PREV" >&2
fi
exit 1
