# Rapports (E10)

**Pilotage › Rapports** (`/app/reports`) montre trois choses pour une période :
- jusqu'où sont allées les fiches ;
- ce que chaque personne a fait ;
- les opportunités gagnées, avec leurs montants.

Décidé le 5 novembre 2026 : décisions D54 à D59 de [PLAN.md](PLAN.md).

## Périodes

- Ce sont des **semaines (du lundi au dimanche) et des mois civils, en heure de Paris**. Elles commencent à minuit à Paris, y compris les semaines du changement d'heure. Le relevé d'un mois se lit donc tel quel.
- L'adresse porte la période (`?periode=mois&du=2026-11` ou `?periode=semaine&du=2026-11-02`). Les flèches mènent à la période précédente ou suivante, jamais à une période qui n'a pas commencé. Une adresse illisible affiche le mois en cours.
- Chaque chiffre de l'entonnoir est comparé à la période précédente : en % pour les nombres, en points pour les taux. Quand la période précédente vaut 0, aucune évolution n'est inventée.
- La vue 3D et les campagnes gardent leurs 7, 30 ou 90 jours glissants.

Code : `features/metrics/periods.ts`.

## Ce que montre la page

| Section | Contenu | Définitions |
|---|---|---|
| Entonnoir | Prospects, contactés, réponses, qualifiés, RDV pris, gagnés, puis le taux de réponse et le taux de conversion | `INDICATORS`, au survol ou au clavier |
| Par personne | Un tableau « Prospection » (contactés, réponses, qualifiés, RDV pris) et un tableau « Conversion » (RDV tenus, gagnés, perdus, montant HT signé, taux de transformation) | `PERSON_INDICATORS`, rappelées sous les tableaux |
| Gagnés | Date, entreprise, closer, auteur de l'opportunité, montant HT ; totaux par devise ; export CSV | — |

Toutes les définitions sont écrites une seule fois, dans `features/metrics/definitions.ts`. Un test vérifie qu'aucun chiffre affiché n'en manque.

## À qui revient un chiffre (D57)

- **SDR** :
  - les fiches contactées depuis ses boîtes d'envoi, ou par un appel qu'il enregistre ;
  - les réponses arrivées dans ses boîtes, hors absences automatiques ;
  - les opportunités qu'il a créées (`Deal.createdById`, rempli depuis E10) ;
  - les rendez-vous qu'il a réservés.
- **Closer** :
  - les rendez-vous qu'il anime et qui ont été tenus ;
  - les opportunités à son nom, gagnées ou perdues ;
  - leurs montants HT ;
  - gagnées ÷ (gagnées + perdues).

Une opportunité créée avant E10 n'a pas d'auteur : elle n'est attribuée à personne. Un membre désactivé reste affiché s'il a eu une activité pendant la période.

## Qui voit quoi (D58)

La matrice ne change pas :

| Rôle | Rapports (`report:read`) | Export CSV (`data:export`) |
|---|---|---|
| Propriétaire, manager | toute l'équipe | oui |
| Lecteur | toute l'équipe | non |
| SDR, closer | ses chiffres et ses gagnés : ceux qu'il porte, ou qu'il a créés | non |

Le serveur applique ces droits :
- la page appelle `requirePagePermission("report:read")` ;
- la route d'export appelle `requirePermission("data:export")` ;
- les calculs filtrent dans la requête.

## Montant au gain (D56)

Passer une opportunité en « Gagné » demande le **montant HT signé**. Cette règle vient du lot 1 ; elle est décrite dans [PIPELINE.md](PIPELINE.md). Les montants s'additionnent **par devise, sans conversion**. Les opportunités gagnées avant la règle sont comptées « sans montant ».

## Export CSV

`GET /api/reports/won?periode=…&du=…` renvoie les gagnés de la période dans un fichier prêt pour Excel en français :
- encodage UTF-8 avec sa marque ;
- `;` entre les cellules ;
- virgule décimale ;
- dates de Paris ;
- `Cache-Control: no-store`.

Une valeur qu'Excel lirait comme une formule (`=`, `+`, `-`, `@`) est précédée d'une apostrophe, car les noms d'entreprises viennent du web.

Chaque export écrit une ligne `report.exported` au journal d'audit, avec la période et le nombre de lignes, jamais leur contenu.

Code : `features/metrics/report.ts`, `features/metrics/won-csv.ts`, `app/(crm)/app/reports/`, `app/api/reports/won/route.ts`.

## Reporté en V2 (D59)

- Le pipeline ouvert par étape et le pipeline pondéré.
- Les relevés de commissions : le CRM ne connaît pas les encaissements.
- Les rapports dans la vue 3D et dans le copilote.

L'activité du jour est déjà dans « Aujourd'hui », et la délivrabilité dans Emails › Délivrabilité.
