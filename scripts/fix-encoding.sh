#!/bin/bash

# Nettoyer le cache Next.js
rm -rf .next
rm -rf node_modules/.cache

# Trouver et nettoyer tous les fichiers JavaScript et TypeScript
find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.tsx" \) -not -path "./node_modules/*" -not -path "./.next/*" | while read -r file; do
  echo "Nettoyage de $file"
  # Convertir en UTF-8 sans BOM
  iconv -f UTF-8 -t UTF-8 -c "$file" > "${file}.tmp"
  mv "${file}.tmp" "$file"
done

# Réinstaller les dépendances
npm install

# Reconstruire le projet
npm run build 