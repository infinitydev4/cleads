# Activités, tâches et file « Aujourd'hui »

Écrans : l'accueil du CRM (`/app`, « Aujourd'hui ») et, sur la fiche d'un prospect, les blocs **À faire** et **Historique**.

## Historique d'une fiche

Une seule chronologie, du plus récent au plus ancien : notes, appels, tâches, changements de statut, événements d'opportunité, import. Filtres : tout, notes, appels, tâches, changements. Les 30 dernières entrées arrivent avec la fiche, « Voir plus » charge la suite sans trou ni doublon (même sous filtre).

Règle : **rien ne se fait sans laisser une ligne**. Créer, renommer, reporter, confier, terminer, rouvrir, abandonner ou supprimer une tâche écrit exactement une entrée, dans la même transaction que le changement ; ne rien changer n'écrit rien ; deux personnes qui cochent la même tâche en même temps laissent une seule ligne (testé en parallèle). Une note ne se modifie ni ne se supprime.

## Appels

Bouton **Appel** (touche `c`) sur la fiche, bouton **Appel** sur chaque ligne de la file. Un seul choix obligatoire, le **résultat** : joint, pas de réponse, répondeur, à rappeler, mauvais numéro. Durée et note sont facultatives. `Ctrl`/`⌘` + `Entrée` enregistre.

| Résultat | Effet sur la fiche |
|---|---|
| Joint | « Nouveau » ou « Contacté » devient « A répondu » ; dernier contact mis à jour |
| Pas de réponse, répondeur, à rappeler | « Nouveau » devient « Contacté » ; dernier contact mis à jour |
| Mauvais numéro | rien : ce n'est pas un contact |

La relance se planifie dans le même geste (demain proposé après un appel sans réponse, un répondeur ou « à rappeler ») ; si l'appel part d'une tâche, il propose de la terminer. Une fiche « ne pas contacter » refuse toute relance.

## Tâches

Un titre, une **date** (un jour, pas une heure : « en retard » veut dire avant le début de la journée à Paris, y compris les jours de changement d'heure), une personne. Une tâche est toujours rattachée à une fiche.

| Qui | Peut |
|---|---|
| Qui écrit sur la fiche, et le closer qui détient son opportunité ouverte | créer une tâche, noter, appeler |
| Propriétaire, manager | confier une tâche à n'importe quel membre actif (sauf lecteur) |
| Les autres | la prendre pour eux, ou la confier à qui détient la fiche (responsable, closer de l'opportunité) : un SDR demande au closer de rappeler, rien de plus large |
| Assigné, auteur, qui écrit la fiche | terminer, rouvrir, reporter, renommer |
| Auteur, manager, propriétaire | supprimer |
| Lecteur | voir, jamais modifier |

Le closer qui détient l'opportunité peut noter, appeler et planifier sur une fiche dont il n'est pas responsable (avant E7 il ne pouvait que la lire). Une personne garde le droit de terminer une tâche qui lui est confiée même si elle ne voit plus la fiche.

Quand un prospect est **disqualifié** ou passe en « ne pas contacter », ses tâches ouvertes sont abandonnées, avec la raison dans l'historique. Fusionner deux fiches garde les tâches sur celle qui reste. Une tâche ne se rouvre pas sur une fiche fermée.

## La file « Aujourd'hui »

Pour chaque membre, **Ma file** :

1. **En retard** puis **Aujourd'hui** : ses tâches ;
2. **Rendez-vous du jour** : ceux qu'il reçoit (pas les annulés) ;
3. **À planifier** : ce qui mérite une prochaine étape et n'en a pas ;
4. **À venir** (15 prochaines) et **Sans date**.

| Rôle | « À planifier » contient |
|---|---|
| SDR | ses fiches « A répondu » sans tâche, puis ses fiches neuves avec téléphone, meilleur score d'abord |
| Closer | ses opportunités ouvertes sans tâche, la plus ancienne mise à jour d'abord |
| Manager, propriétaire | les deux premières listes pour ce qu'ils portent eux-mêmes |

Manager, propriétaire et lecteur ont aussi **Équipe** (tâches en retard et du jour de tous, rendez-vous de tous, en lecture seule pour le lecteur). Un SDR ou un closer qui demande l'équipe obtient sa propre file.

**La file se vide sans quitter l'écran** : cocher, reporter (demain, dans 3 jours, lundi prochain, dans une semaine), planifier une suggestion ou enregistrer un appel met l'écran à jour tout de suite ; si le serveur refuse, la ligne revient avec la raison. Terminer une tâche propose « Annuler ».

## Choix techniques

- **Schéma** : une seule valeur ajoutée, `ActivityKind.TASK` (migration `20261030000400_task_activity_kind`, additive). Résultat et durée d'un appel sont dans `Activity.data` (JSON) : aucune colonne nouvelle, les anciens appels restent lisibles.
- **Visibilité d'une tâche** : on la voit si elle nous est confiée ou si on peut lire sa fiche. (Détail qui a coûté un test : un filtre de relation vide dans un `OR` Prisma ne retient rien, le périmètre est donc toujours écrit en entier.)
- Tout est vérifié **sur le serveur** (`features/activity/`), l'interface n'est qu'un confort.

## Pas dans cette version

- Rappels par email ou notification quand une tâche arrive à échéance (worker de l'emailing, E9, et notifications, E11) : la file et le décompte de l'accueil en tiennent lieu.
- Tâches sans fiche (rappels personnels) ; heure d'échéance ; tâches récurrentes.
- Rendez-vous et emails dans l'historique : ils y entrent avec leurs epics (E8, E9) ; la file affiche déjà les rendez-vous du jour.
- Compteur d'en-retard dans la navigation.
