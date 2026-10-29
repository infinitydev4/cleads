# CRM Cleads V1 — audit, périmètre et plan d'epics

> Document de cadrage. Rien n'a été supprimé ni modifié dans le code : ce plan attend vos arbitrages (section 1).
> Sources : lecture du code de `cleads-main` (≈ 48 000 lignes TS/TSX), de `audit.md` (5 août 2026, partiellement périmé : le projet est passé à Next 16 / React 19), de la home-v2, et de l'API Cleads Extractor déjà en production.

---

## 0. En une page

**Cap.** Un CRM de prospection → qualification → conversion, utilisé par une petite équipe (propriétaire, manager, SDR, closers), alimenté par Cleads Extractor, qui envoie de la prospection à froid avec prudence et dont chaque action est déjà pilotable par une API, donc par des agents IA plus tard.

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
Facturation / devis, portail client, séquences multicanales (LinkedIn, téléphone automatisé), synchronisation bidirectionnelle Google Agenda, thème sombre, 2FA, application mobile, multi-espace commercial, agents IA autonomes.

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
| `AGENT` *(V2, prévu dès le schéma)* | Compte de service pour un agent IA | Droits explicitement délégués, journalisés, jamais d'envoi sans validation |

| Action | OWNER | MANAGER | SDR | CLOSER | VIEWER |
|---|:-:|:-:|:-:|:-:|:-:|
| Voir tous les prospects | ✓ | ✓ | pool + siens | siens + liés | ✓ lecture |
| Créer / modifier un prospect | ✓ | ✓ | ✓ | siens | — |
| Lancer une recherche Extractor / importer | ✓ | ✓ | ✓ | — | — |
| Envoyer un email depuis une boîte | ✓ | ✓ | sa boîte | sa boîte | — |
| Créer / lancer une séquence | ✓ | ✓ | ✓ | — | — |
| Déplacer une opportunité | ✓ | ✓ | jusqu'à « Qualifié » | siennes | — |
| Réserver / attribuer un rendez-vous | ✓ | ✓ | ✓ | siens | — |
| Voir les rapports | ✓ | ✓ | siens | siens | ✓ |
| Inviter / désactiver un membre | ✓ | — | — | — | — |
| Exporter les données, supprimer définitivement | ✓ | export seul | — | — | — |
| Lire le journal d'audit | ✓ | ✓ | — | — | — |

**Règles d'implémentation.** Un module unique `lib/rbac` définit la matrice ; chaque route et chaque action serveur passe par `requirePermission(user, "lead:update", resource)`. Jamais de contrôle uniquement côté interface. Les filtres de portée (« siens ») sont appliqués dans la requête, pas après coup. Le middleware actuel ne protège que le préfixe d'URL : il devient une première barrière, pas la seule.

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
- `Activity.actor` accepte déjà `agent` pour la V2.

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

## 10. Intelligence artificielle : System One (Jev), Claude, OpenAI

### 10.1 Ce qu'est Jev (d'après la page de présentation de TypeSafe AI)
Un modèle « System One » **en accès anticipé (liste d'attente)** qui ne génère pas de texte libre : il renvoie **des valeurs typées avec des probabilités calibrées**, parmi un schéma de sortie défini à l'avance (jusqu'à 255 choix). Latence annoncée de 70 à 500 ms, entrée à environ 0,042 $ le million de jetons, sortie gratuite. Contexte, langues (dont le français), compatibilité OpenAI et appel d'outils : **non précisés**. Les comparaisons de vitesse et de coût viennent des propres évaluations de l'éditeur, sans benchmark public. Le prix peut être subventionné. Source : [présentation de TypeSafe](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

### 10.2 Où ce type de modèle est idéal pour le CRM
Tout ce qui est « choisir parmi N possibilités avec une confiance », en grand volume et en temps réel :
| Usage | Sortie typée |
|---|---|
| Pertinence d'un prospect pour votre cible (import de centaines de fiches) | `oui / peut-être / non` + probabilité |
| Classer une réponse reçue | `intéressé · pas maintenant · désinscription · absent · mauvaise personne · transfert · hors sujet` |
| Adresse nominative ou générique ? Poste décisionnaire ? | catégorie + confiance |
| Rapprocher deux fiches (même entreprise ?) | `oui / non` + probabilité |
| Prochaine meilleure action sur une fiche | choix parmi une liste d'actions |
| Router un lead entrant vers SDR ou closer | catégorie |

La probabilité calibrée permet un **seuil de décision** : en dessous de la confiance requise, la fiche va à un humain.

### 10.3 Où il ne sert pas
Rédiger un email, résumer un appel, répondre à un prospect, expliquer un score : il faut un modèle génératif (Claude ou GPT). Jev ne les remplace pas, il les complète.

### 10.4 Ma recommandation
1. **Ne pas dépendre de Jev en V1.** Accès anticipé, maturité inconnue, français non confirmé. S'inscrire sur la liste d'attente dès maintenant.
2. **Construire une interface `Classifier` et une interface `Generator`** (un port, plusieurs adaptateurs). En V1 : score par règles + éventuellement un petit modèle Claude / OpenAI pour la classification des réponses, derrière l'interface. Changer de fournisseur ne touche pas le reste du code.
3. **Constituer un jeu d'évaluation maison** (200 à 500 fiches et réponses étiquetées par vos SDR) : c'est l'actif qui permettra de comparer honnêtement Jev, un modèle Claude Haiku 5.5 / un modèle OpenAI léger, et les règles : précision, calibration, latence, coût, français.
4. **Génération** (accroches personnalisées, brouillons de réponse, résumés d'appels) avec Claude (Sonnet 5.5 pour la qualité, Haiku 5.5 pour le volume) ou GPT, **toujours validée par un humain en V1**. Le premier message de prospection ne part jamais sans relecture.
5. **Sécurité des agents** : le contenu des sites et des avis est une entrée non fiable (injection de consignes). Les agents n'ont accès qu'aux outils délégués, jamais à un envoi libre.

---

## 11. Architecture du code et design system

### 11.1 Arborescence cible
```
app/
  (public)/            page.tsx (landing), mentions-legales, politique-de-confidentialite, cgv, cookies, rdv/[closer]
  (auth)/auth/         login, invitation, reset
  (crm)/app/           layout (shell), today, leads, companies, deals, meetings, mailbox, sequences, reports, settings/*
  api/v1/              REST du CRM (clé de service pour agents, plus tard)
  robots.ts · sitemap.ts · llms.txt/route.ts
components/
  ui/                  primitives shadcn ré-habillées (jetons)
  crm/                 shell, data-table, kanban, timeline, filters, empty-state, command-palette, page-header…
features/<domaine>/    components/ · actions.ts (serveur) · service.ts (règles métier) · schemas.ts (zod) · queries.ts
lib/                   rbac · audit · extractor-client · mail · ai (Classifier/Generator) · time
worker/                Node + pg-boss (envois, relances, lecture des réponses, rappels)
styles/tokens.css      jetons partagés landing + CRM
```
**Règle d'or** : toute modification métier passe par `features/*/service.ts`. L'interface (actions serveur), l'API REST et plus tard un serveur MCP appellent les **mêmes** services, avec les mêmes contrôles de droits et le même journal. C'est ce qui rend le CRM « prêt pour les agents » sans rien construire de plus aujourd'hui.

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
Statuts de prospect, qualification guidée (budget, besoin, décideur, échéance : champs optionnels), création automatique de l'opportunité, kanban glisser-déposer, motifs de perte, règles de transition par rôle.
- **Critères** : un SDR qualifie une fiche en moins d'une minute au clavier ; transitions interdites refusées côté serveur.

### E7 — Activités, tâches et file « Aujourd'hui » · **M**
Chronologie unifiée, notes, appels (durée, résultat), tâches avec échéance, rappels, file du jour par rôle.
- **Critères** : aucune action sans trace dans la chronologie ; la file du jour se vide sans quitter l'écran.

### E8 — Rendez-vous (refonte) · **L**
Section 6 : disponibilités par closer, fonction de créneaux testée, agenda, page `/rdv/[closer]`, attribution, annulation / report, résultat obligatoire, rappels par le worker.
- **Critères** : tests sur changements d'heure et chevauchements ; plus aucune création de compte à la réservation ; un prospect réserve en moins de 30 secondes sur mobile.

### E9 — Emailing (3 jalons) · **L** + **M** + **L**
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

### E13 — Fondations « agents » · **M**
`api/v1` avec clés de service à portée limitée, rôle `AGENT` dans le schéma, `actor` dans les activités et le journal, interfaces `Classifier` / `Generator`, jeu d'évaluation, file de validation humaine (structure). **Aucun agent autonome en V1.**
- **Critères** : une action réalisée par clé de service est tracée comme telle ; un envoi par un agent exige une validation.

### E14 — Qualité, exploitation, conformité · **M**
Tests de bout en bout sur 5 parcours (connexion, recherche → import, qualification, réservation, envoi), Sentry, journaux structurés, sauvegardes de la base, export et effacement d'un contact, registre des traitements, déploiement automatisé avec retour arrière.
- **Critères** : pipeline vert obligatoire pour déployer ; restauration d'une sauvegarde testée une fois.

### Ordre conseillé
| Jalon | Epics | Résultat visible |
|---|---|---|
| **M0 Assainir** | E0, E12 | Base propre et sûre, landing mieux référencée |
| **M1 Socle** | E1, E2, E3 | On se connecte, on invite un closer, la coque est belle |
| **M2 Prospection** | E4, E5, E7 | Rechercher, importer, traiter la file du jour |
| **M3 Conversion** | E6, E8, E11, E10 | Qualifier, planifier, suivre l'entonnoir |
| **M4 Outreach** | E9a → E9c | Envoyer et relancer avec garde-fous |
| **M5 Lancement** | E13, E14 | Prêt pour l'équipe et pour les agents |

E1 peut démarrer en parallèle d'E0 ; E5 peut commencer dès que E3 fixe le modèle.

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
| Dépendance à un modèle IA immature (Jev) | Moyenne | Interface + jeu d'évaluation, pas de dépendance en V1 |
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
