# Worker IA (E18)

Le worker exécute les tâches longues des agents IA : audits, maquettes, et toute exécution qui ne tient pas dans une requête Netlify. Il tourne sur le VPS OVH, à côté de Cleads Extractor, et lit la même base PostgreSQL que le CRM (Railway). Architecture d'ensemble : [AGENTS-IA.md](AGENTS-IA.md).

## 1. Sur le serveur

```
VPS OVH (Debian 13, 2 vCPU, 4 Go)
 ├─ /opt/cleads         projet Compose « cleads »     Extractor : caddy, api, worker, postgres
 └─ /opt/cleads/ai      projet Compose « cleads-ai »  ai-worker ──► réseau cleads_default ──► api:8080/mcp
                                                          └──► Internet : base Railway (TLS), AI Gateway, Pusher
```

- **Projet Compose séparé** : les déploiements de l'Extractor (`docker compose up --remove-orphans` dans `/opt/cleads`) ne touchent jamais le worker IA.
- **Réseau** : le worker rejoint le réseau de l'Extractor pour joindre son MCP en local, sans passer par Internet.
- **Aucun port publié**.

| Fichier | Rôle |
|---|---|
| `/opt/cleads/ai/docker-compose.yml` | le service, copié depuis `worker/compose.yml` à chaque déploiement |
| `/opt/cleads/ai/.env` | `IMAGE_TAG` seulement (image en service) |
| `/opt/cleads/ai/worker.env` | les secrets, `chmod 600`, jamais écrasés par un déploiement |

## 2. La file

La file est la **table `AgentRun`** elle-même :
- **Pas d'orphelin** : le CRM crée l'exécution `QUEUED` dans la transaction qui réserve son budget, donc aucune tâche ne peut se perdre entre les deux.
- **Pas de double prise** : le worker prend la suivante avec `FOR UPDATE SKIP LOCKED`, par priorité puis par ancienneté, et deux workers ne prennent jamais la même.
- **Bail** : le worker renouvelle un battement de cœur toutes les 20 s. Sans battement depuis 2 minutes, la maintenance remet l'exécution en file ; au bout de 3 tentatives, elle est abandonnée et son budget libéré.
- **Reprises** : une erreur passagère (fournisseur indisponible, base injoignable) relance l'exécution après 30 s, puis 60 s, puis 120 s. Les autres erreurs la terminent avec un message lisible, sans détail interne.
- **Une à la fois** : une seule exécution d'un même agent par fiche (index unique). La personne voit « cet agent travaille déjà sur cette fiche ».
- **Expiration** : une exécution que personne n'a prise en 24 heures expire au lieu de s'exécuter en retard.
- **Arrêt propre** : à l'arrêt, le worker laisse 25 s aux exécutions en cours, puis remet les autres en file sans compter la tentative.
- **Annulation** : une exécution annulée par une personne perd son bail ; le worker interrompt l'agent et ne réécrit pas son statut.

**Actions approuvées, au plus une fois.**
- Une action hors du CRM (email, recherche, lien) est marquée « commencée » avant de s'exécuter, puis « faite » avec son résultat.
- Si le worker s'arrête entre les deux, l'action n'est jamais rejouée : l'exécution échoue avec le message « a peut-être déjà été faite, vérifiez avant de la relancer ».
- Une approbation remet l'exécution en tête de file. L'agent reprend avec le résultat de l'action, qu'il ne redemande pas.

**Agents.** Chaque epic métier (E20 à E25) enregistre le code de son agent (`registerAgentHandler`, dans `worker/main.ts`), et le worker ne prend que les agents qu'il connaît. Sont branchés : l'Auditeur digital (`auditor`, E20), le Conseiller offres (`offers`, E21), le Rédacteur outreach (`writer`), l'Analyste réponses (`replies`, E22), le Designer web (`designer`, E23), le Stratège marché (`strategist`) et l'Analyste qualification (`qualifier`, E25). Le champ `agents` de `/healthz` les liste. Le Stratège et le tri tournent un à la fois chacun.

**Tâches** (E19, E27). Une tâche est un travail que n'importe quel agent peut faire, reconnu au champ `kind` de l'entrée de l'exécution. Elle est enregistrée avec `registerTaskHandler`. Il y en a deux :
- le **test d'un skill sur une fiche** (`skill_test`, `features/ai/skill-test.ts`) ;
- l'**évaluation d'un agent** (`evaluation`, `features/quality/run.ts`) : ses cas tournent les uns après les autres, quelques-uns à la fois pour les décisions, dans le Chromium du worker pour les captures et les pages. Elle passe après le vrai travail (priorité −1) mais occupe une place de l'agent tant qu'elle tourne.
- Le worker prend une exécution si c'est un agent qu'il connaît, ou si c'est une tâche qu'il connaît, pour un agent qui a une place libre.
- Les autres exécutions restent en file.
- Le champ `tasks` de `/healthz` liste les tâches connues.

**Missions** (E28, `features/missions/engine.ts`). Une mission est un plan lancé d'un clic dans le CRM ([AGENTS-IA.md](AGENTS-IA.md), section 17). Le worker la mène à côté des exécutions, deux à la fois au plus :
- **Prise** : à chaque tour de boucle, il prend une mission en cours dont l'heure de réveil (`wakeAt`) est passée, avec `FOR UPDATE SKIP LOCKED`, et la garde par un bail de 5 minutes, renouvelé entre les étapes. Une mission dont le worker s'est arrêté est reprise à l'expiration de son bail.
- **Un passage** recharge la personne avec ses droits du moment, regarde où en est ce que les étapes attendent (recherche, exécution, tri de Jev, validation), puis lance les étapes qui peuvent partir. Chacune est marquée « en cours » avant de s'exécuter : un worker qui s'arrête au milieu la laisse « peut-être faite », et la mission se met en pause au lieu de la refaire.
- **Aucune attente longue** : une étape lance son travail (recherche sur l'Extractor, exécution d'un spécialiste) et la mission est rendue. Elle est réveillée par le webhook de l'Extractor, la fin d'une de ses exécutions ou une décision sur sa validation, et relue chaque minute de toute façon.
- **Erreurs** : une erreur passagère (Extractor ou base injoignable) relance l'étape après 1, puis 2 minutes ; au-delà, ou pour toute autre erreur, la mission se met en pause avec la raison, et la personne la reprend ou l'annule.
- **Actions validées** : une étape qui contacte un prospect attend dans une exécution du copilote (tâche `mission_action`, sans plafond réservé). Une fois validée, le worker l'exécute comme toute action approuvée, au plus une fois, puis la mission continue.
- **Arrêt propre** : le passage en cours finit son étape et rend la mission.
- Le champ `missions` de `/healthz` compte les passages en cours.

**Registre** (E30, `features/signals/engine.ts`, [ENRICHISSEMENT.md](ENRICHISSEMENT.md)). Le worker fait, une tâche à la fois, ce qui vient du BODACC et de l'annuaire des entreprises : sources publiques gratuites, sans clé ni modèle.
- **Ordre de prise** : d'abord une veille de campagne due (7 h 30, heure de Paris, ou dans la minute après son activation), puis le balayage du matin de l'espace, puis 25 entreprises à chercher dans l'annuaire.
- **Verrou** : chaque prise passe par `FOR UPDATE SKIP LOCKED` et un verrou de 15 minutes (30 pour le balayage). Un worker arrêté rend la main, et les entreprises qu'il n'a pas cherchées retournent dans la file.
- **Rythme** : une recherche dans l'annuaire toutes les 200 ms (l'annuaire en admet 7 par seconde et par adresse). S'il n'y a rien à faire, la boucle regarde de nouveau dans une minute (`signalsEveryMs`).
- **Erreurs** : un BODACC qui ne répond pas fait réessayer la veille ou le balayage une heure plus tard, sans perdre de jour.
- **Journal** : `registry work` (type et chiffres) ou `registry work failed`.

**Enquêteur** (E30 lot 2, `features/research/`, [ENRICHISSEMENT.md](ENRICHISSEMENT.md)). Un agent comme les autres, dans la file `AgentRun`, deux exécutions à la fois au plus. Son travail est choisi par le champ `job` de l'entrée :
- `people` : décideurs et comptes sociaux, d'une fiche ou de dix fiches d'une campagne ;
- `geo` : la sonde GEO d'une fiche ;
- `brief` : le brief d'un rendez-vous (`meetingId`) ou d'une fiche.

Ses recherches passent par la passerelle IA (clé `AI_GATEWAY_API_KEY`, aucune autre). Les sondes du jour et les briefs du lendemain sont mis en file par la tâche horaire des rappels de Vercel, en exécutions planifiées (sans quota personnel) : un worker arrêté les trouve en file à son retour.

**Maintenance** (toutes les 30 s ; un verrou consultatif la réserve à un seul worker s'il y en a plusieurs) :
- reprises et abandons ;
- exécutions interrompues pendant une requête du CRM ;
- expirations des exécutions et des validations ;
- nettoyage des workers disparus ;
- alerte aux propriétaires au-delà de 3 échecs en 15 minutes, une fois par heure au plus ;
- rattrapage du classement des réponses (E22) : les réponses d'une personne restées sans classement ni suggestion depuis plus de 2 minutes, sur 7 jours, sont remises en file, 10 fiches au plus par passage. Une fiche qui vient d'avoir une exécution attend 30 minutes ;
- Studio Web (E23) : les jetons PageSpeed de plus de 15 minutes sont effacés, et le contenu des maquettes arrivées à échéance (90 jours) est supprimé, 20 maquettes au plus par passage ;
- copilote (E24) : les conversations sans message depuis 90 jours sont supprimées. Les tours du copilote s'exécutent dans le CRM, pas dans le worker ; un tour interrompu sans le dire est marqué en échec au bout de 10 minutes, comme toute exécution faite pendant une requête ;
- missions (E28) : les plans proposés et pas lancés depuis 24 heures expirent, et les passages dus des missions récurrentes partent (20 au plus par passage de maintenance).

**Navigateur** (E23). Le Designer rend ses maquettes dans Chromium, le *headless shell* installé par Playwright dans l'image (`worker/browser.ts`) :
- un navigateur par exécution, fermé à la fin ;
- coupé du réseau : la page et ses images sont servies depuis la mémoire sous une adresse réservée (`.invalid`), toute autre requête est refusée ;
- lancé sans le bac à sable de Chromium, que le conteneur ne permet pas (pas d'espaces de noms utilisateur) : il ne rend que nos pages, nettoyées et sans réseau ;
- il prépare aussi les images du prospect (décodage, redimensionnement, WebP) et lit les couleurs du logo ;
- avant les captures, toutes les images sont chargées et décodées : une image chargée en différé sous le premier écran restait blanche dans une capture pleine page (premier essai réel) ;
- `playwright-core` et `axe-core` ne sont pas dans le paquet : l'image les installe, aux versions du `package.json`.

## 3. Temps réel et Extractor

- **Temps réel** : le worker annonce chaque changement d'une exécution sur le canal Pusher privé de la personne. Réglages › IA se recharge alors ; sans Pusher, la page interroge toutes les 10 s.
- **Correctif de sécurité** : la route `/api/pusher/auth` n'autorise plus que le canal de la personne connectée. Avant, n'importe quel membre pouvait s'abonner au canal d'un autre.
- **Notifications** : la cloche écoute le même canal (événement `notification`).
  - Le CRM et le worker y publient chaque notification une fois enregistrée : visite d'une maquette, fin d'une recherche, alertes de budget et d'échecs du worker, formulaire de contact. Sans Pusher, elle apparaît au prochain chargement de la page.
  - Correctif du 2 novembre 2026 : la cloche écoutait un canal nommé d'après l'email, que `/api/pusher/auth` refusait (403 sur chaque page), et rien n'y était publié. Les notifications n'apparaissaient qu'après un rechargement.
- **MCP de l'Extractor** (`features/ai/extractor-mcp.ts`) :
  - outils en lecture seulement : `list_sectors`, `search_prospect_base`, `get_business`, `get_job`, `get_job_results`, `get_system_health` ;
  - réservés aux personnes qui ont le droit `search:run` ;
  - chaque appel est enregistré comme étape de l'exécution ;
  - lancer une recherche reste un service du CRM.
- **API de l'Extractor** (E28) : les missions lancent, suivent et importent leurs recherches par le service de recherche du CRM, qui appelle l'API de l'Extractor sur le réseau local (`EXTRACTOR_URL=http://api:8080`, fixé dans `compose.yml`), avec la même clé que le MCP.

## 4. Sécurité et performance

- **Conteneur** :
  - système de fichiers en lecture seule, `/tmp` en mémoire, aucune capability, `no-new-privileges` ;
  - limites : 1 Go, 1 CPU, 512 processus (Chromium compte ses fils), `/tmp` de 512 Mo ;
  - utilisateur `node`, pas root ;
  - journaux limités à 5 × 10 Mo ;
  - santé vérifiée sur la boucle locale (`/healthz` en `127.0.0.1`).
- **Secrets** :
  - saisis par le propriétaire avec `scripts/set-ai-worker-env.sh` : saisie masquée, envoi par SSH, rien sur le poste ni dans les journaux ;
  - la clé `crm` de l'Extractor est recopiée sur le serveur même, sans transiter par le réseau.
- **Déploiement** : compte `deploy` (Docker seulement, pas de sudo) et empreinte du serveur épinglée.
- **Base** :
  - TLS vers Railway (`sslmode=require`) ;
  - pool limité (`connection_limit=5`). Les écritures d'étapes y attendent jusqu'à 15 s une connexion libre, puis réessaient : des appels parallèles ne perdent plus leur coût (5 novembre 2026) ;
  - recommandé : le rôle dédié de [`worker/db-role.sql`](../../worker/db-role.sql), qui lit et écrit les lignes mais ne peut pas modifier le schéma (les migrations restent au build Netlify).
- **Heures en SQL** : elles viennent toujours de l'application (`lib/ai/sql.ts`), jamais de `NOW()`. Prisma enregistre l'heure UTC dans des colonnes sans fuseau, alors que `NOW()` suit le fuseau de la session. Bug trouvé et corrigé pendant E18, sur une base réglée en heure de Paris.
- **Charge** :
  - la file est interrogée toutes les 3 s au repos, toutes les 0,5 s quand il y a du travail ;
  - 3 exécutions à la fois au plus, dont 1 maquette et 2 audits ;
  - une maquette prend 3 à 8 minutes, surtout l'écriture de la page par le modèle ; le rendu prend environ une seconde par passage ;
  - l'image passe d'environ 400 Mo à 1,3 Go avec Chromium, ses bibliothèques et ses polices ;
  - la file a son propre index.

## 5. Mise en route

1. *(Recommandé)* Créer le rôle dédié sur Railway, avec l'URL propriétaire de la base. Le mot de passe est généré sur ton poste :
   ```bash
   psql "<URL propriétaire Railway>" -v password="$(openssl rand -base64 32 | tr -d '/+=')" -f worker/db-role.sql
   ```
2. Renseigner les secrets du worker. `DATABASE_URL` est l'URL **publique** de Railway (onglet *Connect*), suivie de `?sslmode=require&connection_limit=5` :
   ```bash
   scripts/set-ai-worker-env.sh
   ```
3. Déployer. L'image est construite sur le serveur, démarrée et contrôlée ; elle revient à l'image précédente si elle n'est pas saine :
   ```bash
   scripts/deploy-ai-worker.sh
   ```
   Le script empaquette le code **de la branche ouverte** dans `cleads-main` : on déploie depuis `main`, une fois la PR fusionnée. Le paquet (`worker/build.mjs`) refuse tout ce qui chargerait Next : `next/server` empaqueté fait tomber le worker au démarrage (3 novembre 2026). Un service que le worker charge importe donc `AuthError` de `lib/auth/errors.ts`, jamais `lib/auth/guard.ts` ; le message d'erreur du paquet donne le chemin d'import à couper.
4. Vérifier dans Réglages › IA : « Worker IA en ligne ».

## 6. Exploitation

| Besoin | Commande (sur le serveur, dans `/opt/cleads/ai`) |
|---|---|
| État et santé | `docker compose ps` |
| Journaux (JSON) | `docker compose logs -f --tail=100 ai-worker` |
| Redémarrer | `docker compose restart ai-worker` |
| Revenir à une image précédente | `docker images cleads-ai-worker`, puis `IMAGE_TAG=<tag>` dans `.env` et `docker compose up -d` (les 3 dernières images sont gardées) |
| Changer un secret | depuis ton poste : `scripts/set-ai-worker-env.sh`, puis `scripts/deploy-ai-worker.sh` |

| Variable (`worker.env`) | Rôle |
|---|---|
| `DATABASE_URL` | base Railway du CRM (rôle dédié, TLS, pool de 5) |
| `AI_GATEWAY_API_KEY` | passerelle IA ; sans elle, les appels de modèles échouent proprement |
| `GOOGLE_PAGESPEED_API_KEY` | audits (E20) : scores PageSpeed et captures ; sans elle, l'audit est partiel (ni vitesse ni analyse des captures) |
| `EXTRACTOR_API_KEY` | clé `crm` de l'Extractor, copiée sur le serveur |
| `NEXT_PUBLIC_PUSHER_APP_ID`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`, `PUSHER_SECRET` | temps réel ; facultatives (sinon les pages interrogent) |
| `WORKER_CONCURRENCY` | exécutions simultanées, 3 par défaut |
| `META_ADS_TOKEN` | facultative (E30 lot 3) : jeton utilisateur de l'app Meta « cleads », valable 60 jours, pour lire la bibliothèque publicitaire. Sans elle, les publicités ne sont pas relues et la fiche le dit. Il se pose seul avec `scripts/set-ai-worker-env.sh META_ADS_TOKEN` ; Cleads prévient les propriétaires 7 jours avant son échéance ([ENRICHISSEMENT.md](ENRICHISSEMENT.md)). |
| `EXTRACTOR_WEBHOOK_SECRET` | facultative (E28) : la même que celle du CRM. L'Extractor prévient alors le CRM de la fin d'une recherche lancée par une mission, qui reprend aussitôt et notifie la personne ; sans elle, la mission relit sa recherche chaque minute. |
| `NEXT_PUBLIC_APP_URL` | adresse publique du CRM, pour les liens que le worker écrit (lien de réservation d'une réponse, E22). Elle est fixée dans `compose.yml` (`https://cleads.fr` par défaut) et peut être changée par `APP_URL` dans le `.env` du serveur. |
| `STUDIO_PREVIEW_HOST` | hôte des aperçus du Studio (E23), où PageSpeed mesure chaque nouvelle version. Fixé dans `compose.yml` (`apercu.cleads.fr` par défaut), modifiable par `PREVIEW_HOST` dans le `.env` du serveur. |

## 7. Pas encore

- **Déploiement** : il se fait par script depuis un poste. L'automatisation par GitHub Actions viendra avec E14.
- **Agents métier** : l'Auditeur (E20), le Conseiller offres (E21), le Rédacteur et l'Analyste réponses (E22), le Designer web (E23), le Stratège et l'Analyste qualification (E25) sont branchés.
