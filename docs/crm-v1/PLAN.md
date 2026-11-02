# CRM Cleads V1 — audit, périmètre et plan d'epics

> Document de cadrage. Rien n'a été supprimé ni modifié dans le code : ce plan attend vos arbitrages (section 1).
> Sources : lecture du code de `cleads-main` (≈ 48 000 lignes TS/TSX), de `audit.md` (5 août 2026, partiellement périmé : le projet est passé à Next 16 / React 19), de la home-v2, et de l'API Cleads Extractor déjà en production.
> **Mise à jour du 2 novembre 2026** : couche agentique IA décidée (D13 à D27 en section 1, section 10 réécrite), epics E17 à E27 et jalons M6 à M10 (section 12). Architecture de référence : [AGENTS-IA.md](AGENTS-IA.md).

---

## 0. En une page

**Cap.** Un CRM de prospection → qualification → conversion, utilisé par une petite équipe (propriétaire, manager, SDR, closers), alimenté par Cleads Extractor, qui envoie de la prospection à froid avec prudence. Chaque action passe par les mêmes services, ce qui permet de l'assister par une agence d'agents IA : audit des prospects, offres à proposer, rédaction, Studio Web (jalons M6 à M10, section 10).

**Constats clés de l'audit**
1. **Environ 25 000 lignes sur 48 000 n'ont plus de raison d'être** : pages publiques historiques (5 300), anciens composants d'accueil (4 800), blog IA + thèmes + générateurs d'images + RSS (12 800). Facturation (3 900) et portail client (2 500) sont à mettre de côté pour la V1.
2. **Les quatre failles critiques de l'audit disparaissent avec ce nettoyage ou la refonte** : `/api/test/create-user`, `/api/clients` sans authentification, clés AWS en `NEXT_PUBLIC_`, journaux d'identifiants.
3. **Le dépôt n'a pas de Git** et `.env` n'est pas dans `.gitignore` (seulement `.env*.local`). Supprimer 25 000 lignes sans historique est dangereux : **première action = `git init`, ignorer `.env`, commit de l'état actuel, tag de sauvegarde.**
4. **Le "client" actuel est un compte utilisateur** : la prise de rendez-vous publique crée un `User` avec mot de passe temporaire. Un CRM a besoin d'entités métier (entreprise, contact, prospect, opportunité), pas de comptes de connexion pour ses prospects. C'est le point de refonte le plus structurant.
5. **La home-v2 est un excellent modèle visuel mais pas réutilisable telle quelle** : 3 800 lignes de CSS Module propres à la page, avec ses propres couleurs. Il faut en extraire des **jetons de design** (couleurs, rayons, typographie, ombres) partagés avec le CRM.
6. **Le dashboard actuel utilise un autre vert** (`#BFFF00`) que la home-v2 (`#d7ff00`), un fond `gray-950`, et une page de réglages de 1 850 lignes : aucune cohérence à conserver.

**Ce que le CRM apportera concrètement**
- Lancer une recherche d'entreprises (secteur + zone) depuis le CRM, avec filtre « utiles » et import dédoublonné.
- Une file « Aujourd'hui » par SDR : qui contacter, avec quel message, quelles relances sont dues.
- Une qualification en quelques clics, un pipeline visuel, des rendez-vous attribués aux closers.
- Un tableau de bord par rôle avec l'entonnoir réel : importés → contactés → réponses → qualifiés → rendez-vous → gagnés.
- *(M6 à M10)* Des agents IA qui auditent chaque prospect, suggèrent les offres à lui proposer avec leurs preuves, rédigent des emails à relire et génèrent une landing de démonstration à montrer en rendez-vous.

---

## 1. Décisions à trancher (ma recommandation en premier)

| # | Question | Recommandation | Pourquoi |
|---|---|---|---|
| D1 | Une seule application ou un nouveau dépôt ? | **Même application Next**, groupes de routes `(public)`, `(auth)`, `(crm)` | Zéro migration d'infra ; la home-v2 reste intacte ; l'auth et la base existent. |
| D2 | URL du CRM | **`/app/*`** (ou `app.cleads.fr` plus tard) | Distinct de la landing, facile à bloquer dans `robots.txt`. |
| D3 | Multi-clients (SaaS) dès la V1 ? | **Non, mono-espace**, mais chaque table porte `workspaceId` | Coût marginal faible, évite une migration douloureuse si Cleads ouvre le CRM à des clients. |
| D4 | Pages légales | **Les conserver** (mentions légales, confidentialité, CGV, cookies), non listées dans le menu | Obligatoires (LCEN, RGPD) et déjà liées dans le pied de page. « Une seule page publique » s'applique aux pages marketing. |
| D5 | Page de réservation de rendez-vous | **Une page publique minimale `/rdv/[closer]`, `noindex`** | Les emails de prospection ont besoin d'un lien « choisir un créneau ». Ce n'est pas une page de contenu. |
| D6 | Facturation (devis, factures) | **Mise de côté** (étiquette Git), réintégrée en V1.1 comme « Devis » rattaché à une opportunité | Hors du cœur « prospecter → qualifier → convertir ». |
| D7 | Portail client `/client` | **Supprimé en V1** | Les contacts du CRM ne se connectent pas. À rouvrir si le besoin existe. |
| D8 | Authentification | **Migrer vers Auth.js v5**, invitation par email, pas d'inscription libre, 2FA en V1.1 | NextAuth v4 reste de la dette ; l'audit signale des vulnérabilités `@auth/core`. |
| D9 | Envoi à froid | **Domaine secondaire dédié + boîtes d'envoi réelles ; jamais depuis `contact@cleads.fr`** | Protège la délivrabilité de l'email transactionnel et du domaine principal (section 7). |
| D10 | Tâches de fond (envois, relances, lecture des réponses) | **Petit worker Node avec file dans PostgreSQL (`pg-boss`)**, hébergé sur le VPS OVH | Netlify ne tient ni IMAP ni les tâches longues. Le VPS existe déjà. |
| D11 | Version anglaise de la landing | **Garder le sélecteur, indexer le français seulement** | L'anglais est choisi via `localStorage` : aucune URL propre, invisible pour les moteurs et les IA (section 9). |
| D12 | Thème du CRM | **Clair par défaut**, thème sombre en V1.1 | La home-v2 est claire ; le sombre double le travail de recette. |

### Décisions IA (2 novembre 2026, validées)

Détails et conséquences techniques : [AGENTS-IA.md](AGENTS-IA.md).

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| D13 | Socle de la couche agentique | **AI SDK 7 + Vercel AI Gateway** | TypeScript natif (Next, zod), agents avec validation humaine intégrée, client MCP, Jev via `experimental_decide` ; une clé pour tous les fournisseurs, bascules automatiques, suivi des coûts. LangChain / LangGraph : lourd, pensé Python d'abord ; Mastra : une couche de plus alors que nos services doivent rester au centre. |
| D14 | Exécution des tâches longues des agents | **Worker Node sur le VPS OVH, file dans PostgreSQL** (réalise D10 ; mise en œuvre E18 : la table des exécutions sert de file, sans `pg-boss`) | Un audit (1 à 3 min) ou une maquette ne tient pas dans une fonction Netlify ; le VPS héberge déjà l'Extractor (MCP en réseau local). |
| D15 | Modèles | **Mix par rôle**, interchangeable dans les réglages : Jev (décider), Claude Haiku 5.5 (volume), Sonnet 5.5 (rédiger, analyser), Opus 5.5 (Studio, audit approfondi) | Le meilleur rapport qualité / coût par tâche ; aucun code métier ne nomme un modèle. |
| D16 | Données envoyées aux fournisseurs IA | **Fournisseurs hors UE autorisés avec garanties** : DPA, pas d'entraînement sur nos données, minimisation | Les meilleurs modèles sont américains ; le RGPD le permet avec des garanties et l'information des personnes. |
| D17 | Ordre | **Socle, puis audit + offres + email**, puis Studio, copilote et sourcing | Valeur immédiate pour SDR et closers ; l'audit nourrit tout le reste. |
| D18 | Autonomie des agents | **Les agents suggèrent, l'humain valide** tout ce qui sort du CRM | Email, recherche Extractor, lien envoyé au prospect : un clic de validation. Lectures, audits, brouillons, notes et enrichissement en autonomie. |
| D19 | Génération des landing pages | **Code libre généré par l'IA** (HTML + CSS statiques, sans JavaScript), avec boucle de qualité | Créativité maximale ; la boucle rendu → capture → critique → correction tient la qualité, l'absence de script tient la sécurité. |
| D20 | Partage des maquettes | **Lien privé expirant sur `apercu.cleads.fr`** (30 jours, non indexé) | L'en-tête `Content-Security-Policy: sandbox` donne à la page une origine opaque : ni cookie ni script, même sur un sous-domaine. |
| D21 | Catalogue d'offres | **V1 rédigée par Claude, validée par le propriétaire** dans un écran d'admin | La landing ne présente que des formules ; les agents ne recommandent que des offres actives. |
| D22 | Budget IA | **Moins de 100 € par mois**, plafond dur, alertes à 50 % et 80 % | Audits et maquettes à la demande ; pas de traitement en masse par défaut. |
| D23 | Sources des audits | **Gratuites et officielles** : site du prospect, PageSpeed Insights, annuaire des entreprises, données de l'Extractor | Aucun abonnement ; l'audit GEO porte sur ce que le site expose, sans interroger les moteurs IA. |
| D24 | Accès à l'IA | **Tous les rôles, avec un quota quotidien par personne** ; `VIEWER` en lecture | L'assistance sert d'abord aux SDR et aux closers. |
| D25 | Suivi des maquettes | **Visite du lien enregistrée** (date, nombre ; ni cookie ni pixel dans l'email), closer notifié | Rappeler au bon moment ; à mentionner dans la politique de confidentialité. |
| D26 | IA dans le QG 3D | **Deux nouveaux espaces** : « Agents IA » et « Studio Web » | La 3D reste fonctionnelle : agents à leur poste, validations, maquettes. |
| D27 | Extractor et agents | **MCP en lecture** pour les agents ; les écritures passent par le service CRM | Aucun job lancé pour un agent n'échappe au CRM, aux campagnes ni au journal. |

---

## 2. État des lieux de `cleads-main`

### 2.1 À garder
| Élément | Usage dans le CRM |
|---|---|
| `components/home-v2/*` + `app/page.tsx` | Landing, **intouchée**. Seul le formulaire d'audit change de destination (section 8). |
| Next 16, React 19, Prisma 6, PostgreSQL | Socle conservé. |
| Tailwind + shadcn/Radix (`components/ui`) | Primitives, **ré-habillées** avec les jetons home-v2. |
| `react-hook-form` + `zod`, `date-fns`, `sonner`, `motion`, `recharts` | Formulaires, dates, toasts, transitions, graphiques. |
| Concept `Availability` / `BreakTime` / `Exception` | Repris dans le nouveau module de rendez-vous. |
| Gabarits React Email (`components/emails`) | Emails transactionnels. |
| Resend | **Transactionnel uniquement** (invitation, réinitialisation, confirmation de rendez-vous). |

### 2.2 À supprimer (après sauvegarde Git)
| Bloc | Lignes ≈ | Remarque |
|---|---|---|
| Pages publiques : `about`, `services/*`, `realisations`, `tarifs`, `contact`, `blog`, `ebook`, `plan-du-site` | 5 300 | Redirections 301 (section 9). |
| Anciens composants : `components/home`, `sections`, `about`, `pricing`, `modal`, `forms`, `magicui`, `header`, `footer`, `mobile-*`, `whatsapp-button`, `stats-counter`, `ProjectCard`/`project-card` | 4 800 | Aucun n'est utilisé par la home-v2. |
| Blog, thèmes, génération IA texte et images, RSS, éditeur riche | 12 800 | Retire aussi OpenAI, Replicate, Hugging Face, Pexels, Cloudinary, `rss-parser`, TipTap, et les clés API stockées en clair en base. |
| `/api/test/create-user`, `/api/send`, `/api/ip`, `/api/pwa-manifest`, `/api/sitemap` | 300 | Routes à risque ou inutiles. |
| Suivi de conversion (`ConversionFunnel`, `TrackedButton`, `useConversionTracking`) | 400 | À reconstruire proprement, limité à la landing. |

### 2.3 À mettre de côté (étiquette Git, réintégration possible)
Facturation (devis, factures, PDF : 3 900 lignes) et portail client (2 500 lignes).

### 2.4 À refondre
- **Tableau de bord** (`app/dashboard/*`, mise en page, barre latérale).
- **Rendez-vous** (section 6).
- **Clients** → devient « Prospects / Entreprises / Contacts » (le modèle actuel confond utilisateur et client).
- **Notifications** : on garde le concept (table + préférences), on retire Pusher au profit d'un rafraîchissement par requête.
- **Réglages** : 1 851 lignes dans une seule page, à découper en sous-pages (profil, équipe, boîtes d'envoi, intégrations).

### 2.5 Dette technique repérée
- Selon l'audit du 5 août (chiffres à re-mesurer, le projet a évolué depuis) : 556 alertes ESLint et aucun test.
- Deux configurations Tailwind (`.js` et `.ts`), `README` générique ; l'audit signale aussi deux systèmes S3 (`lib/s3.ts` et la route d'upload).
- `Availability` lue avec `findFirst` **sans filtrer sur l'utilisateur** : un créneau peut venir de n'importe quel compte.
- Gestion des fuseaux horaires par décalages manuels (`getTimezoneOffset`).
- Une règle bloque toute nouvelle réservation si l'email, le téléphone, le nom **ou l'IP** existent déjà (bureau partagé = personne ne peut réserver).
- Le texte du rappel de rendez-vous passe par un cron Netlify appelé par `curl`.

---

## 3. Périmètre de la V1

### 3.1 Dedans
1. **Prospects** : entreprises + contacts, vues enregistrées, filtres, import CSV, détection de doublons, score de pertinence par règles.
2. **Recherche Cleads Extractor intégrée** : lancer, suivre, importer.
3. **File « Aujourd'hui »**, tâches, notes, appels, historique unifié par fiche.
4. **Qualification** guidée (champs choisis, pas de formulaire de 40 questions).
5. **Pipeline d'opportunités** en colonnes (glisser-déposer).
6. **Rendez-vous** refondus : disponibilités par closer, page de réservation, attribution, résultat du rendez-vous.
7. **Emailing** : envoi 1 à 1 depuis le CRM, modèles avec variables, désinscription, liste de suppression, quotas. Séquences automatiques en dernier jalon.
8. **Rôles et équipe** : invitation, désactivation, droits par rôle, journal d'audit.
9. **Tableaux de bord** par rôle.
10. **Capture inbound** : le formulaire d'audit de la landing crée un prospect.
11. **SEO / GEO** de la landing.

### 3.2 Dehors (V1.1 et après)
Facturation / devis, portail client, séquences multicanales (LinkedIn, téléphone automatisé), synchronisation bidirectionnelle Google Agenda, thème sombre, 2FA, application mobile, multi-espace commercial, agents IA autonomes (l'assistance IA validée par un humain arrive avec les jalons M6 à M10, section 10).

### 3.3 Mesure de succès (pour ne pas piloter à l'aveugle)
Entonnoir par semaine : prospects importés → contactés → réponses → qualifiés → rendez-vous tenus → gagnés. Délai moyen « import → premier contact ». Taux de rebond et de plainte. **Aucun objectif de taux de réponse n'est promis avant d'avoir mesuré sur un premier lot.**

---

## 4. Rôles et permissions

| Rôle | Pour qui | Périmètre de données |
|---|---|---|
| `OWNER` | Fondateur | Tout, y compris équipe, boîtes d'envoi, suppression de données |
| `MANAGER` | Responsable commercial | Tout voir et réattribuer ; pas de gestion des boîtes d'envoi ni de suppression définitive |
| `SDR` | Prospection et qualification | Ses prospects et le pool non attribué |
| `CLOSER` | Conversion | Ses rendez-vous et ses opportunités ; lecture des fiches liées |
| `VIEWER` | Associé, client en lecture | Lecture seule d'un périmètre choisi |
| `AGENT` *(E17)* | Exécutions IA planifiées, sans personne derrière (pas un compte de connexion) | Aucun droit nominatif : seulement les outils qui n'en demandent pas, journalisés, jamais d'envoi sans validation. Une exécution lancée par quelqu'un agit avec **ses** droits (délégation) |

| Action | OWNER | MANAGER | SDR | CLOSER | VIEWER |
|---|:-:|:-:|:-:|:-:|:-:|
| Voir tous les prospects | ✓ | ✓ | pool + siens | siens + liés | ✓ lecture |
| Créer / modifier un prospect | ✓ | ✓ | ✓ | siens | — |
| Lancer une recherche Extractor / importer | ✓ | ✓ | ✓ | — | — |
| Envoyer un email depuis une boîte | ✓ | ✓ | sa boîte | sa boîte | — |
| Créer / lancer une séquence | ✓ | ✓ | ✓ | — | — |
| Voir les campagnes (chiffres limités aux fiches visibles) *(E15)* | ✓ | ✓ | ✓ | ✓ | ✓ lecture |
| Créer / modifier une campagne, y ranger des fiches *(E15)* | ✓ | ✓ | ✓ | — | — |
| Déplacer une opportunité | ✓ | ✓ | jusqu'à « Qualifié » | siennes | — |
| Réserver / attribuer un rendez-vous | ✓ | ✓ | ✓ | siens | — |
| Voir les rapports | ✓ | ✓ | siens | siens | ✓ |
| Inviter / désactiver un membre | ✓ | — | — | — | — |
| Exporter les données, supprimer définitivement | ✓ | export seul | — | — | — |
| Lire le journal d'audit | ✓ | ✓ | — | — | — |
| Utiliser l'IA : audit, offres, brouillon, maquette, dans son quota *(E17)* | ✓ | ✓ | ✓ | ✓ | lecture des audits |
| Régler l'IA : modèles par rôle, plafonds *(E17)* | ✓ | — | — | — | — |
| Gérer les skills et le catalogue d'offres *(E19)* | ✓ | ✓ | — | — | — |

**Règles d'implémentation.** Un module unique `lib/rbac` définit la matrice ; chaque route et chaque action serveur passe par `requirePermission(user, "lead:update", resource)`. Jamais de contrôle uniquement côté interface. Les filtres de portée (« siens ») sont appliqués dans la requête, pas après coup. Le middleware actuel ne protège que le préfixe d'URL : il devient une première barrière, pas la seule. Les outils des agents IA passent par les mêmes contrôles, avec les droits de la personne qui a lancé l'exécution (section 10).

---

## 5. Modèle de données cible

```
Workspace ─┬─ Membership(user, role, active)            ← rôles, invitations
           ├─ Company(name, domain, siret?, sector, address, phone, website, source, externalId)
           │    └─ Contact(name, role, email, phone, emailKind: NOMINATIVE|GENERIC, consent/source, doNotContact)
           ├─ Lead(company, contact?, owner, status, score, sourceJobId?, qualification JSON)
           │      status: NEW · CONTACTED · REPLIED · QUALIFIED · DISQUALIFIED · DO_NOT_CONTACT
           ├─ Deal(lead, owner, stage, amount?, lostReason?, expectedCloseAt)   ← créé à la qualification
           │      stage: QUALIFIED · MEETING_SET · PROPOSAL · NEGOTIATION · WON · LOST
           ├─ Activity(lead|deal, actor(user|agent), kind: NOTE|CALL|EMAIL|MEETING|STATUS_CHANGE, body, at)
           ├─ Task(lead|deal, assignee, dueAt, doneAt)
           ├─ Meeting(host, lead|contact, startsAt UTC, endsAt, timezone, status, outcome, videoUrl, source)
           ├─ AvailabilityRule(host, weekday, start, end, timezone) · AvailabilityException(host, date, available)
           ├─ Mailbox(owner, address, provider, dailyCap, warmupDay, status)
           ├─ EmailTemplate · Sequence(steps) · SequenceEnrollment(lead, step, nextAt, stoppedReason)
           ├─ EmailMessage(mailbox, lead, direction, messageId, inReplyTo, status, sentAt, bounce?)
           ├─ Suppression(email|domain, reason, at)                              ← désinscriptions, rebonds, plaintes
           ├─ ImportBatch(source: EXTRACTOR|CSV|INBOUND, extractorJobId?, counts)
           ├─ SavedView(owner, entity, filters)
           └─ AuditLog(actor, action, entity, before/after, at)
```

**Principes**
- Dates stockées en UTC, avec le fuseau de l'hôte du rendez-vous.
- **Dédoublonnage** à l'import : identifiant Extractor stable, puis domaine, puis nom + téléphone. La logique de blocage existe déjà côté Extractor ; le CRM n'a qu'à ne pas créer de second prospect pour la même clé.
- Un contact `doNotContact` ou présent dans `Suppression` ne peut **pas** être inscrit dans une séquence : refus côté serveur, pas seulement masqué.
- `Activity.actorKind` accepte déjà `AGENT` : les actions des agents IA sont tracées comme telles. Les tables de la couche agentique (exécutions, validations, audits, offres, maquettes, skills, consommation) sont décrites dans [AGENTS-IA.md](AGENTS-IA.md).

**Migration de l'existant.** Exporter la base (dump) avant toute chose. Les `Appointment` deviennent des `Meeting` (+ `Contact` et `Lead` créés par email), les `User` de rôle `USER` deviennent des `Contact`, les `ADMIN` des membres `OWNER`. Les tables blog, thèmes, commentaires, planifications, réglages IA, partage de documents sont supprimées après export. Je n'ai pas accès à la base de production : le volume de données à migrer est inconnu.

---

## 6. Rendez-vous : refonte

| Aujourd'hui | Cible |
|---|---|
| Rendez-vous lié à un compte `User` créé automatiquement avec mot de passe temporaire | Rendez-vous lié à un `Contact` ; aucun compte créé |
| Types métier d'agence (`LANDING_PAGE`, `ECOMMERCE`, `SAAS`…) | `DISCOVERY`, `DEMO`, `FOLLOW_UP` ; le sujet vit dans les notes |
| Blocage si email, téléphone, nom **ou IP** existent déjà | Un rendez-vous actif par contact et par type, pas de blocage sur l'IP |
| Disponibilité lue sans filtre sur l'hôte | Règles par closer ; calcul des créneaux par **fonction pure testée** (dates en UTC, fuseaux IANA) |
| Décalages d'heure manuels | `date-fns-tz` ou `Temporal` ; tests sur les changements d'heure |
| Statuts `PENDING / CONFIRMED / CANCELLED / COMPLETED` | `SCHEDULED, CONFIRMED, COMPLETED, NO_SHOW, CANCELED, RESCHEDULED` + `outcome` (qualifié, à relancer, perdu) |
| Rappels par cron Netlify appelé par `curl` | Tâche planifiée du worker, rappel email au contact et au closer |
| Calendrier maison de 700 lignes | Vue agenda (semaine / jour) rebâtie sur les composants du CRM |

**Livrables** : agenda par closer, page publique `/rdv/[closer]` (noindex, rate-limitée), attribution manuelle puis tour de rôle (V1.1), annulation / report par lien signé, lien visio, résultat du rendez-vous obligatoire pour clôturer (alimente l'entonnoir), tests unitaires sur le calcul des créneaux (changement d'heure, pause, exception, rendez-vous qui se chevauchent).

---

## 7. Cold mailing : ce qui est possible, les limites, comment faire

### 7.1 Combien d'emails par jour ?

Je ne sais pas quel service héberge aujourd'hui `contact@cleads.fr` : Resend l'utilise pour **envoyer** (le domaine y est donc vérifié), mais la boîte de réception peut être chez Google, Microsoft, OVH ou un autre. **À me confirmer**, car les plafonds en dépendent.

| Moyen d'envoi | Plafond technique (à vérifier sur la page officielle du fournisseur) | Volume prudent pour du démarchage |
|---|---|---|
| Google Workspace payant | environ **2 000 messages par jour et par utilisateur** (500 en période d'essai) ; fenêtre glissante de 24 h ([sources](https://www.mailreach.co/blog/google-workspace-email-sending-limits)) | **20 à 40 par boîte et par jour** après chauffe |
| Resend gratuit | **100 par jour**, environ 3 000 par mois ([sources](https://wpmailsmtp.com/resend-review/)) | **0** : voir ci-dessous |
| Resend Pro | environ 50 000 par mois, sans plafond quotidien d'après les comparateurs | **0** pour le démarchage |

**Le plafond technique n'est pas la vraie limite.** La limite utile est la réputation : un domaine neuf ou une boîte qui envoie trop vite, trop identique, ou vers trop d'adresses invalides, finit en spam. Les ordres de grandeur d'usage courant dans le secteur sont de **30 à 50 emails par boîte et par jour** en régime établi. **Hypothèse de départ pour la V1 : 3 boîtes × 30 par jour ≈ 90 par jour (≈ 1 800 par mois ouvré)**, à ajuster sur les rebonds mesurés, pas sur une promesse.

### 7.2 Règles que je recommande de coder, pas seulement de documenter
1. **Ne jamais prospecter depuis `cleads.fr`.** Un domaine secondaire (par exemple une variante du nom ; la disponibilité est à vérifier) porte les boîtes de démarchage, redirige son site vers cleads.fr, et protège la réputation du domaine principal et des emails transactionnels.
2. **Resend est réservé au transactionnel.** Je n'ai pas pu lire la politique d'usage de Resend en entier, mais les tiers la décrivent comme interdisant le démarchage non sollicité : à vérifier avant tout essai ([politique](https://resend.com/legal/acceptable-use)).
3. **Authentification complète** sur chaque domaine d'envoi : SPF, DKIM, DMARC. Gmail et Yahoo les exigent pour les gros expéditeurs (au-delà de 5 000 messages par jour vers des adresses grand public) ; à notre échelle ce n'est pas obligatoire, c'est quand même la condition d'arriver en boîte de réception ([sources](https://powerdmarc.com/google-and-yahoo-email-authentication-requirements/)).
4. **Chauffe progressive** programmée par boîte (`warmupDay`) : quelques envois par jour au début, montée sur plusieurs semaines. Plafond quotidien dur dans `Mailbox.dailyCap`, appliqué par le worker.
5. **Désinscription** : lien dans chaque message **et** en-tête `List-Unsubscribe` (désabonnement en un clic, RFC 8058). Toute désinscription alimente `Suppression` et stoppe les séquences.
6. **Arrêt automatique** d'une séquence dès qu'une réponse arrive (détection par `In-Reply-To` / `Message-ID`), un rebond dur, une plainte ou une désinscription.
7. **Seuils d'alerte** affichés dans le tableau de bord : rebonds durs, plaintes. Les fournisseurs grand public visent une plainte sous 0,1 % et ne tolèrent pas 0,3 % ([sources divergentes](https://emaillistvalidation.com/blog/gmail-and-yahoo-bulk-sender-requirements-explained/), à confirmer dans Google Postmaster Tools). Au-delà d'un seuil, **pause automatique** de la boîte.
8. **Messages courts, sans pièce jointe**, un seul lien, pas de suivi d'ouverture par pixel pour le premier message.
9. **Vérification d'adresse** avant envoi (syntaxe, domaine, adresse générique ou nominative) ; les adresses génériques (`contact@`) sont marquées et traitées à part.

### 7.3 Cadre légal français (à faire valider par un juriste ou un DPO)
D'après les synthèses que j'ai trouvées (CNIL, cabinets, [CCI](https://www.entreprises.cci-paris-idf.fr/fiches-pratiques/prospection-commerciale-par-voie-electronique)), la prospection B2B par email peut s'appuyer sur l'**opposition** (pas de consentement préalable) si : le destinataire est visé **en tant que professionnel**, l'adresse est professionnelle, le **sujet est en rapport avec sa fonction**, l'expéditeur est identifié, et un moyen simple et gratuit de refuser est proposé dans chaque message. Points à valider :
- **adresses génériques** (`contact@`) : les avis divergent ;
- **entrepreneurs individuels** : traitement potentiellement plus protecteur ;
- **information de la personne** sur l'origine de ses données (ici : annuaire public et site de l'entreprise) dès le premier message ;
- **conservation** : durée et trace de la source et de la date de collecte.

Le CRM stocke pour chaque contact la source, la date et la base légale retenue, et propose l'export et l'effacement (droit d'accès et d'opposition). Voir aussi `cleads-extractor/docs/COMPLIANCE.md`.

### 7.4 Architecture d'envoi
- **Boîtes réelles** reliées en OAuth (Gmail API, Microsoft Graph) ou SMTP + IMAP : les messages partent de vraies boîtes, apparaissent dans « Envoyés » et les réponses sont lues par le worker.
- **Worker `pg-boss`** : file d'envoi avec quotas, fenêtres horaires (heures ouvrées du destinataire), **délais aléatoires** entre envois, reprise sur incident, détection des réponses toutes les quelques minutes.
- **Jalons** : (a) envoi 1 à 1 + modèles + désinscription + quotas ; (b) lecture des réponses et classement ; (c) séquences automatiques. On ne passe à (c) que si (a) et (b) montrent des rebonds et plaintes sous contrôle sur un premier lot.

---

## 8. Intégration Cleads Extractor

```
Navigateur ─► CRM (Next, côté serveur uniquement) ─► https://<domaine VPS>/v1 (clé "crm")
                         ▲                                │
                         └──── webhook signé HMAC ◄───────┘ (fin de job)
```

- **La clé `crm` ne quitte jamais le serveur** (variable d'environnement non préfixée `NEXT_PUBLIC_`). Le navigateur parle uniquement au CRM.
- **Écran « Nouvelle recherche »** : secteur (taxonomie de l'API), zone, `enrich` (emails), `max_results`, et estimation du coût en temps. Suivi d'avancement par SSE relayé par le CRM.
- **Import** : filtrer sur `useful`, `has_email`, `min_completeness` ; aperçu avec doublons détectés ; import en un lot (`ImportBatch`) avec compteurs « créés / déjà présents / ignorés ». Rejouable sans doublon grâce à l'identifiant stable.
- **Webhook de fin de job** (déjà signé HMAC côté Extractor) pour prévenir le demandeur.
- **Client TypeScript** généré depuis l'OpenAPI de l'Extractor (`cleads://openapi`), tests de contrat sur ses réponses.
- **Réalités à afficher à l'utilisateur** : le taux d'emails trouvés dépend de l'enrichissement et du secteur ; les chiffres du banc d'essai sont dans `cleads-extractor/docs/BENCHMARKS.md` et ne sont pas des promesses.

---

## 9. SEO et GEO (visibilité dans les moteurs et les IA)

**Constats**
- `public/robots.txt` interdit `/blog/` et liste d'anciennes pages ; `public/sitemap.xml` (statique) **et** `/api/sitemap` (dynamique) existent en double, tous deux remplis de pages à supprimer.
- La métadonnée racine (`app/layout.tsx`) annonce encore « Landing Pages qui Convertissent… 72 heures », en contradiction avec la home-v2.
- La version anglaise n'a pas d'URL : le titre est changé côté navigateur, les moteurs ne la voient pas.
- Le fond racine est sombre (`bg-gray-950`) : héritage à retirer du groupe `(public)`.

**Plan**
1. **Redirections 301** (pas de 404) des anciennes URL : `/services/*`, `/tarifs`, `/realisations`, `/about`, `/contact`, `/blog*`, `/ebook`, `/plan-du-site` → `/` (ou l'ancre la plus proche : `/#offres`). Conserve le poids des liens déjà indexés. Déclaration du changement dans Google Search Console.
2. **`app/robots.ts`** (typé) : autoriser `/`, les pages légales ; interdire `/app/`, `/auth/`, `/api/`, `/rdv/`. Autoriser **explicitement** les robots des moteurs de réponse et d'IA (`OAI-SearchBot`, `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Applebot`) si c'est votre choix éditorial ; `Google-Extended` et `GPTBot` contrôlent l'*entraînement*, pas la recherche : **décision à prendre**.
3. **`app/sitemap.ts`** : `/` et les pages légales, avec `lastModified` réel. Supprimer `public/sitemap.xml` et `/api/sitemap`.
4. **`/llms.txt`** : résumé de l'entreprise, des offres et des liens, lisible par les modèles. Utile et peu coûteux ; son effet réel sur les citations n'est pas démontré.
5. **Données structurées JSON-LD** sur la landing : `Organization` (nom, logo, email, téléphone, réseaux), `WebSite`, `ProfessionalService` (offres Essential / Growth / Enterprise sans prix inventé), `FAQPage` (la FAQ existe déjà dans `content.ts`). Les résultats enrichis FAQ de Google sont aujourd'hui limités à certains sites, mais le balisage aide la compréhension par les IA.
6. **Métadonnées** : un seul `title` / `description` / Open Graph / canonical cohérent ; image sociale 1200×630 dédiée.
7. **Contenu citable** : sections de la landing formulées en phrases autonomes (qui, quoi, pour qui, comment, limites), FAQ explicite sur ce que Cleads ne promet pas (cohérent avec la FAQ actuelle).
8. **Technique** : tester que le HTML rendu côté serveur contient bien le texte (la home est un composant client), mesurer Core Web Vitals, `lang="fr"` fixé côté serveur au lieu d'être modifié par JavaScript.
9. **Pages privées** : `noindex` + en-tête `X-Robots-Tag` sur `/app`, `/auth`, `/rdv`.

---

## 10. Intelligence artificielle : une agence d'agents, plusieurs modèles

> Mise à jour du 2 novembre 2026 : décisions D13 à D27 (section 1), epics E17 à E27 (section 12). Architecture détaillée : [AGENTS-IA.md](AGENTS-IA.md).

### 10.1 Jev (TypeSafe AI) : désormais disponible
Jev est un modèle « System One » : il ne génère pas de texte libre, il renvoie **des valeurs typées avec des probabilités calibrées** (choix, score, oui / non) pour des questions posées sur un état partagé. D'abord en liste d'attente, il est **disponible publiquement depuis septembre 2026 via la Vercel AI Gateway** (`typesafe-ai/jev`, versions 1.13 et 1.14) : contexte de 32 000 jetons, 0,042 $ le million de jetons en entrée, sortie gratuite, latence annoncée de 70 à 500 ms, état en texte ou en JSON. L'AI SDK 7 l'appelle par `experimental_decide` (API encore expérimentale), et la passerelle sait **relancer une décision incertaine sur un autre modèle** (bascule conditionnelle). Les chiffres de vitesse et de qualité restent ceux de l'éditeur : notre jeu d'évaluation tranchera (E27). Source : [présentation de TypeSafe](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

### 10.2 Où Jev est idéal dans le CRM
Tout ce qui est « choisir parmi N possibilités avec une confiance », en grand volume et en temps réel :
| Usage | Sortie typée |
|---|---|
| Pertinence d'un prospect pour votre cible (import de centaines de fiches) | `oui / peut-être / non` + probabilité |
| Classer une réponse reçue | `intéressé · pas maintenant · désinscription · absent · mauvaise personne · transfert · hors sujet` |
| Adresse nominative ou générique ? Poste décisionnaire ? | catégorie + confiance |
| Rapprocher deux fiches (même entreprise ?) | `oui / non` + probabilité |
| Prochaine meilleure action sur une fiche | choix parmi une liste d'actions |
| Router un lead entrant vers SDR ou closer | catégorie |

La probabilité calibrée permet un **seuil de décision** : au-dessus, la suggestion s'applique (à l'intérieur du CRM seulement) ; dans la zone d'incertitude, un modèle génératif reprend la question ; en dessous, la fiche va à un humain.

### 10.3 Où il ne sert pas
Rédiger un email, résumer, auditer un site, générer une page : il faut un modèle génératif. Jev complète les autres modèles, il ne les remplace pas.

### 10.4 Modèles par rôle (D15)
| Rôle | Par défaut | Secours | Exemples |
|---|---|---|---|
| `decision` | Jev | GPT-6 Luna Decisions (relance une réponse incertaine), puis un humain | pertinence d'un import, classement d'une réponse, prochaine action |
| `fast` | Claude Haiku 5.5 (0,10 $ / 0,50 $ par million de jetons) | GPT-6 Luna, Mistral Small | extraction du contenu d'un site, résumés |
| `writer` | Claude Sonnet 5.5 (2 $ / 10 $) | GPT-6.1 Sol, Mistral Large 4 | emails, pitch, analyse d'audit et des captures |
| `designer` | Claude Opus 5.5 (4 $ / 20 $) | Gemini 4 Argon, GPT-6 Astra | Studio Web, audit approfondi à la demande |

Prix relevés sur la passerelle le 2 novembre 2026. Le propriétaire change le modèle d'un rôle dans **Réglages › IA**, sans toucher au code : aucun code métier ne nomme un modèle. Tout changement passe d'abord par le jeu d'évaluation (E27).

### 10.5 Budget (D22)
Plafond dur de l'espace (moins de 100 € par mois, alertes à 50 % et 80 %), quota quotidien par personne, plafond par exécution (audit ≤ 0,30 €, maquette ≤ 2 €), devis avant tout traitement de plusieurs fiches. Ordre de grandeur, à mesurer : 200 audits (≈ 30 €) + 35 maquettes (≈ 42 €) + 500 brouillons (≈ 10 €) ≈ 82 € par mois.

### 10.6 Règles de sécurité et de conformité
1. **Délégation** : un agent agit avec les droits de la personne qui l'a lancé, par les mêmes services ; chaque action est journalisée avec `actorKind = AGENT`.
2. **Validation humaine** de tout ce qui sort du CRM (D18). Le premier message de prospection ne part jamais sans relecture ; le pied de page légal et la désinscription restent du code.
3. **Contenu non fiable** : le contenu des sites et des avis peut cacher des consignes (injection). Il est extrait par une étape sans outils, en sortie structurée ; les outils à effet externe exigent une validation.
4. **Faits sourcés** : chaque affirmation sur un prospect cite sa preuve (URL, mesure, capture). Aucun faux avis dans les maquettes.
5. **RGPD** (D16) : DPA avec les fournisseurs, pas d'entraînement sur nos données, minimisation (pas de nom ni d'email quand c'est inutile), mention dans la politique de confidentialité et dans le registre des traitements (E14).

---

## 11. Architecture du code et design system

### 11.1 Arborescence cible
```
app/
  (public)/            page.tsx (landing), mentions-legales, politique-de-confidentialite, cgv, cookies, rdv/[closer]
  (auth)/auth/         login, invitation, reset
  (crm)/app/           layout (shell), today, leads, companies, deals, meetings, mailbox, sequences, reports, agents, studio, settings/* (dont settings/ai)
  (apercu)/            maquettes du Studio Web, servies sur apercu.cleads.fr (routage par hôte dans proxy.ts, E23)
  api/v1/              REST du CRM (clé de service pour agents, plus tard)
  api/ai/chat          copilote en streaming (E24)
  robots.ts · sitemap.ts · llms.txt/route.ts
components/
  ui/                  primitives shadcn ré-habillées (jetons)
  crm/                 shell, data-table, kanban, timeline, filters, empty-state, command-palette, page-header…
features/<domaine>/    components/ · actions.ts (serveur) · service.ts (règles métier) · schemas.ts (zod) · queries.ts
features/ai/           agents · outils · skills · exécutions · validations (E17, E19) ; features/audit · offers · studio (E20, E21, E23)
lib/                   rbac · audit · extractor-client · mail · ai (passerelle, modèles par rôle, coûts, budgets, décisions Jev) · time
worker/                Node sur le VPS, file PostgreSQL : agents IA d'abord (E18), puis envois, relances, lecture des réponses, rappels
evals/                 jeux d'évaluation des agents (E27)
styles/tokens.css      jetons partagés landing + CRM
```
**Règle d'or** : toute modification métier passe par `features/*/service.ts`. L'interface (actions serveur), l'API REST et plus tard un serveur MCP appellent les **mêmes** services, avec les mêmes contrôles de droits et le même journal. C'est ce qui rend le CRM « prêt pour les agents » : les outils des agents IA (E17 à E25) appellent ces mêmes services, avec les droits de la personne qui lance l'exécution.

### 11.2 Jetons de design (issus de la home-v2)
| Jeton | Valeur | Usage CRM |
|---|---|---|
| `--navy` | `#0b1523` | barre latérale, en-têtes de page |
| `--ink` | `#11172b` | texte, boutons secondaires |
| `--lime` | `#d7ff00` | action principale, indicateur actif, progression |
| `--panel` | `#eef0fa` | cartes, colonnes, zones d'entrée |
| `--bg` | `#fbfbff` | fond d'application |
| Typographie | Inter ; titres 800, interlettrage serré ; corps 400–500 | |
| Formes | rayons généreux, ombres légères | |

**Précautions** : le citron `#d7ff00` sur fond clair est illisible (contraste insuffisant). Il sert de **fond de bouton avec texte `ink`**, de pastille sur fond `navy`, jamais de couleur de texte ni de bordure sur blanc. Focus visible partout (le contour vert `#81a200` de la home convient). Respect de `prefers-reduced-motion`. Contrastes AA vérifiés par test automatisé.

### 11.3 Bibliothèques recommandées
| Besoin | Choix | Alternative écartée |
|---|---|---|
| Tableaux denses, tri, colonnes | TanStack Table (+ virtualisation) | tableaux faits main |
| Données serveur / cache / optimisme | TanStack Query | `useEffect` + `fetch` (état actuel) |
| Kanban | `dnd-kit` | `react-beautiful-dnd` (abandonné) |
| Palette de commandes ⌘K | `cmdk` | — |
| État dans l'URL (filtres, vues) | `nuqs` | état local perdu au rechargement |
| Planification / files | `pg-boss` | cron Netlify |
| IA multi-modèles | AI SDK 7 (`ai`) + Vercel AI Gateway | LangChain / LangGraph, Mastra (D13) |
| Client MCP (Extractor) | `@ai-sdk/mcp` | un appel REST écrit à la main par outil |
| Captures et rendu des maquettes | Playwright, dans le worker | service de capture externe |
| Tests | Vitest + Testing Library, Playwright pour 5 parcours critiques | aucun test aujourd'hui |
| Erreurs | Sentry | `console.log` |

### 11.4 Expérience utilisateur « premium » : exigences concrètes
- **Écran d'accueil = « Aujourd'hui »** : relances dues, réponses à traiter, rendez-vous du jour. Pas un mur de graphiques.
- **Tout au clavier** : ⌘K, raccourcis (`C` créer, `E` email, `N` note, `Q` qualifier), navigation dans les listes.
- **Fiche en panneau latéral** pour traiter une liste sans perdre sa place.
- **Vues enregistrées** et filtres dans l'URL (lien partageable).
- **Édition en ligne**, mises à jour optimistes avec annulation, squelettes de chargement, états vides qui expliquent quoi faire.
- **Mobile** pour SDR et closers : appeler en un toucher, consulter le prochain rendez-vous, noter après appel.
- **Accessibilité** : navigation clavier complète, rôles ARIA des composants, contrastes AA.
- **Performance** : budgets mesurés (LCP, taille de bundle de la liste), pas de chargement du CRM dans la landing et inversement (groupes de routes séparés, GTM et bandeau cookies **uniquement** dans `(public)`).

---

## 12. Epics

Taille : **S** ≈ quelques jours, **M** ≈ 1 à 2 semaines, **L** ≈ 2 à 4 semaines, pour un développeur. Ce sont des ordres de grandeur à confirmer au démarrage de chaque jalon, pas des engagements.

### E0 — Assainir et sécuriser le socle · **M** · priorité absolue
> **Avancement (branche `refactor/e0-cleanup`, commit `4970485`)** — fait : Git + tag `legacy-pre-crm`, suppression du site historique / blog IA / facturation / portail client (≈ 39 000 lignes), routes et accès durcis, S3 côté serveur, redirections 301, `robots.ts`, `sitemap.ts`, 19 dépendances retirées, build et type-check verts, landing inchangée.
> **Reste à faire** : dump de la base (hors de ma portée), rotation des clés AWS exposées et suppression des variables `NEXT_PUBLIC_CLEADS_AWS_*` / `NEXT_PUBLIC_AWS_*` chez l'hébergeur (le code lit maintenant `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`), 23 erreurs ESLint « React Compiler » (code qui sera réécrit), CI GitHub, infrastructure de tests. Le schéma Prisma n'est volontairement pas modifié (E3).

- `git init`, `.env` ignoré, commit de l'état actuel, **tag `legacy-pre-crm`**, dump de la base.
- Fixer Prisma 6 (`prisma` en devDependency) pour que le build ne tire pas Prisma 7.
- Supprimer les blocs de la section 2.2 ; mettre de côté facturation et portail (branche / tag).
- Retirer les routes à risque, les `console.log` d'identifiants, les clés `NEXT_PUBLIC_AWS_*` (rotation des clés AWS exposées).
- Un seul fichier Tailwind ; retirer les dépendances inutilisées ; `README` Cleads ; `.env.example`.
- CI minimale (lint, types, build, tests).
- **Critères** : build vert sans le code supprimé, la landing identique pixel pour pixel, `npm audit` sans critique, aucune route de données sans authentification.

### E1 — Design system et coque d'application · **M**
> **Avancement (branche `refactor/e0-cleanup`)** — fait : jetons dans `styles/tokens.json` (clair et sombre, générés en CSS par `npm run tokens`), 51 tests de contraste WCAG AA, primitives ré-habillées (bouton, badge, champ, onglets, dialogue, panneau, toasts…), coque (barre latérale navy, barre du haut, menu mobile, palette ⌘K, menu compte, notifications), `PageHeader`, `DataTable` (TanStack, tri, clavier), `StatCard`, `StatusBadge`, `FormField`, `EmptyState`, `Skeleton`, navigation filtrée par rôle (`lib/crm/nav.ts`), page « Aujourd'hui » et catalogue `/app/design`. Le back-office actuel garde son thème sombre (classe `dark` sur `html`), le CRM bascule en clair.
> **Reste** : thème sombre du CRM (V1.1), virtualisation et filtres serveur du tableau (E4), actions de la palette (E4+), vrai filtrage par droits (E2).

Jetons partagés, primitives ré-habillées, coque (barre latérale, en-tête, palette ⌘K, notifications), `PageHeader`, `DataTable`, `EmptyState`, `Sheet`, formulaires, toasts. Catalogue de composants (Storybook ou page interne).
- **Critères** : la coque tient le rôle (navigation filtrée par droits), AA validé, thème cohérent avec la home-v2, tous les composants documentés.

### E2 — Authentification, rôles et équipe · **L**
> **Avancement (branche `refactor/e0-cleanup`)** — fait : matrice de droits unique `lib/rbac.ts` (testée cellule par cellule contre la section 4), gardes serveur `requirePermission` / `requirePagePermission` (compte actif et rôle relus en base à chaque requête : une désactivation ou un changement de rôle s'applique immédiatement), invitations à lien unique (jeton haché, 7 jours, usage unique atomique, remplacement par une nouvelle invitation), pages Équipe et Journal d'audit, verrouillage de connexion (5 échecs en 15 min), message d'erreur identique pour compte inconnu / mauvais mot de passe / compte désactivé, politique de mot de passe (12 caractères), session de 12 h, journal d'audit.
> **Écarts assumés** : (1) **NextAuth v4.24.15 conservé** au lieu d'Auth.js v5 (décision D8) : v5 n'existe toujours qu'en bêta (`5.0.0-beta.32`) et `npm audit` ne signale aucune vulnérabilité sur la v4 ; l'authentification est isolée dans `lib/auth/options.ts` et `lib/auth/session.ts`, le changement futur ne touchera que ces deux fichiers ; l'adaptateur Prisma, inutile avec des jetons JWT, est retiré. (2) Le rôle reste porté par `User.role` (pas de table `Membership`) : le mono-espace suffit pour la V1, la table arrivera avec `Workspace` en E3. (3) Pas de « mot de passe oublié » libre-service : le propriétaire renvoie une invitation. (4) Pas encore de 2FA (V1.1).
> **Migrations à appliquer** : `20261029230000_crm_role_values` et `20261029230100_team_access_and_audit` (additives ; les comptes `ADMIN` deviennent `OWNER`). Testées sur une base jetable avec des comptes hérités ; **à appliquer sur la production après un dump** (le script `build` les exécute automatiquement au prochain déploiement).

Auth.js v5, invitation par email avec lien signé, désactivation, matrice `lib/rbac`, `requirePermission`, journal d'audit, limitation de débit sur la connexion, session raisonnable (pas 30 jours sans rotation).
- **Critères** : tests de la matrice complète (chaque rôle × chaque action), aucun accès aux données d'un autre périmètre par l'API, journal lisible.

### E3 — Modèle de données et migration · **M**
> **Avancement (branche `refactor/e0-cleanup`)** — fait : schéma CRM (espace de travail, entreprises, contacts, fiches, opportunités, activités, tâches, rendez-vous, disponibilités, imports, suppressions, vues enregistrées) avec contraintes en base, deux migrations testées sur une base peuplée, script de reprise rejouable avec simulation et vérifications (« aucun rendez-vous futur perdu »), données de démonstration fictives. Détails et procédures : [DATA_MODEL.md](DATA_MODEL.md).
> **Écarts assumés** : (1) tables d'emailing reportées à E9 ; (2) pas de table `Membership` : `User.workspaceId` suffit en mono-espace ; (3) la société d'émission des factures est conservée (`BillingCompany`) au lieu d'être supprimée : les factures doivent être gardées ; (4) la suppression des tables du blog est un script à part (`prisma/pending/`), à lancer après un dump ; (5) l'ancien `prisma/seed.ts`, qui effaçait tous les comptes et contenait un mot de passe administrateur en clair, est supprimé.

Schéma Prisma du chapitre 5, migrations, script de reprise des rendez-vous et utilisateurs existants, données de démonstration anonymisées.
- **Critères** : migration rejouable sur une copie, comptes avant / après contrôlés, aucune perte de rendez-vous futur.

### E4 — Prospects, entreprises, contacts · **L**
> **Avancement (branche `refactor/e0-cleanup`)** — fait : liste des prospects (filtres, tri, pagination côté serveur, vues enregistrées personnelles ou partagées, actions groupées : attribuer, statut, étiquette), fiche en panneau latéral et en pleine page (historique, notes, appels, score expliqué, modification, étiquettes), création manuelle, import CSV avec vérification préalable et rejouable sans doublon, détection de doublons et fusion, liste d'exclusion respectée, journal des changements, suppression (propriétaire seulement, la liste d'exclusion survit). Visibilité par rôle appliquée dans chaque requête. Règles et choix : [DATA_MODEL.md](DATA_MODEL.md).
> **Mesuré** : 10 000 fiches, base locale, liste par défaut 5 ms, tri par nom 21 ms, recherche texte 42 ms, page 200 17 ms (`PERF=1 TEST_DATABASE_URL=… npx vitest run tests/leads.perf.test.ts`). Pagination serveur plutôt que virtualisation : le navigateur n'affiche jamais plus de 100 lignes.
> **Écarts assumés** : pas de liste « Entreprises » séparée (une entreprise = une fiche, modifiée dans la fiche) ; fusion réservée aux managers et propriétaires. **Reste** : l'import depuis Cleads Extractor (E5, il réutilisera `runImport`), les tâches et relances (E7), le thème sombre.

Liste dense avec filtres et vues enregistrées, fiche (panneau + page), historique, import CSV avec correspondance de colonnes, détection de doublons, fusion, score par règles (présence d'email, site, note, avis, secteur cible), étiquettes, propriétaire.
- **Critères** : 10 000 fiches fluides (virtualisation), import CSV rejouable sans doublon, journal des changements.

### E5 — Intégration Cleads Extractor · **M**
> **Avancement (branche `refactor/e0-cleanup`)** — fait : client typé de l'Extractor (réponses validées, erreurs en français, clé serveur uniquement), écran de lancement avec état de santé des sources, suivi (compteurs séparés, annulation, erreurs par cause), échantillon et filtres, vérification puis import avec le moteur de l'import CSV, rejeu sans doublon, notification de fin par webhook signé, journal d'audit. Détails : [EXTRACTOR.md](EXTRACTOR.md).
> **Vérifié sur une vraie recherche** (« plombier, Lyon », Extractor de production, clé `crm`) : 50 entreprises trouvées dont 29 joignables, 29 fiches importées, rejeu = 0 créée / 29 déjà présentes. Cela a révélé et fait corriger un défaut de qualité : des emails ramassés sur des sites arrivaient encodés (`%20…`).
> **Écarts assumés** : suivi par interrogation plutôt que par flux SSE relayé (plus simple et résistant ; le webhook couvre l'absence de l'utilisateur) ; client écrit à la main avec validation (zod) plutôt que généré depuis l'OpenAPI, avec des tests de contrat contre un vrai Extractor ; 1 000 résultats maximum par recherche (l'import n'est donc jamais tronqué).

Client typé, écran de recherche, suivi, aperçu avant import, import par lots, webhook signé, gestion des erreurs et du « Google nous bloque-t-il ? » (santé de l'API).
- **Critères** : de la recherche à 100 prospects importés sans quitter le CRM ; second import du même job = 0 doublon ; la clé n'apparaît jamais dans le navigateur.

### E6 — Qualification et pipeline · **M**
> **Avancement (branche `refactor/e0-cleanup`)** — fait : qualification guidée (quatre questions facultatives, trois issues : enregistrer, qualifier avec création de l'opportunité et choix du closer, disqualifier avec motif), touche `q` et validation au clavier, opportunité unique par fiche même sous concurrence, menu de statut cohérent avec le pipeline, pipeline en colonnes (glisser-déposer + menu « Déplacer »), motif obligatoire pour perdre, règles par rôle appliquées côté serveur et testées en entier (rôle × étape × étape), totaux uniquement sur les montants renseignés. Détails : [PIPELINE.md](PIPELINE.md). Aucun changement de schéma.
> **Vérifié dans le navigateur** (SDR puis closer, base jetable) : fiche qualifiée au clavier, carte glissée vers « RDV planifié », passage en « Perdu » avec le motif.
> **Reste** : ordre des cartes dans une colonne, passage automatique à « RDV planifié » (E8), tour de rôle des closers (V1.1).

Statuts de prospect, qualification guidée (budget, besoin, décideur, échéance : champs optionnels), création automatique de l'opportunité, kanban glisser-déposer, motifs de perte, règles de transition par rôle.
- **Critères** : un SDR qualifie une fiche en moins d'une minute au clavier ; transitions interdites refusées côté serveur.

### E7 — Activités, tâches et file « Aujourd'hui » · **M**
> **Avancement (branche `refactor/e0-cleanup`)** — fait : historique unique et filtrable (pages sans trou), appels avec résultat, durée et relance planifiée dans le même geste, tâches datées avec droits par rôle, une ligne d'historique exactement par changement (testé, y compris deux personnes en parallèle), tâches abandonnées à la disqualification, file « Aujourd'hui » par rôle (en retard, du jour, rendez-vous, à planifier, à venir, équipe pour les managers) qui se vide en place avec annulation. Détails : [ACTIVITES.md](ACTIVITES.md). Une valeur d'enum ajoutée, aucune table.
> **Vérifié dans le navigateur** (SDR, base jetable) : tâche cochée et disparue de la file, appel « pas de réponse » enregistré au clavier avec relance du lendemain et tâche terminée, historique de la fiche à jour.
> **Écarts assumés** : une échéance est un jour, pas une heure ; pas de rappel par email ou notification (E9/E11) ; le closer qui détient l'opportunité peut désormais noter, appeler et planifier sur la fiche. **Reste** : compteur d'en-retard dans la navigation, tâches sans fiche.

Chronologie unifiée, notes, appels (durée, résultat), tâches avec échéance, rappels, file du jour par rôle.
- **Critères** : aucune action sans trace dans la chronologie ; la file du jour se vide sans quitter l'écran.

### E8 — Rendez-vous (refonte) · **L**
Section 6 : disponibilités par closer, fonction de créneaux testée, agenda, page `/rdv/[closer]`, attribution, annulation / report, résultat obligatoire, rappels par le worker.
- **Critères** : tests sur changements d'heure et chevauchements ; plus aucune création de compte à la réservation ; un prospect réserve en moins de 30 secondes sur mobile.

> **Avancement (branche `refactor/e0-cleanup`)** — fait : fonction de créneaux pure et testée (changements d'heure dans les deux sens, plages fusionnées, pause, exception, marge, délai, horizon), réservation interne (fiche) et publique (`/rdv/<closer>`, sans compte, limitée par connexion, champ piège), chevauchement impossible même en parallèle (verrou de base, testé à 10 réservations simultanées), un rendez-vous actif par type et par contact, report en chaîne (« Reporté » + remplaçant), annulation et report par lien signé, agenda hebdomadaire, disponibilités par closer, résultat obligatoire (qualifié, à relancer, perdu avec raison, absent) qui fait avancer l'opportunité, « à clôturer » dans l'agenda et dans « Aujourd'hui », emails avec invitation `.ics`, rappels horaires idempotents. Détails : [RENDEZ-VOUS.md](RENDEZ-VOUS.md). Deux tables et cinq colonnes ajoutées, rien de supprimé.
> **Vérifié dans le navigateur** (base jetable) : réservation publique sur téléphone (deux touches, deux champs, une case), page « Modifier ou annuler », agenda du closer, clôture « Qualifié » (opportunité passée en Proposition), disponibilités, fenêtre de planification sur la fiche. Le « moins de 30 secondes » n'a pas été chronométré avec une vraie personne.
> **Écarts assumés** : pas de worker dans le projet, donc le cron Netlify (horaire) fait les rappels ; pas de tour de rôle (V1.1) ; pas d'agenda externe ; l'ancien endpoint de réservation répond 410. **Reste** : essai réel d'envoi (Resend), lien de visio propre à chaque rendez-vous, vue jour en grille horaire.

### E8b — Fournisseurs d'envoi (ajout) · **S**
Couche d'envoi unique pour les emails du CRM : Amazon SES par défaut, Resend en secours, choix dans les réglages, prospection interdite sur ces deux fournisseurs (erreur levée par le code), rebonds et plaintes alimentant la liste d'exclusion (webhook SNS signé). Détails : [ENVOI-EMAILS.md](ENVOI-EMAILS.md).

### E9 — Emailing (3 jalons) · **L** + **M** + **L**
> **Avancement E9a (branche `refactor/e0-cleanup`)** — fait : boîtes d'envoi SMTP + IMAP sur domaines secondaires (mot de passe chiffré AES-256-GCM, `cleads.fr` refusé par le code, test de connexion obligatoire, mise en erreur automatique sur identifiants refusés), envoi 1 à 1 depuis la fiche (texte brut, sans pixel, copie dans « Envoyés »), modèles à variables avec valeurs de secours, pied de page imposé (origine de l'adresse, désinscription) et en-têtes de désinscription en un clic (RFC 8058), page de désinscription sans GET destructeur, chauffe sur 4 semaines et plafond jamais dépassé même en parallèle (verrou de ligne, testé à 10 envois simultanés), anti-double-envoi, journal d'envoi par rôle, historique et statut « Contacté ». Détails : [EMAILING.md](EMAILING.md). Trois tables ajoutées, rien de supprimé.
> **Vérifié dans le navigateur** (base jetable, faux serveur SMTP local) : boîte ajoutée et testée, email de test reçu avec les bons en-têtes, modèle rempli depuis une fiche, envoi par un SDR, désinscription puis envoi bloqué. **Pas encore** : un envoi réel vers Gmail ou Outlook (il faut les boîtes des domaines `trycleads.com` / `usecleads.com`).
> **Écarts assumés** : SMTP + IMAP plutôt qu'OAuth (cela marche chez tous les hébergeurs ; OAuth viendra si l'hébergeur choisi l'impose) ; pas de worker pour E9a (un envoi 1 à 1 part pendant la requête) ; la désinscription n'abandonne ni l'opportunité ni les tâches de la fiche, elle bloque seulement les emails. **Reste** : E9c (séquences).
>
> **Avancement E9b** — fait : lecture IMAP toutes les 5 minutes (lecture seule), rattachement des réponses par `In-Reply-To`, statut « Répondu », absences traitées à part, rebonds définitifs lus dans la boîte (exclusion automatique), onglet « Réponses » avec classement manuel et « Ne plus écrire », nettoyage des envois bloqués. Détails : [EMAILING.md](EMAILING.md). **Écart** : classement assisté et notification reportés ; une migration additive (`20261031120000_outreach_replies`).
>
> **Avancement E9c** — fait : séquences de 1 à 4 messages en un seul fil, inscription groupée avec vérifications serveur, une séquence en cours par fiche (index unique), moteur toutes les 5 minutes (jours ouvrés, 9 h – 17 h 30, minute aléatoire, 2 envois par boîte et par passage, bail anti-double-envoi, mêmes plafonds que l'envoi 1 à 1), arrêt automatique sur réponse, rebond, désinscription, plainte, changement de statut, avec revérification avant chaque envoi, pause automatique d'une boîte (5 % de rebonds, 8 % de désinscriptions) et onglet Délivrabilité. Détails : [EMAILING.md](EMAILING.md). Une migration additive (`20261101000000_outreach_sequences`). **Écarts** : pas de jours fériés ; les signalements de spam des boîtes ne sont pas lisibles (Postmaster Tools).

- **E9a** : boîtes d'envoi (OAuth), envoi 1 à 1, modèles à variables, désinscription, liste de suppression, quotas et chauffe, journal d'envoi.
- **E9b** : lecture des réponses, rattachement à la fiche, classement (manuel puis assisté), rebonds.
- **E9c** : séquences (3 à 4 étapes), arrêt automatique, fenêtres horaires, pause automatique sur seuils, tableau de délivrabilité.
- **Critères** : aucun envoi vers une adresse supprimée ; plafonds jamais dépassés ; arrêt de séquence testé dans chaque cas (réponse, rebond, désinscription, plainte).

### E10 — Tableaux de bord et rapports · **M**
Entonnoir hebdomadaire, performances par SDR et closer, activité du jour, délivrabilité, pipeline pondéré (seulement si les montants sont renseignés), export CSV.
- **Critères** : chaque chiffre est défini dans une fiche (« contacté = au moins un message envoyé… ») et recalculable ; aucun indicateur inventé.

### E11 — Capture inbound et notifications · **S**
Le formulaire d'audit de la landing crée un prospect (source `INBOUND`), avec case de consentement, champ piège anti-robot, limitation de débit, notification au manager, email de confirmation transactionnel. Notifications dans l'application et par email selon préférences.
- **Critères** : aucune perte de demande si l'email échoue (le prospect est enregistré d'abord).

### E12 — SEO / GEO de la landing · **S**
Section 9 : redirections, `robots.ts`, `sitemap.ts`, `llms.txt`, JSON-LD, métadonnées, `noindex` des zones privées, rendu serveur vérifié.
- **Critères** : sitemap ne contient que des URL en 200 ; données structurées valides dans l'outil de test de Google ; aucune ancienne URL en 404.

### E13 — Fondations « agents » · **M** · *absorbée par E17, E18 et E27 (2 novembre 2026)*
> Remplacée par la couche agentique : rôle `AGENT`, `actorKind`, file de validation et jeu d'évaluation sont repris par E17, E18 et E27. `api/v1` et un serveur MCP du CRM restent possibles plus tard ; ils appelleront les mêmes services.
`api/v1` avec clés de service à portée limitée, rôle `AGENT` dans le schéma, `actor` dans les activités et le journal, interfaces `Classifier` / `Generator`, jeu d'évaluation, file de validation humaine (structure). **Aucun agent autonome en V1.**
- **Critères** : une action réalisée par clé de service est tracée comme telle ; un envoi par un agent exige une validation.

### E14 — Qualité, exploitation, conformité · **M**
Tests de bout en bout sur 5 parcours (connexion, recherche → import, qualification, réservation, envoi), Sentry, journaux structurés, sauvegardes de la base, export et effacement d'un contact, registre des traitements, déploiement automatisé avec retour arrière.
- **Critères** : pipeline vert obligatoire pour déployer ; restauration d'une sauvegarde testée une fois.

### E15 — Campagnes · **M** *(ajout, après E9)*
> **Avancement (branche `refactor/e0-cleanup`)** — fait : table `Campaign` et rangement des fiches et des recherches (migration additive `20261101120000_campaigns_and_hq`), droits `campaign:read` / `campaign:manage`, liste et page de campagne, action groupée, champ sur la fiche, filtre « campagne » et « hors campagne », campagne au lancement d'une recherche et à l'import CSV, indicateurs définis une fois (`features/metrics`) et limités aux fiches visibles. Détails : [CAMPAGNES.md](CAMPAGNES.md).
> **Vérifié** : `tests/campaigns.integration.test.ts` (base jetable) et dans le navigateur (liste, page, filtre). **Écarts** : une fiche appartient à une seule campagne ; les séquences ne sont pas rattachées à une campagne (on voit celles où ses fiches sont inscrites).
Une campagne est un ciblage (secteur × zone, une offre) travaillé sur une période. Elle regroupe des fiches (une fiche appartient au plus à une campagne) et les recherches Extractor lancées pour elle, dont les imports y rangent les fiches. Ses résultats sont **calculés** à partir de ce qui existe déjà (fiches, emails, appels, opportunités, rendez-vous) : rien n'est stocké en double.
- Modèle `Campaign` (nom unique, statut brouillon / active / en pause / terminée, secteur, zone, responsable, dates, objectifs facultatifs de fiches et de rendez-vous, archivage), `Lead.campaignId`, `ExtractionSearch.campaignId`.
- Droits : `campaign:read` pour tous les membres, chiffres limités aux fiches que la personne voit (`lead:read`) ; `campaign:manage` pour propriétaire, manager et SDR ; ranger une fiche demande en plus le droit d'écrire sur la fiche.
- Indicateurs définis une fois (`features/metrics`), affichés avec leur définition, réutilisés par E10 : prospects, contactés, réponses, taux de réponse, qualifiés, RDV, gagnés, conversion. **Pas de taux d'ouverture ni de clic** : le CRM ne pose pas de pixel (E9a).
- Écrans : liste `/app/campaigns`, page de campagne, action groupée « Ranger dans une campagne », filtre de la liste des prospects, campagne au lancement d'une recherche et à l'import CSV, campagne sur la fiche.
- **Critères** : chaque chiffre a sa définition ; une fiche invisible pour un SDR ne compte pas dans ses chiffres ; réimporter une recherche ne déplace jamais une fiche rangée dans une autre campagne.

### E16 — Vue 3D isométrique « QG » · **L** *(ajout, après E9)*
> **Avancement (branche `refactor/e0-cleanup`)** — fait : `/app/3d` et sélecteur 2D / 3D, huit espaces cliquables reliés aux vrais chiffres et aux actions du CRM (fiche, RDV, email), équipe réelle à ses postes avec statut et choix du personnage, HUD de la maquette, visite guidée, clavier, jour / nuit (auto, jour, nuit), personnages Meshy (188 crédits) compressés à 550 Ko, chargement séparé, rendu léger automatique. Détails : [VUE-3D.md](VUE-3D.md).
> **Vérifié** : `tests/hq.test.ts`, `tests/hq.integration.test.ts`, navigateur (60 images/s sur Apple M4 en 2880 × 1688). **Pas encore** : téléphone réel, lecteur d'écran réel, poste peu puissant. **Écarts** : pas de redirection automatique vers la 3D ; personnages « opérateurs » dans les espaces sans membre ; pas de déplacement animé entre espaces (le clip de marche est prêt).
Seconde vue du CRM, isométrique et interactive, à côté de la vue 2D qui reste intacte : sélecteur **2D / 3D** dans la barre du haut, qui ramène à la dernière page 2D. Huit espaces, un par module : Scraping / Sources, Qualification, Coordination, Campagnes, Prospection multicanale, Pipeline CRM, RDV & Planning, Analytics.
- **Technique** : Three.js + React Three Fiber + Drei (caméra `CameraControls`, étiquettes `Html`, instanciation). Les transitions de caméra viennent de camera-controls, GSAP n'est pas nécessaire. Le code 3D est chargé à part : la vue 2D ne télécharge rien de plus.
- **Fonctionnel, pas décoratif** : chaque espace est cliquable, la caméra s'en approche, un panneau donne les vrais chiffres et listes du module, avec les actions existantes (fiche en panneau, qualifier, planifier un RDV, écrire, ouvrir le module en 2D). Les personnages sont les membres de l'équipe, à un poste selon leur rôle ; chacun choisit son personnage.
- **HUD** : indicateurs clés, parcours d'acquisition, performances des campagnes, derniers prospects, contrôles de caméra, visite guidée (← →, Échap).
- **Jour / nuit** synchronisé sur l'heure locale, désactivable (Auto · Jour · Nuit), mémorisé dans le navigateur.
- **Personnages** générés avec Meshy depuis l'illustration d'équipe de cleads.fr (squelette, animations), compressés ; personnages construits en code en secours.
- **Performance** : géométries et matériaux partagés, instanciation, ombres limitées, résolution adaptative, rendu à la demande quand le mouvement est réduit, arrêt quand l'onglet est caché.
- **Accessibilité** : ce que montre la scène est aussi dans le HUD (DOM), espaces au clavier (1 à 8, ← →, Échap), annonces vocales, `prefers-reduced-motion`, repli vers la 2D sans WebGL.
- **Évolutif** : les espaces sont une liste (`features/hq/zones.ts`) ; un espace de plus = une entrée et une composition, sans toucher au reste ; « Agents IA » et « Studio Web » arrivent ainsi en E26. Aucun agent IA dans cette version.
- **Critères** : aucune régression de la vue 2D (tests et parcours dans le navigateur) ; aucun chiffre sans définition ; fluide sur un portable récent.

### Couche agentique IA (E17 à E27, décidée le 2 novembre 2026)
Décisions D13 à D27 (section 1), règles en section 10, spécification dans [AGENTS-IA.md](AGENTS-IA.md). E17 est fait ; E18 à E27 restent à faire.

### E17 — Socle IA · **M** *(absorbe E13)*
> **Avancement (branche `feat/e17-socle-ia`)** — fait :
> - migration additive `20261102120000_ai_foundation` (cinq tables : `AiSetting`, `AiUsage`, `AgentRun`, `AgentStep`, `AgentApproval`) ;
> - `lib/ai/` : modèles par rôle, prix lus sur la passerelle avec un instantané de secours, budget en micro-euros avec réservation verrouillée et alertes aux propriétaires à 50, 80 et 100 %, décisions Jev avec seuils et bascule conditionnelle, encadrement du contenu non fiable ;
> - `features/ai/` : catalogue des huit agents avec leurs plafonds, exécutions et étapes facturées, appels de modèles bornés par ce que l'exécution peut encore payer, validations humaines, registre d'outils ;
> - droits `ai:use`, `ai:read`, `ai:manage` ;
> - écran Réglages › IA : consommation, modèles, plafonds, validations en attente, exécutions récentes.
>
> Détails : [AGENTS-IA.md](AGENTS-IA.md).
>
> **Vérifié** :
> - `tests/ai.test.ts` (21 tests) ;
> - `tests/ai.integration.test.ts` (19 tests, base jetable) : 10 démarrages simultanés pour 3 places, droits délégués, validations, expiration, facturation exacte d'un appel ;
> - suite complète verte (638 tests) et build ;
> - écran et actions contrôlés sur le serveur de développement (base jetable, rendu serveur et API).
>
> **Pas encore** : contrôle visuel de l'écran dans le navigateur, appel réel à la passerelle (pas de clé).
>
> **Écarts** :
> - le secours des décisions est GPT-6 Luna Decisions, pas Claude Haiku, car la bascule conditionnelle de la passerelle exige un modèle de décision ;
> - `AGENT` n'est pas un rôle de connexion : une exécution planifiée n'a aucun droit nominatif et n'utilise que les outils qui n'en demandent pas ;
> - une validation approuvée remet l'exécution en file : l'action elle-même sera exécutée par le worker (E18).

Tout ce qui rend l'IA sûre et pilotable, avant le premier agent métier.
- `lib/ai/` : passerelle (clé serveur `AI_GATEWAY_API_KEY`), registre des modèles par rôle avec secours (`decision`, `fast`, `writer`, `designer`), prix lus sur la passerelle et coût de chaque appel, plafonds et quotas avec réservation verrouillée, décisions Jev avec seuils, encadrement du contenu non fiable.
- `features/ai/` : exécutions (`AgentRun`, `AgentStep`), validations (`AgentApproval`), registres `defineTool` et `defineAgent` (droit requis, politique de validation, limites).
- Droits `ai:use`, `ai:read`, `ai:manage` ; compte de service `AGENT` pour les exécutions planifiées ; délégation des droits pour les autres.
- Écran **Réglages › IA** : modèles par rôle, plafonds, consommation du mois par personne et par agent.
- Tests avec modèles simulés (`ai/test`), aucun appel réel.
- **Critères** : aucun appel sans exécution tracée (qui, quel agent, quel modèle, jetons, coût) ; plafond jamais dépassé, même avec 10 exécutions simultanées ; un outil refuse ce que la personne n'a pas le droit de faire.

### E18 — Worker des agents sur le VPS · **M**
> **Avancement (branche `feat/e18-worker-ia`)** — fait :
> - migration additive `20261103090000_ai_worker` : colonnes de file sur `AgentRun`, exécution « au plus une fois » sur `AgentApproval`, table `AiWorker`, une seule exécution d'un agent par fiche ;
> - `features/ai/queue.ts` : prise `FOR UPDATE SKIP LOCKED`, bail par battement de cœur, reprises bornées, expiration ;
> - `features/ai/maintenance.ts` : maintenance sous verrou consultatif, alertes aux propriétaires ;
> - exécution des actions approuvées au plus une fois ;
> - registre des agents (`features/ai/handlers.ts`) ;
> - worker `worker/` : boucle, arrêt propre, santé, paquet esbuild ;
> - client MCP de l'Extractor en lecture seule ;
> - Pusher : progression en direct avec repli en interrogation, et **correctif de sécurité** de `/api/pusher/auth`, qui autorisait n'importe quel canal privé ;
> - état du worker dans Réglages › IA ;
> - image durcie et déploiement avec retour arrière (`scripts/deploy-ai-worker.sh`), secrets saisis par le propriétaire (`scripts/set-ai-worker-env.sh`).
>
> Détails : [WORKER-IA.md](WORKER-IA.md).
>
> **Vérifié** :
> - `tests/ai-worker.integration.test.ts` (15 tests) : prise unique par 6 workers concurrents, reprise, abandon, annulation, arrêt propre, action approuvée exécutée une fois et jamais rejouée après un arrêt, maintenance ;
> - `tests/extractor-mcp.integration.test.ts` (3 tests, contre un vrai Extractor local) ;
> - suite complète verte (657 tests) et build ;
> - paquet démarré en local (santé, arrêt propre) ;
> - sur le VPS : image construite, Prisma chargé dans le conteneur en lecture seule, Extractor joignable depuis le réseau du worker, pile de l'Extractor intacte.
>
> **Pas encore** : mise en service, qui attend la `DATABASE_URL` Railway saisie par le propriétaire ; aucun agent métier n'est branché (E20 à E25).
>
> **Écarts** :
> - la table des exécutions sert de file, sans `pg-boss` : la création de l'exécution et sa mise en file ne font qu'une transaction, sans double état à synchroniser ;
> - Playwright est reporté à E20, son premier utilisateur ;
> - le déploiement se fait par script, avant la CI d'E14 ;
> - bug corrigé : des heures SQL dépendaient du fuseau de la session Postgres (`lib/ai/sql.ts`).

Réalise D10 pour les agents : un worker Node, en Docker à côté de l'Extractor.
- Files `ai.audit`, `ai.offers`, `ai.draft`, `ai.studio`, `ai.maintenance` : reprise sur incident, priorités, une exécution à la fois par fiche et par type, concurrence bornée par le budget.
- Mise en file légère depuis Netlify ; progression publiée sur Pusher (canal privé), interrogation en secours ; reprise d'une exécution après une validation humaine.
- Playwright (Chromium) dans l'image pour les captures et les maquettes ; client MCP de l'Extractor sur le réseau local (clé `crm`, outils en lecture seulement).
- Déploiement (image, Compose dans `/opt/cleads`), supervision (santé, alertes au propriétaire), variables d'environnement documentées.
- **Préalable** : savoir où est la base de production et autoriser le VPS à s'y connecter.
- **Critères** : un redémarrage du worker ne perd ni ne double aucune exécution ; une validation reprend l'exécution là où elle s'était arrêtée.

### E19 — Agents, skills et catalogue d'offres · **M**
- Définitions des huit agents (rôle d'expert, rôle de modèle, outils, skills, validations, limites) dans le code, versionnées et testées ; surcouche éditable en base (`AgentDefinition` : consignes ajoutées, modèle, skills actifs, limites).
- **Skills** au format SKILL.md (agentskills.io) : nom, description de quand s'en servir, contenu, fichiers annexes, versions. Ils sont attachés « toujours » ou « à la demande » (l'agent lit le catalogue et charge un skill par `read_skill`), importables et exportables, avec un écran d'édition et un test sur une fiche.
- **Catalogue d'offres** (`Offer`) : V1 rédigée d'après les offres de Cleads et les formules de la landing, validée par le propriétaire ; signaux déclencheurs, livrables, fourchette de prix, angle, objections.
- Module `/app/agents` : exécutions, file « À valider », skills, offres, consommation.
- **Critères** : un agent ne recommande qu'une offre active ; un skill modifié crée une version et l'ancienne reste lisible.

### E20 — Audit et enrichissement des prospects · **L**
L'Auditeur digital produit une fiche enrichie et sourcée, à la demande, depuis la fiche (2D et 3D).
- Site (5 pages au plus, `robots.txt` respecté, adresses IP publiques seulement) : HTTPS, redirections, poids, balises, données structurées, `sitemap.xml`, `llms.txt`, mobile, signes d'un site daté, CMS, balises d'analyse et de publicité.
- PageSpeed Insights (clé gratuite) sur mobile et ordinateur ; captures analysées par un modèle de vision (modernité, clarté, appels à l'action, freins).
- Présence : réseaux (liens du site et Extractor), fiche Google (note, avis, catégories, photos, horaires), cohérence nom-adresse-téléphone ; GEO sur ce que le site expose.
- Dirigeants (annuaire des entreprises) proposés comme contacts, avec source et base légale ; **aucune adresse email devinée**.
- `ProspectAudit` : sous-scores (technique, vitesse, mobile, SEO local, GEO, conversion, présence, image) avec preuves ; forces, faiblesses, frictions, opportunités ; résumé en 3 points. Une raison « IA » s'ajoute au score de la fiche, et l'audit est réutilisé 30 jours par domaine.
- **Critères** : chaque constat cite sa preuve ; un site injoignable donne un audit partiel explicite, pas une erreur ; coût moyen mesuré sous 0,30 €.

### E21 — Offres et pitch · **M**
- Signaux de l'audit → offres candidates (règles), puis le Conseiller offres classe, argumente avec les preuves et compose un pack.
- Script d'appel de 15 minutes, objections et réponses, angle d'email ; onglet « Offres suggérées » sur la fiche.
- Acceptation ou refus par la personne, conservés pour mesurer la pertinence (E27).
- **Critères** : aucune offre sans au moins une preuve d'audit ; le closer voit en un écran pourquoi cette offre et quoi dire.

### E22 — Rédaction et réponses · **M**
- **Brouillon IA** dans la fenêtre d'email et dans les séquences : court, personnalisé, une seule proposition (15 minutes), uniquement des faits de l'audit. Le pied de page et la désinscription sont ajoutés par le code, et les modifications de la personne sont conservées.
- **Classement des réponses** par Jev (`ReplyClass` et urgence, avec probabilité) : suggestion confirmée en un clic, « À classer » sous le seuil. C'est le classement assisté reporté en E9b.
- Brouillon de réponse aux réponses intéressées.
- **Critères** : aucun envoi sans relecture ; aucun statut changé sans confirmation sous le seuil.

### E23 — Studio Web · **L**
Le Designer génère une landing de démonstration en **code libre** à partir du site du prospect, de son audit et de sa charte, pour que le closer puisse la montrer.
- Collecte (textes, images, logo, couleurs, typographies), brief relisible, puis page HTML + Tailwind générée, compilée et nettoyée (aucun script, aucun formulaire externe, appels à l'action en `tel:` ou `mailto:`).
- Boucle de qualité : rendu Playwright sur ordinateur et mobile, critique visuelle sur une grille, axe-core, Lighthouse ; une ou deux corrections. Les scores « votre site → maquette » servent au pitch.
- Aperçu `https://apercu.cleads.fr/<jeton>` (routage par hôte dans `proxy.ts`) : `Content-Security-Policy: sandbox`, `noindex`, bandeau « maquette non contractuelle », page d'expiration après 30 jours, purge à 90 jours ou à la suppression de la fiche.
- Versions et « modifier par instruction » ; visite du lien enregistrée et closer notifié (D25) ; module `/app/studio` et bouton « Générer une landing » sur la fiche.
- **Préalable** : enregistrement DNS de `apercu.cleads.fr` vers Netlify.
- **Critères** : aucune page générée n'exécute de script ni ne lit de cookie ; aucun faux avis ni fait inventé ; coût moyen mesuré sous 2 € par maquette.

### E24 — Copilote 2D et 3D · **M**
Panneau ⌘J contextuel (page, fiche sélectionnée), en streaming : questions sur les données du CRM avec les droits de la personne, délégation aux agents spécialisés, actions proposées puis validées (`toolApproval`). Les tâches longues partent dans le worker et s'affichent en carte d'exécution. Les conversations sont conservées (`AiConversation`, `AiMessage`). Dans la 3D, les modules s'ouvrent dans les fenêtres existantes.
- **Préalable** : mesurer la durée de streaming réellement permise par les fonctions Netlify.
- **Critères** : le copilote ne voit que ce que la personne voit ; aucune action sans validation.

### E25 — Stratège et sourcing · **M**
- Le Stratège croise le catalogue d'offres, les résultats des campagnes et la taxonomie de l'Extractor (MCP `list_sectors`) : secteurs à cibler, douleurs par métier, offre phare, angle, zones.
- Il propose une campagne brouillon (E15) et une recherche Extractor ; le lancement passe par le service CRM après validation (D27).
- Jev trie les fiches importées selon leur pertinence pour la campagne et l'offre.
- **Critères** : aucun job Extractor lancé sans validation ni hors du CRM ; chaque proposition de secteur est argumentée.

### E26 — QG 3D : espaces « Agents IA » et « Studio Web » · **M**
Deux entrées dans `features/hq/zones.ts` (touches 9 et 0), plateforme agrandie, compositions dans `scene/zones.tsx`. On y voit les agents à leur poste avec leur activité en direct, la file « À valider » et les maquettes récentes ; les modules s'ouvrent dans les fenêtres 3D. Les personnages des agents sont générés avec Meshy **après confirmation du coût**.
- **Critères** : aucune régression de la 3D (60 images/s sur la machine de référence) ni de la 2D.

### E27 — Qualité de l'IA · **S**, puis continu *(démarre avec M7)*
- Jeux d'évaluation dans `evals/` : sites figés (sans réseau), réponses étiquetées par les SDR (objectif 200 à 500), juge LLM sur une grille. Ils se lancent à la demande, avec le coût affiché.
- Tableau de bord dans `/app/agents` : coût par agent, taux d'acceptation des suggestions, éditions des brouillons, erreurs.
- Non-régression obligatoire avant de changer le modèle d'un rôle ; comparatif Jev / Haiku / règles sur nos données.
- **Critères** : chaque changement de modèle s'appuie sur une évaluation chiffrée.

### Ordre conseillé
| Jalon | Epics | Résultat visible |
|---|---|---|
| **M0 Assainir** | E0, E12 | Base propre et sûre, landing mieux référencée |
| **M1 Socle** | E1, E2, E3 | On se connecte, on invite un closer, la coque est belle |
| **M2 Prospection** | E4, E5, E7 | Rechercher, importer, traiter la file du jour |
| **M3 Conversion** | E6, E8, E11, E10 | Qualifier, planifier, suivre l'entonnoir |
| **M4 Outreach** | E9a → E9c | Envoyer et relancer avec garde-fous |
| **M4b Pilotage visuel** | E15, E16 | Campagnes mesurées, QG en 3D |
| **M5 Lancement** | E14 | Prêt pour l'équipe (E13 absorbée par M6) |
| **M6 Socle IA** | E17, E18 | Modèles interchangeables, coûts plafonnés, exécutions longues tracées |
| **M7 Assistance commerciale** | E19, E20, E21, E22 (+ E27) | Fiche auditée, offres argumentées, brouillons à relire, réponses classées |
| **M8 Studio** | E23 | Une landing de démonstration à montrer au prospect |
| **M9 Copilote et sourcing** | E24, E25 | Un assistant partout, des campagnes proposées par l'IA |
| **M10 QG IA** | E26 | L'agence IA visible dans le QG 3D |

E1 peut démarrer en parallèle d'E0 ; E5 peut commencer dès que E3 fixe le modèle. M6 ne dépend pas de M5, mais mieux vaut disposer des sauvegardes et de la supervision d'E14 avant d'ouvrir les agents à toute l'équipe.

---

## 13. Risques

| Risque | Gravité | Parade |
|---|---|---|
| Suppression sans sauvegarde | Haute | E0 : Git, tag, dump avant toute suppression |
| Réputation du domaine abîmée par l'envoi à froid | Haute | Domaine séparé, chauffe, plafonds, pauses automatiques |
| Non-conformité prospection / RGPD | Haute | Base légale tracée, désinscription effective, validation juridique avant M4 |
| Chiffres d'entonnoir faussés (définitions floues) | Moyenne | Fiche de définition par indicateur (E10) |
| Fuite de la clé Extractor | Haute | Appels serveur uniquement, rotation, journal |
| Rendez-vous : erreurs de fuseau | Moyenne | Fonction pure testée, UTC partout |
| Dépendance à un modèle ou à un fournisseur IA | Moyenne | Registre de modèles par rôle, secours automatiques de la passerelle, évaluation avant tout changement (E27) |
| Dépassement du budget IA | Moyenne | Plafond dur avec réservation verrouillée, quotas par personne, devis avant tout traitement en masse (D22) |
| Injection de consignes depuis un site audité | Haute | Extraction sans outils en sortie structurée, validation de toute action externe, liste blanche des outils |
| Affirmation fausse dans un pitch ou une maquette | Haute | Faits sourcés obligatoires, preuves affichées, relecture humaine, aucun faux avis |
| Transfert de données hors UE | Moyenne | DPA, minimisation, information dans la politique de confidentialité, registre des traitements (D16) |
| Panne de la passerelle ou d'un fournisseur | Moyenne | Secours entre fournisseurs ; l'IA reste une assistance : le CRM fonctionne sans elle |
| Maquette jugée trompeuse, ou contenu du prospect réutilisé | Moyenne | Lien privé non indexé, mention « maquette non contractuelle », expiration et purge, contenu du prospect utilisé seulement pour sa propre maquette |
| Qualité d'un modèle qui change à une mise à jour | Moyenne | Versions de modèles fixées, jeux d'évaluation, tableau de bord qualité (E27) |
| Google bloque l'Extractor à grande échelle | Moyenne | Santé affichée dans le CRM, cadence modérée ; tolérance sur plusieurs jours **non mesurée** |
| Perte de données lors de la migration | Moyenne | Dump, essai sur copie, contrôles avant / après |

---

## 14. Questions à me confirmer
1. Où est hébergée la boîte `contact@cleads.fr` (Google Workspace, Microsoft 365, OVH, autre) ?
2. Y a-t-il des données de production à conserver (rendez-vous, utilisateurs) ? Où est la base (Neon, Supabase, autre) ?
3. Le CRM servira-t-il **uniquement Cleads**, ou aussi vos clients à terme (D3) ?
4. Combien de personnes dans l'équipe dès le premier mois, et quels rôles ?
5. Quel nom de domaine secondaire pour le démarchage ?
6. Les décisions D1 à D12 : acceptez-vous mes recommandations ?

**Pour la couche agentique (E17 à E27)**
7. *(E18)* Où est hébergée la base de production (Neon, Supabase, le VPS, autre) ? Le worker du VPS doit pouvoir s'y connecter.
8. *(E17, E20)* Créer la clé Vercel AI Gateway (compte Vercel) et la clé gratuite Google PageSpeed Insights.
9. *(E23)* Ajouter l'enregistrement DNS de `apercu.cleads.fr` vers Netlify.
10. *(E19)* Valider les prix, livrables et cas d'usage du catalogue d'offres V1 ([AGENTS-IA.md](AGENTS-IA.md), section 14).
11. *(E26)* Confirmer les crédits Meshy pour les personnages des agents, le moment venu.
12. Accepter les DPA des fournisseurs IA, puis compléter la politique de confidentialité et le registre des traitements.
