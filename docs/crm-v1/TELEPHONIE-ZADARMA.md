# Téléphonie Zadarma (E32)

Les appels passés et reçus sur le standard Zadarma arrivent dans Cleads tout seuls. Ils sont rangés sur la fiche du prospect et attribués au closer qui a appelé.

## Ce que fait le lot 1

| Quoi | Où |
|---|---|
| Recevoir la fin de chaque appel, sortant ou entrant, et l'enregistrement quand il est prêt | `POST /api/webhooks/zadarma`, signé avec le secret API |
| Valider l'adresse quand Zadarma l'enregistre (`?zd_echo=…`) | `GET /api/webhooks/zadarma` |
| Rattraper chaque nuit les appels des dernières 48 h qu'aucune notification n'a apportés | cron `/api/cron/calls-sync`, chaque jour à 3 h 30 UTC |
| Donner un lien d'écoute valable 30 minutes | `GET /api/calls/:id/recording` |
| Associer un poste du standard à un membre de l'équipe | Réglages › Équipe, colonne « Poste Zadarma » |

### Comment un appel est rangé

- **Le closer :** son poste (`internal`, ou `last_internal` pour un appel entrant) désigne le membre qui a ce poste.
- **La fiche :** le numéro de l'autre personne est remis au format du CRM (`+33…`), puis on cherche la fiche dont l'entreprise ou le contact a ce numéro. On prend d'abord une fiche du closer, sinon la plus récemment modifiée.
- **Le journal :** l'appel apparaît comme une activité « Appel ». On y garde la durée, le résultat donné par le standard (`disposition`) et le lien vers la ligne `PhoneCall`.
- **Le résultat :** un appel sans réponse est noté « Pas de réponse », un numéro inexistant « Mauvais numéro ». Pour un appel décroché, le résultat reste à préciser par le closer (`pending`) : lui seul sait si c'était la bonne personne ou un répondeur.
- **Un appel compté une seule fois :**
  - si le closer note l'appel dans les 30 minutes après le standard, sa note complète la même activité ;
  - si le closer l'a noté avant, le standard ajoute ses informations à la note du closer.
- **Le statut de la fiche :** même règle qu'un appel noté à la main. Une tentative fait passer la fiche de « Nouveau » à « Contacté ». Un prospect qui appelle et à qui l'on répond passe en « A répondu », ce qui arrête ses séquences. Un appel entrant manqué apparaît dans l'historique sans rien changer d'autre.
- **Le reste :**
  - un appel vers un numéro absent du CRM est quand même conservé, sans fiche ;
  - un échec de notre côté (crédit, limite) est conservé, mais n'apparaît pas sur la fiche.
- **Rejouer sans risque :** une même notification reçue deux fois, ou l'appel retrouvé ensuite par la synchronisation de nuit, ne fait que mettre à jour les informations.

Les enregistrements restent chez Zadarma : Cleads ne garde que leur identifiant et demande un lien temporaire quand quelqu'un veut écouter. Peuvent écouter :

- le closer qui a passé l'appel ;
- les managers et le propriétaire ;
- toute personne qui a le droit de lire la fiche.

## Mise en service (propriétaire)

1. **Dans Zadarma :**
   - créer un poste par closer (Mon standard › Postes), et activer l'enregistrement des appels si vous le voulez ;
   - installer l'application Zadarma ou un softphone sur l'ordinateur ou le téléphone du closer.
2. **Clés API :**
   - les générer dans Zadarma (Réglages › API) ;
   - les coller vous-même dans Vercel (Production) sous `ZADARMA_API_KEY` et `ZADARMA_API_SECRET` ;
   - si le fuseau horaire du compte Zadarma n'est pas Paris, ajouter aussi `ZADARMA_TIMEZONE`, par exemple `Africa/Algiers`.
3. **Dans Cleads :** saisir le numéro de poste de chaque membre dans Réglages › Équipe.
4. **Activer les notifications :**
   - dans Zadarma, Réglages › Intégrations et API › Notifications, coller `https://cleads.fr/api/webhooks/zadarma` dans le champ des notifications du standard, puis cliquer sur « Activer » ;
   - Zadarma vérifie alors l'adresse (`zd_echo`) ;
   - cocher au moins les notifications de fin d'appel (entrant et sortant) et d'enregistrement.
5. **Vérifier :** passer un appel test vers le numéro d'une fiche. Il doit apparaître dans l'historique de cette fiche une fois l'appel terminé.

## Limites connues

- **Fuseau horaire :** Zadarma écrit les heures sans fuseau horaire. Elles sont lues dans `ZADARMA_TIMEZONE`, par défaut Europe/Paris.
- **Volume de la synchronisation de nuit :** elle lit au plus 1 000 appels par sens sur 48 heures, car Zadarma n'autorise que 3 lectures de statistiques par minute. Un message est écrit dans les journaux si cette limite est atteinte.
- **Postes :** un seul poste par membre, et un même poste ne peut pas être donné à deux membres.

## Obligations (CNIL)

Si les appels sont enregistrés, il faut prévenir l'interlocuteur dès le début de l'appel et lui dire à quoi sert l'enregistrement. Il faut aussi limiter leur durée de conservation, que vous réglez dans Zadarma ; six mois au plus est la recommandation habituelle. Ajoutez cette phrase au script du closer.

## Lot 2 : appeler depuis Cleads avec son casque

Le closer appelle directement dans la fiche, sans application à installer : son casque, branché sur l'ordinateur, sert de téléphone.

| Quoi | Où |
|---|---|
| Ouvrir la ligne du closer dans le navigateur (clé WebRTC de son poste complet `479288-100`, valable 72 h, redemandée chaque jour ou dès que Zadarma la refuse) | `GET /api/telephony/webphone`, `features/telephony/webphone.ts` |
| Le téléphone : appeler, sonnerie, en ligne, couper le micro, attente, clavier, raccrocher ; appel entrant : décrocher ou refuser | `components/crm/webphone/webphone-provider.tsx`, monté dans la mise en page du CRM : l'appel continue quand on change de page |
| Les états du téléphone, testés sans navigateur | `features/telephony/webphone-state.ts` |
| Dans la fiche : bouton « Appeler », carte d'appel, puis résultat, note et relance en un écran | `app/(crm)/app/call-panel.tsx` |
| Écouter un enregistrement dans l'historique de la fiche | `RecordingPlayer`, qui passe par `/api/calls/:id/recording` |
| Appels, décrochés, temps de parole par membre, et derniers appels avec leur enregistrement | « Mes closers », `features/telephony/stats.ts` |

- Le téléphone web utilise la bibliothèque WebRTC officielle de Zadarma (`my.zadarma.com/webphoneWebRTCWidget/v9`), sans son interface : Cleads affiche ses propres boutons.
- Le micro est demandé au premier appel. S'il est refusé, la fiche explique comment l'autoriser et propose d'appeler avec le téléphone de l'ordinateur.
- Sans poste attribué ou avant la mise en service, rien ne change pour le closer : le bouton « Appeler » ouvre le téléphone de l'ordinateur, avec une phrase qui dit pourquoi.
- Le résultat choisi après l'appel complète l'activité créée par le standard : un appel reste compté une seule fois.

### Mise en service du lot 2 (propriétaire)

1. Dans Zadarma, Réglages › Intégrations et API › WebRTC widget (ou « Appels depuis le site ») : activer l'intégration et autoriser le domaine `cleads.fr`. Sans cela, Zadarma refuse la clé et la fiche le dit.
2. Vérifier que chaque closer a son poste dans Réglages › Équipe.
3. Le closer ouvre « Ma journée », clique sur « Appeler », autorise le micro la première fois : l'appel part de son poste.

## Plus tard

- Fiche qui s'ouvre toute seule pendant un appel entrant (aujourd'hui : une barre « Décrocher / Refuser » en bas de l'écran).
- Transcription et résumé des appels par IA (payants).
