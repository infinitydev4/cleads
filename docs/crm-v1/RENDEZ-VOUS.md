# Rendez-vous (E8)

Écrans : **Rendez-vous** (`/app/meetings`, l'agenda), **Disponibilités** (`/app/meetings/availability`), le bouton **Rendez-vous** sur la fiche d'un prospect, et deux pages publiques sans compte : `/rdv/<closer>` (réserver) et `/rdv/gerer/<lien>` (changer ou annuler).

## Qui fait quoi

| Action | Propriétaire | Manager | SDR | Closer | Lecteur |
|---|:-:|:-:|:-:|:-:|:-:|
| Voir l'agenda | tout | tout | tout | les siens | tout |
| Planifier, déplacer, annuler | ✓ | ✓ | ✓ | les siens | — |
| Placer un rendez-vous hors des disponibilités | ✓ | ✓ | — | chez lui | — |
| Indiquer le résultat, « absent » | ✓ | ✓ | — | les siens | — |
| Régler ses disponibilités et sa page publique | ✓ | ✓ (celles de tous) | — | les siennes | — |

Les droits sont dans `lib/rbac.ts` (`meeting:*`, `availability:manage`) et revérifiés côté serveur à chaque action.

## Créneaux proposés

Calculés par une **fonction pure** (`features/meetings/slots.ts`, sans horloge ni base) : horaires de la semaine du closer, moins ses jours fermés, moins ses rendez-vous (marge comprise), à partir du délai minimum et jusqu'à l'horizon. Les dates sont des instants UTC ; les jours se lisent dans le fuseau du closer.

- Changement d'heure : une heure qui n'existe pas (passage à l'été) n'est jamais proposée ; une heure qui existe deux fois (retour à l'hiver) compte une fois ; une journée de 25 h offre 25 h de créneaux.
- Deux plages qui se touchent ou se chevauchent sont fusionnées : un créneau n'est jamais proposé deux fois.
- Le serveur **recalcule** le créneau au moment de réserver ; ce qu'a vu la personne ne fait pas foi.

## Un rendez-vous ne peut pas en chevaucher un autre

Toute écriture sur les rendez-vous prend un verrou de base de données (`pg_advisory_xact_lock`, par espace de travail) puis vérifie le chevauchement : dix réservations simultanées du même créneau en laissent une (testé). Même un manager qui place un rendez-vous hors horaires ne peut pas chevaucher un autre rendez-vous.

Un contact n'a qu'**un rendez-vous actif par type**. Pas de blocage sur l'adresse IP (c'était l'ancienne règle).

## Réservation publique : aucun compte créé

`/rdv/<closer>` : un horaire, un nom, un email, une case de consentement. Téléphone, entreprise et sujet sont repliés et facultatifs. Pas de page indexée (`noindex`, `robots`), pas de cache.

À la réservation : le contact est retrouvé par son email, sinon créé (origine « Entrant », base légale « consentement ») avec sa fiche, rattachée à l'entreprise si elle existe déjà ; le rendez-vous est enregistré ; l'opportunité passe à **RDV planifié** (créée si besoin, au nom du closer) ; l'historique garde la trace. **L'email part après l'enregistrement** : s'il échoue, la réservation reste et la page l'indique.

Protection : 5 réservations par heure et par connexion, 60 lectures de créneaux par minute (table `RateLimitHit`, adresse conservée sous forme de hachage), champ piège invisible pour les robots (réponse « réussie », rien d'enregistré).

## Changer ou annuler depuis le lien

Le lien de l'email (`/rdv/gerer/<id>.<signature>`) est signé (HMAC, secret `MEETING_LINK_SECRET`, à défaut `NEXTAUTH_SECRET`) : impossible à deviner ou à falsifier, rien à stocker. Il permet de choisir un autre horaire ou d'annuler jusqu'à **2 h avant** ; après, on écrit ou on appelle. Un rendez-vous déplacé reste en base avec le statut **Reporté** et pointe vers son remplaçant : l'ancien lien affiche le nouvel horaire.

## Résultat obligatoire

Un rendez-vous passé reste **à clôturer** (bandeau de l'agenda, section de « Aujourd'hui », pastille « résultat à saisir ») jusqu'à ce que son résultat soit indiqué. Le bouton « Clôturer » reste grisé sans résultat.

| Résultat | Effet |
|---|---|
| Qualifié, on avance | opportunité « RDV planifié » ou « Qualifié » → **Proposition** ; fiche « Qualifié » |
| À relancer | tâche de relance au closer (par défaut dans 3 jours) ; opportunité remise à « Qualifié » s'il ne reste aucun rendez-vous |
| Perdu | une **raison** obligatoire (les mêmes que le pipeline) ; l'opportunité est perdue |
| Absent (sans résultat) | tâche « Relancer : absent » pour demain ; opportunité remise à « Qualifié » |

Annuler (ou laisser le contact annuler) remet l'opportunité à « Qualifié » s'il n'y a plus de rendez-vous prévu. Seuls le closer du rendez-vous, un manager ou le propriétaire clôturent.

## Emails et rappels

Transactionnels (pas du marketing) : confirmation, report, annulation, rappel, avec invitation de calendrier (`.ics`) sauf pour le rappel ; au contact **et** au closer. Un échec d'envoi n'annule jamais l'action.

**Rappels** : tâche planifiée horaire `POST /api/cron/meeting-reminders` (secret `CRON_SECRET`, comparaison à temps constant). Chaque rendez-vous des 24 prochaines heures est rappelé **une fois** par personne ; un rendez-vous pris moins de 3 h avant son début n'est pas rappelé (la confirmation suffit) ; un envoi raté rend la main pour le passage suivant. Deux passages simultanés n'envoient qu'un message.

## Ce qui a changé par rapport à l'ancien système

- `POST /api/appointments` (qui créait un compte avec mot de passe temporaire) répond **410** ; les deux endpoints publics de disponibilité ont été supprimés. L'ancien back-office garde sa lecture et sa modification pour le propriétaire.
- Le cron quotidien des anciens rappels est remplacé par le cron horaire ci-dessus (`netlify.toml`).

## Pas dans cette version

- Attribution automatique en tour de rôle : V1.1 (aujourd'hui, le prospect choisit la page d'un closer, un SDR ou un manager choisit le closer).
- Synchronisation avec Google ou Outlook : les créneaux ne tiennent pas compte d'un agenda externe, seulement de ceux du CRM.
- Lien de visio unique par rendez-vous (le lien du profil est repris pour tous).
- Tâche planifiée « du worker » : le projet n'a pas de worker ; le cron Netlify existant sert (même idée, même idempotence).
