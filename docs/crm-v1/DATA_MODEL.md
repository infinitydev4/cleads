# Modèle de données du CRM

Source : `prisma/schema.prisma` (modèles marqués « CRM data model »). Ce document donne les choix, les règles et les procédures ; le schéma reste la référence.

## Vue d'ensemble

```
Workspace ─┬─ User (workspaceId)  ·  Invitation  ·  AuditLog
           ├─ Company ──< Contact
           │      └──── Lead (une par entreprise) ──┬──< Deal ──< Meeting
           │              (société et/ou contact)   ├──< Activity
           │                                        ├──< Task
           │                                        └──< Meeting
           ├─ ImportBatch ──< Lead
           ├─ AvailabilityRule · AvailabilityException   (par hôte)
           ├─ Suppression · SavedView
```

Les tables d'envoi d'emails (boîtes, modèles, séquences, inscriptions, messages) ne sont **volontairement pas créées ici** : elles arrivent avec leur epic (E9), pour ne pas figer un schéma que rien n'utilise encore. `Suppression` existe déjà parce que l'import et les contacts en ont besoin.

## Règles portées par la base

| Règle | Où |
|---|---|
| Une entreprise ne porte qu'une fiche (`Lead`) | unique `(workspaceId, companyId)` |
| Une fiche a une entreprise ou un contact, au moins | CHECK `Lead_company_or_contact_check` |
| Une entreprise importée une seule fois | unique `(workspaceId, externalId)` (les identifiants vides ne se heurtent pas) |
| Un email, un contact ; stocké en minuscules | unique `(workspaceId, email)` + CHECK |
| Domaines d'entreprise en minuscules | CHECK |
| Score et complétude entre 0 et 100 | CHECK |
| Suppression : une adresse **ou** un domaine, jamais les deux ni aucun | CHECK |
| Un rendez-vous finit après son début | CHECK |
| Disponibilité : jour 0 à 6, minutes cohérentes | CHECK |
| Une entreprise ou un contact ayant une fiche ne se supprime pas par accident | `ON DELETE RESTRICT` |
| Supprimer une fiche supprime son historique (effacement RGPD) | `ON DELETE CASCADE` vers opportunités, activités, tâches, rendez-vous |

À ajouter en E8 : empêcher deux rendez-vous qui se chevauchent chez un même hôte (contrainte d'exclusion PostgreSQL, extension `btree_gist`). Elle ne peut pas être posée maintenant : les anciens rendez-vous, jamais contrôlés, pourraient la violer.

## Conventions

- **Espace de travail** : chaque enregistrement porte `workspaceId`, toute requête s'y limite (`CurrentUser.workspaceId`). La V1 n'en a qu'un (`ws_default`). Pas de table `Membership` tant qu'une personne n'a pas besoin d'appartenir à deux espaces : le rôle reste sur `User.role`.
- **Dates** en UTC. Un rendez-vous garde son fuseau (`timezone`, IANA). Les disponibilités sont en minutes depuis minuit, jour `0` = dimanche (comme `Date.getDay`) ; un jour avec pause = deux lignes.
- **Origine des données** (`source`, `collectedFrom`, `collectedAt`, `legalBasis` sur le contact) : de quoi répondre à une demande d'accès ou d'opposition (voir `COMPLIANCE.md` de l'Extractor).
- **Acteur** (`actorKind`) : `USER`, `SYSTEM`, et `AGENT` prévu pour les agents IA.

## Migrations

| Migration | Contenu | Risque |
|---|---|---|
| `20261030000000_rename_billing_company` | `Company` devient `BillingCompany` (société d'émission des factures) pour libérer le nom | aucune donnée touchée ; factures et RIB conservés |
| `20261030000100_crm_data_model` | tables CRM, espace par défaut `ws_default`, rattachement des comptes d'équipe, invitations et journal existants, contraintes CHECK | additive |

Vérifié sur une base contenant des comptes d'équipe, un ancien client, une invitation, une ligne de journal, une société d'émission et une facture : tout est conservé, les comptes d'équipe reçoivent l'espace, l'ancien client n'en reçoit pas.

## Reprise des données de l'ancien back-office

```bash
npm run db:backfill-legacy                 # simulation : montre le résultat, n'écrit rien
npm run db:backfill-legacy -- --apply      # copie, en une seule transaction
# options : --host-email=prenom@cleads.fr  --timezone=Europe/Paris
```

| Ancien | Nouveau |
|---|---|
| Compte `USER` (client) | `Contact` (email en minuscules, origine « Ancien back-office ») + fiche `Lead` non attribuée, statut `NEW` |
| `Appointment` | `Meeting` de l'hôte, 30 minutes, lié à la fiche ; statuts : en attente → planifié, confirmé, annulé → annulé, terminé ; l'ancien type est conservé dans les notes |
| `Availability` + `BreakTime` | `AvailabilityRule`, la pause découpant la journée |
| `Exception` | `AvailabilityException` |

Hypothèses à connaître, à vérifier sur vos données :

1. **Fuseau.** L'ancien code enregistrait l'heure choisie comme si elle était en UTC. Elle est relue comme une heure locale en `Europe/Paris` (réglable) : un rendez-vous noté 14:00 devient 13:00 UTC l'hiver et 12:00 UTC l'été. Testé sur les passages à l'heure d'été et d'hiver.
2. **Hôte.** L'ancien système n'enregistrait pas qui recevait le rendez-vous : tous vont au propriétaire le plus ancien (`--host-email` pour en choisir un autre).
3. **Adresses en doublon à la casse près** : un seul contact, avec un avertissement.

Garanties : rien n'est supprimé ni modifié dans les anciennes tables (les anciens écrans continuent de fonctionner jusqu'à E8) ; le script est rejouable (il ne crée que ce qui manque, et ne touche pas ce qu'une personne a modifié depuis) ; il vérifie que chaque rendez-vous est repris et qu'**aucun rendez-vous futur n'est perdu**, sinon il n'écrit rien.

## Nettoyage différé : tables du blog

`prisma/pending/drop-legacy-blog.sql` supprime le blog, les clés d'API IA stockées en clair et les tables de l'adaptateur NextAuth. **Il n'est pas dans les migrations automatiques** : il détruit des données. La procédure (dump, contrôle, application, mise à jour du schéma) est en tête du fichier. Les modèles concernés sont marqués `LEGACY` dans le schéma.

Conservées volontairement : facturation (une facture se garde plusieurs années), fichiers partagés, anciens rendez-vous et comptes clients (lus par les anciens écrans jusqu'à E8).

## Données de démonstration

```bash
npm run db:seed-demo              # ~40 entreprises fictives, fiches, opportunités, rendez-vous, tâches
npm run db:seed-demo -- --reset   # retire exactement ce qui a été créé
```

Tout est inventé (domaines `.example.test`, numéros `01 99 00 xx xx` réservés à la fiction). Le script refuse une base qui n'est pas sur cette machine, sauf `--force`.
