# Agent d'appel IA (E33, lot 1)

L'agent appelle des professionnels, présente en moins de 90 secondes ce que l'audit de leur site a trouvé, pose deux
questions et réserve un rendez-vous de quelques minutes avec un chef de projet (Google Meet ou téléphone). Tout est
classé dans la fiche : résultat, résumé, transcription, coût. Maquettes : artboards 16 à 18 du canvas « Cockpit closer ».

## Comment ça marche

- **Voix et conversation** : ElevenLabs Agents. L'agent est créé par Cleads dans le compte ElevenLabs du propriétaire
  (Réglages › Connexion) ; les consignes, le premier message et la voix sont envoyés à chaque appel.
- **Ligne** : un des numéros Zadarma du compte, importé dans ElevenLabs comme « SIP trunk » par un poste de la
  centrale (Réglages › Connexion, « Importer dans ElevenLabs »). L'Arcep réserve les préfixes 01 62, 01 63, 02 70,
  02 71, 03 77, 03 78, 04 24, 04 25, 05 68, 05 69, 09 48 et 09 49 aux appels automatisés ; le propriétaire a choisi le
  11 novembre 2026 d'appeler depuis ses numéros Zadarma actuels, sous sa responsabilité.
- **Vague** : un lot de fiches (non attribuées, ou d'une campagne). Une fiche est appelée si elle a un numéro français et
  une accroche vraie : un problème trouvé par l'audit, pas de site, ou une maquette prête. Pas d'appel si la fiche est en
  « ne pas contacter », déjà en rendez-vous, ou appelée par l'agent dans les 30 derniers jours.
- **Envoi** (`features/ai-caller/service.ts`, `dispatchCalls`) : du lundi au vendredi, 10 h–13 h et 14 h–19 h (Paris),
  jamais un jour férié, deux lignes à la fois, dans le plafond mensuel. Déclenché au lancement, après chaque appel et
  par la tâche planifiée `/api/cron/ai-calls` (toutes les 5 minutes).
- **Pendant l'appel**, l'agent appelle quatre outils de Cleads (`/api/ai-caller/tools/*`), authentifiés par le jeton
  propre à l'appel : `get_slots` (créneaux du chef de projet), `book_meeting` (rendez-vous, opportunité « RDV
  planifié », email de confirmation au prospect), `callback` (tâche de rappel), `do_not_call` (fiche en « ne pas
  contacter » pour toujours).
- **Après l'appel**, le webhook signé `/api/webhooks/elevenlabs` classe le résultat, la transcription, ce que l'agent a
  appris et le coût estimé, et ajoute une ligne « Appel » à la fiche. Sans réponse ou messagerie : un second essai le
  lendemain, puis la fiche reste à l'équipe.
- **Règles** : l'agent dit qu'il est une IA dès sa première phrase (règlement européen sur l'IA, art. 50) ; il n'appelle
  que des professionnels pour leur activité (CNIL : intérêt légitime en B2B, identité et opposition simples à chaque
  appel) ; il ne cite que ce que l'audit contient.

## Mise en service (propriétaire)

1. ElevenLabs › Developers › API keys : une clé avec les droits ElevenAgents et Voices, ajoutée dans Vercel sous
   `ELEVENLABS_API_KEY` (Production), puis redéployer.
2. Réglages › Connexion › « Importer dans ElevenLabs » : choisir un numéro Zadarma, un poste réservé à l'agent et taper
   son mot de passe SIP (transmis à ElevenLabs, jamais gardé par Cleads). Dans Zadarma, ce poste doit afficher ce
   numéro pour ses appels sortants.
3. Cleads › Agent d'appel IA › Réglages › Connexion : choisir ce numéro, cliquer « Créer l'agent chez ElevenLabs »,
   choisir le chef de projet (avec son lien Google Meet dans ses Disponibilités).
4. ElevenLabs › Agents › Settings › Webhooks : un webhook post-call (transcription et échecs d'appel) vers
   `https://cleads.fr/api/webhooks/elevenlabs` ; son secret dans Vercel sous `ELEVENLABS_WEBHOOK_SECRET`.
5. Optionnel : `ZADARMA_AI_EXTENSION` = le poste de la centrale utilisé par le SIP trunk, pour que les notifications
   Zadarma de ces appels ne fassent pas une seconde ligne « Appel » sur la fiche.
6. Faire un premier essai sur son propre portable avant une vraie vague (une fiche de test à son numéro).

## Coûts

Environ 0,115 € par minute en ligne (ElevenLabs 0,08 $, le modèle, Zadarma vers un portable), soit environ 0,17 € par
appel décroché d'1 min 30 ; une sonnerie sans réponse ne coûte rien. Plafond mensuel par défaut : 60 €
(Réglages › Budget) ; l'agent s'arrête quand il est atteint.

## V2 (pas dans ce lot)

Statistiques par accroche, transfert en direct vers le closer, SMS de confirmation, autres pays que la France, rappel
automatique à l'heure demandée.
