# Migration de Netlify vers Vercel

Cleads est une application Next.js standard : le code tourne tel quel sur Vercel. Ce qui tenait à Netlify :

| Netlify | Vercel |
|---|---|
| `netlify/functions/mailbox-poll.mts` et `sequence-run.mts` (toutes les 5 minutes, POST) | `crons` dans `vercel.json` : Vercel appelle les mêmes routes en GET, avec `Authorization: Bearer CRON_SECRET` |
| `[[cron]]` horaire de `netlify.toml` vers `/api/cron/meeting-reminders` | Rien pour l'instant : ce bloc n'est pas une option Netlify, ces rappels ne tournaient sans doute pas. Les activer = une ligne dans `vercel.json` (voir plus bas) |
| `npm run build` : migrations sur la base de chaque déploiement, aperçus de PR compris | `npm run vercel-build` : migrations en production seulement ; un aperçu migre sa propre base quand `MIGRATE_PREVIEW_DATABASE=1` |
| Redirection `apercu.cleads.fr` dans `netlify.toml` | La réécriture par hôte de `next.config.mjs` suffit |
| `@netlify/plugin-nextjs`, `SECRETS_SCAN_OMIT_KEYS`, `included_files` | Sans objet |

**Jamais deux envois à la fois.** Les routes `/api/cron/*` répondent ainsi :
- en GET (Vercel Cron), elles ne travaillent que si `CRON_RUNNER=vercel` ;
- en POST sur Vercel (les fonctions de Netlify, si elles appellent encore cleads.fr après la bascule), elles ne font rien.

Tant que `CRON_RUNNER` n'est pas posé, Vercel peut donc être déployé et testé à côté de Netlify sans rien envoyer.

## 1. Préparer (sans coupure)
1. **Plan Pro** sur Vercel : l'offre gratuite est réservée à un usage personnel non commercial et n'admet qu'un cron par jour (le déploiement refuserait nos crons toutes les 5 minutes).
2. **Nouveau projet** : importer le dépôt GitHub `infinitydev4/cleads`. `vercel.json` fixe le framework et la commande de build.
3. **Région des fonctions** (Settings › Functions) : la plus proche de la base Railway, pour garder des pages rapides.
4. **Variables d'environnement**, reprises de Netlify (Site configuration › Environment variables), en distinguant Production et Preview :

   | Variable | Production | Preview |
   |---|---|---|
   | `DATABASE_URL` | la base de production | **une autre base** (copie de travail), jamais la production |
   | `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://cleads.fr` | ne pas définir (NextAuth prend l'adresse de l'aperçu) |
   | `NEXTAUTH_SECRET` | la même qu'aujourd'hui (les sessions en cours restent valides) | une autre |
   | `CRON_SECRET` | la même | — |
   | `CRON_RUNNER` | **ne pas définir avant la bascule** | — |
   | `MIGRATE_PREVIEW_DATABASE` | — | `1`, une fois la base d'aperçu en place |
   | Les autres | reprises telles quelles : `AI_GATEWAY_API_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET_NAME` (Vercel refuse les noms `AWS_*`), `EXTRACTOR_URL`, `EXTRACTOR_API_KEY`, `EXTRACTOR_MCP_URL`, `EXTRACTOR_WEBHOOK_SECRET`, `GOOGLE_PAGESPEED_API_KEY`, `MAILBOX_SECRET_KEY`, `MAIL_FROM`, `MAIL_PROVIDER`, `MEETING_LINK_SECRET`, `NEXT_PUBLIC_PUSHER_APP_ID`, `NEXT_PUBLIC_PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_KEY`, `PUSHER_SECRET`, `OUTREACH_LINK_BASE_URL`, `OUTREACH_LINK_SECRET`, `OUTREACH_PROTECTED_DOMAINS`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_REGION`, `SES_CONFIGURATION_SET`, `SES_SNS_TOPIC_ARN`, `STUDIO_PREVIEW_HOST`, `STUDIO_PREVIEW_SECRET` | selon besoin |

5. **Premier déploiement**, puis essai sur l'adresse `*.vercel.app` : connexion, une fiche, une page des Réglages. Les crons s'appellent mais répondent « pas encore basculées » (202).
6. **Domaines** (Settings › Domains) : ajouter `cleads.fr`, `www.cleads.fr` et `apercu.cleads.fr` ; Vercel indique les enregistrements DNS. La veille de la bascule, baisser le TTL des enregistrements actuels (5 minutes).

## 2. Basculer (le même quart d'heure)
1. Chez le registrar, remplacer les enregistrements DNS par ceux de Vercel.
2. Dans Vercel, ajouter `CRON_RUNNER=vercel` (Production) et redéployer.
3. Dans Netlify, arrêter le site (Site configuration › Build & deploy › Stop builds, puis désactiver les fonctions planifiées en supprimant le site après la période de repli).
4. Vérifier : `https://cleads.fr/auth/login`, une connexion, `/.well-known/oauth-authorization-server`, et dans Vercel › Cron Jobs les deux tâches en succès (« Run » pour les lancer à la main).

Rien ne change pour le connecteur Claude, les jetons MCP, les webhooks et le worker du VPS : le domaine reste `cleads.fr`.

## 3. Après
- Garder Netlify une semaine comme repli (remettre les anciens DNS suffit, en retirant `CRON_RUNNER`).
- Puis supprimer `netlify.toml` et `netlify/functions/` du dépôt : fait le 5 novembre 2026. Les routes `/api/cron/*` n'acceptent plus que le GET de Vercel Cron (un POST reçoit 405).
- **Rappels de rendez-vous** : activés le 4 novembre 2026 (cron horaire dans `vercel.json`). Ils écrivent au contact et au closer 24 h avant un rendez-vous, une fois chacun.
