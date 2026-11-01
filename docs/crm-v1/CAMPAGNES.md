# Campagnes (E15)

Pages : **Campagnes** (`/app/campaigns`, archives : `?archived=1`), page d'une campagne (`/app/campaigns/<id>`). Code : `features/campaigns/`, indicateurs dans `features/metrics/`.

## Ce qu'est une campagne

Une **cible travaillée sur une période** : un secteur et une zone (« Cabinets comptables – Nord »), une offre et un angle, un responsable, des dates et, si on le souhaite, des objectifs de prospects et de rendez-vous. On y **range des fiches** ; une fiche appartient au plus à une campagne. Ses résultats sont **calculés** à partir de ce que le CRM sait déjà (emails, appels, réponses, opportunités, rendez-vous) : rien n'est saisi ni stocké en double.

Statuts : Brouillon → Active → En pause → Terminée. Archiver la retire des listes et des sélecteurs sans rien effacer (ses fiches et ses chiffres restent) ; on peut la restaurer.

## Ranger des fiches

| Où | Comment |
|---|---|
| Liste des prospects | cocher des fiches → « Campagne… » dans la barre d'actions (ou « Retirer de sa campagne ») |
| Fiche | champ **Campagne** sous le responsable |
| Recherche Extractor | choisir la campagne au lancement (la page d'une campagne a un bouton « Nouvelle recherche » qui la présélectionne avec sa cible) : chaque import de cette recherche y range les fiches |
| Import CSV | « Ranger les fiches dans une campagne », à l'étape des colonnes |

Règles : ranger une fiche demande le droit d'**écrire** sur cette fiche et le droit `campaign:manage` (propriétaire, manager, SDR) ; une campagne archivée ne reçoit plus de fiches. Un import range les fiches **créées** et les fiches **existantes sans campagne** ; une fiche déjà dans une autre campagne **y reste** (la vérification l'annonce : « N laissées dans leur campagne actuelle »). Chaque rangement laisse une ligne dans l'historique de la fiche. La liste des prospects se filtre par campagne, ou « Hors campagne ».

## Les chiffres

Une campagne suit **ses fiches depuis leur rangement** (un lot, pas une période) :

| Indicateur | Définition |
|---|---|
| Prospects | fiches rangées dans la campagne |
| Contactés | fiches qui ont reçu au moins un email (hors test) ou un appel |
| Réponses | fiches dont une personne a répondu par email (absences automatiques exclues) |
| Qualifiés | fiches qui ont une opportunité |
| RDV | fiches qui ont obtenu au moins un rendez-vous, hors annulés |
| Gagnés | fiches dont une opportunité est gagnée |
| Taux de réponse | réponses ÷ contactés |
| Conversion | fiches avec rendez-vous ÷ fiches de la campagne |

La page d'une campagne ajoute l'activité des 30 derniers jours (définitions de `INDICATORS`, les mêmes que la vue 3D), les prospects et rendez-vous par semaine, les recherches lancées pour elle et les séquences où ses fiches sont inscrites. Chaque intitulé affiche sa définition au survol ou au clavier.

**Pas de taux d'ouverture ni de clic** : les emails de prospection n'ont pas de pixel de suivi (E9a), ces chiffres n'existent pas. **Portée** : tous les chiffres ne comptent que les fiches que la personne voit (`lead:read`) : un SDR voit ceux de ses fiches et du pool, un closer ceux de ses fiches et des fiches liées.

## Droits

| Action | Qui |
|---|---|
| Voir les campagnes et leurs chiffres (limités aux fiches visibles) | tous les membres (`campaign:read`) |
| Créer, modifier, changer le statut, archiver | propriétaire, manager, SDR (`campaign:manage`) |
| Ranger une fiche | `campaign:manage` + droit d'écrire sur la fiche |
| Responsable d'une campagne | membre actif propriétaire, manager, SDR ou closer |

## Données

Table `Campaign` (nom unique par espace, CHECK : nom non vide, objectifs positifs, fin après début), colonnes `Lead.campaignId` et `ExtractionSearch.campaignId` (suppression de la campagne → `SET NULL`, jamais de fiche perdue). Migration additive `20261101120000_campaigns_and_hq` (elle ajoute aussi `User.hqCharacter` pour la vue 3D). Le lot d'import garde la campagne dans ses paramètres.

## Vérifié

`tests/campaigns.integration.test.ts` (base jetable) : création, nom unique, droits (closer et lecteur refusés), responsable inactif refusé, dates, cycle de statuts et journal d'audit ; rangement groupé limité aux fiches modifiables, historique, closer refusé ; changement de campagne sur la fiche, campagne archivée refusée ; filtre de la liste ; import (création, fiche existante rangée, fiche d'une autre campagne laissée) ; chiffres de chaque étape (test et absence exclus, rendez-vous annulé exclu) ; portée par rôle. Dans le navigateur : liste, page de campagne, filtre de la liste des prospects.
