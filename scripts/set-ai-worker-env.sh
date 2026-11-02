#!/usr/bin/env bash
# Sets the AI worker's secrets on the VPS (docs/crm-v1/WORKER-IA.md). Run it yourself, in your own terminal: each value
# is typed hidden, sent over SSH and written to /opt/cleads/ai/worker.env (chmod 600). Nothing is printed or stored on
# this computer. Leave a value empty to keep the current one.
set -euo pipefail

DIR="${CLEADS_SECRETS_DIR:-$HOME/.config/cleads}"
HOST="$(sed -n 's/^VPS_HOST=//p' "$DIR/vps.env" | tail -n1)"
DEPLOY_USER="$(sed -n 's/^VPS_DEPLOY_USER=//p' "$DIR/vps.env" | tail -n1)"
SSH=(ssh -i "$DIR/deploy_ed25519" -o UserKnownHostsFile="$DIR/known_hosts" -o StrictHostKeyChecking=yes -o BatchMode=yes "$DEPLOY_USER@$HOST")

cat <<'EOF'
Secrets du worker IA (saisie masquée ; Entrée sans rien = valeur inchangée).

DATABASE_URL : l'URL PUBLIQUE de la base Railway (onglet Connect, « Public Network »), avec à la fin
               ?sslmode=require&connection_limit=5   (ou &sslmode=… si l'URL a déjà des paramètres)
               Idéalement le rôle dédié de worker/db-role.sql plutôt que le propriétaire de la base.
GOOGLE_PAGESPEED_API_KEY : clé gratuite de l'API PageSpeed Insights (Google Cloud), pour les audits (E20).
EOF

payload=""
for name in DATABASE_URL AI_GATEWAY_API_KEY GOOGLE_PAGESPEED_API_KEY NEXT_PUBLIC_PUSHER_APP_ID NEXT_PUBLIC_PUSHER_KEY NEXT_PUBLIC_PUSHER_CLUSTER PUSHER_SECRET; do
  read -r -s -p "$name : " value
  echo
  if [ -n "$value" ]; then
    case "$value" in *$'\n'* | *' '*) echo "  valeur refusée (espace ou retour à la ligne)"; exit 1 ;; esac
    payload+="$name=$value"$'\n'
  fi
done
[ -n "$payload" ] || { echo "Rien à changer."; exit 0; }

printf '%s' "$payload" | "${SSH[@]}" 'set -e
cd /opt/cleads/ai
umask 077
touch worker.env
while IFS= read -r line; do
  [ -n "$line" ] || continue
  key="${line%%=*}"
  { grep -v "^$key=" worker.env || true; printf "%s\n" "$line"; } > worker.env.tmp
  mv worker.env.tmp worker.env
done
chmod 600 worker.env
echo "worker.env mis à jour sur le serveur."'
echo "Ensuite : scripts/deploy-ai-worker.sh"
