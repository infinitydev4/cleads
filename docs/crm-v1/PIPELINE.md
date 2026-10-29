# Qualification et pipeline

Écrans : la fiche d'un prospect (bouton **Qualifier**, touche `q`) et `/app/pipeline` (colonnes).

## Qualifier

Quatre questions, toutes facultatives : **besoin**, **budget** (inconnu / pas de budget / confirmé, avec un montant indicatif si on le connaît), **interlocuteur** (inconnu / décideur / influenceur / utilisateur), **échéance**. Au clavier : `q` ouvre la qualification depuis la fiche, les flèches choisissent dans chaque groupe, `Ctrl` ou `⌘` + `Entrée` qualifie (essayé : une fiche qualifiée, closer choisi, en quelques frappes).

Trois issues :

| Action | Effet | Qui |
|---|---|---|
| **Enregistrer** | garde les réponses, ne change rien d'autre | qui peut modifier la fiche |
| **Qualifier et créer l'opportunité** | statut « Qualifié », une opportunité à la première étape, confiée à un closer (ou « à attribuer plus tard ») | SDR (ses fiches et le pool), manager, propriétaire |
| **Disqualifier** | statut « Non qualifié », motif obligatoire (liste fixe + précision), l'opportunité ouverte est marquée perdue | qui peut modifier la fiche |

Un closer ne qualifie pas : il reprend ce qu'on lui confie. Une fiche « ne pas contacter » ne se qualifie pas.

Une fiche n'a **jamais deux opportunités ouvertes** : deux personnes qui qualifient en même temps en obtiennent une (la fiche est verrouillée le temps de la décision, testé en parallèle). Qualifier de nouveau garde la même opportunité ; on peut encore y choisir le closer tant qu'elle est à la première étape.

Le menu « Statut » de la fiche suit les mêmes règles : choisir « Qualifié » crée l'opportunité (avec le même contrôle de rôle), « Non qualifié » ou « Ne pas contacter » perd ce qui est ouvert, et on ne quitte pas « Qualifié » vers « Nouveau », « Contacté » ou « A répondu » tant qu'une opportunité est ouverte.

## Étapes et règles par rôle

`Qualifié → RDV planifié → Proposition → Négociation → Gagné | Perdu`

| Rôle | Peut |
|---|---|
| Propriétaire, manager | tout déplacer, attribuer, rouvrir une opportunité gagnée ou perdue |
| Closer | déplacer, chiffrer et dater **les siennes** (aller et retour entre les étapes ouvertes, gagné, perdu) ; pas rouvrir une gagnée ou perdue, pas la donner à quelqu'un |
| SDR | créer l'opportunité en qualifiant, choisir le closer à ce moment-là ; pas la déplacer ensuite |
| Lecteur | la voir, jamais la déplacer |

Perdre demande un **motif** (liste fixe : budget insuffisant, concurrent, mauvais moment, plus de réponse, pas de besoin, autre + précision) pour pouvoir les compter dans les rapports. Une opportunité n'est rouverte que s'il n'y en a pas déjà une autre d'ouverte sur la fiche. Toute règle est vérifiée **sur le serveur** : l'interface n'est qu'un confort. Le tableau « rôle × étape de départ × étape d'arrivée » est testé en entier.

## Le tableau

- Colonnes dans l'ordre des étapes ; gagnées et perdues des **30 derniers jours** seulement.
- Chaque colonne affiche le nombre de cartes et la somme des **montants renseignés**, avec « 2/3 montants » quand il en manque : aucun total ne laisse croire que tout est chiffré.
- Glisser-déposer (souris, tactile, clavier via la poignée) **et** un menu « Déplacer » sur chaque carte pour le clavier et le mobile. Le déplacement est immédiat à l'écran ; si le serveur refuse, la carte revient et la raison s'affiche.
- Visibilité : le closer voit les siennes, le SDR le pool non attribué, manager, propriétaire et lecteur tout. Filtres : responsable, recherche.
- Cliquer une carte ouvre la fiche à côté, où l'on modifie étape, responsable, montant et date de signature prévue.

## Pas dans cette version

- Ordre des cartes à l'intérieur d'une colonne (elles sont triées par dernière mise à jour).
- Passage automatique à « RDV planifié » quand un rendez-vous est pris : arrive avec les rendez-vous (E8).
- Attribution automatique au closer disponible (tour de rôle) : V1.1.
- Pipeline pondéré et taux de conversion : rapports (E10), seulement sur les montants renseignés.
