# Emailing de prospection (E9a, E9b)

Pages : **Emails** (`/app/mailbox` : journal d'envoi et modèles), **Réglages → Boîtes d'envoi** (`/app/settings/mailboxes`, propriétaire seulement), bouton **Email** sur la fiche (raccourci `e`). Code : `features/outreach/`.

## Ce qui est livré (jalon a)

- **Boîtes d'envoi** : de vraies boîtes sur les domaines secondaires (`trycleads.com`, `usecleads.com`), branchées en SMTP (envoi) et IMAP (copie dans « Envoyés »). Le mot de passe est chiffré en AES-256-GCM avec la clé `MAILBOX_SECRET_KEY`, qui n'est jamais en base et n'est jamais renvoyée au navigateur. Une boîte sur `cleads.fr` est refusée par le code (`OUTREACH_PROTECTED_DOMAINS`).
- **Test de connexion** à l'enregistrement, au bouton « Tester » et à chaque réactivation. Une boîte qui échoue passe « En erreur » avec la raison et n'envoie plus rien. Un mot de passe refusé pendant un envoi met aussi la boîte en erreur.
- **Envoi 1 à 1** depuis la fiche, avec ou sans modèle, en texte brut : pas de HTML, pas de pixel de suivi, pas de pièce jointe.
- **Modèles à variables** : `{{prenom}}`, `{{nom}}`, `{{entreprise}}`, `{{ville}}`, `{{secteur}}`, `{{site}}`, `{{expediteur}}`, `{{expediteur_prenom}}`. Une valeur de secours s'écrit `{{prenom|Madame, Monsieur}}` ; `{{prenom|}}` efface la variable. Une variable inconnue est refusée à l'enregistrement ; un message où il reste `{{…}}` ne part pas.
- **Pied de page imposé** sous chaque message : signature de la boîte, origine de l'adresse, lien de désinscription. Les en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post` permettent la désinscription en un clic (RFC 8058).
- **Désinscription** : la page `/u/<jeton>` affiche l'adresse masquée et attend un clic (un GET ne désinscrit jamais, parce que les antivirus ouvrent les liens). Le POST un clic arrive sur `/api/public/unsubscribe/<jeton>`. Le jeton signe l'identifiant du message, jamais l'adresse. Effet : ligne `Suppression` (`UNSUBSCRIBED`), contact « ne pas contacter », ligne dans l'historique. Un motif plus fort déjà enregistré (rebond, plainte) est gardé, et un double clic ne change rien.
- **Chauffe et plafonds** : 5, 10, 20 puis 30 envois par jour, semaine après semaine pendant 4 semaines, jamais au-dessus du plafond de la boîte, et 50 par jour au plus. Une boîte qui envoie déjà depuis longtemps peut sauter la chauffe ; on peut aussi la recommencer.
- **Journal d'envoi** : chaque message (`EmailMessage`) garde l'expéditeur, le destinataire, l'objet, le texte exact envoyé, le `Message-ID`, le statut et la raison d'un échec. Le propriétaire et les managers voient tous les envois de l'équipe ; les autres membres ne voient que les leurs.

## Réponses et rebonds (jalon b)

Onglet **Réponses** de la page Emails (pastille de non-lus), bouton **Lire les réponses** sur chaque boîte (Réglages → Boîtes d'envoi). Code : `features/outreach/{inbound,poll,replies}.ts`.

- **Lecture** : toutes les 5 minutes, chaque boîte active avec un serveur IMAP est lue en lecture seule (aucun message n'est marqué lu, déplacé ni supprimé). La fonction planifiée `netlify/functions/mailbox-poll.mts` appelle `POST /api/cron/mailbox-poll` (protégé par `CRON_SECRET`, comme les rappels de rendez-vous). Une boîte n'est lue que par un seul traitement à la fois ; relire un message ne le duplique pas. Première lecture : 14 jours en arrière, 100 messages par passage.
- **Rattachement** : une réponse est reconnue par `In-Reply-To` / `References`, qui doivent contenir le `Message-ID` d'un email envoyé par cette boîte. Le reste de la boîte (newsletters, courrier personnel, mails sans lien avec un envoi) est ignoré et jamais stocké.
- **Réponse humaine** : ligne `INBOUND` dans le journal, entrée « répondu » dans l'historique de la fiche, statut **Nouveau / Contacté → Répondu**. Seul le texte écrit est gardé (l'historique cité est coupé).
- **Réponse automatique** (absence, `Auto-Submitted`, `Precedence: bulk`…) : rangée d'office « Absent », déjà lue, **sans** changer le statut de la fiche.
- **Rebond définitif** (rapport 5.x.x) : l'email passe en **Rebond**, l'adresse entre dans la liste d'exclusion (`BOUNCED`), le contact devient « ne pas contacter », la fiche le note. Un rebond **temporaire** (4.x.x, retard) est noté sur la fiche et ne bloque rien. Un rebond sur un email de test n'exclut personne. Un rebond non rattachable à un de nos envois est ignoré.
- **Classement manuel** : Intéressé, Pas maintenant, Pas intéressé, Absent, Mauvais interlocuteur, Ne plus écrire, Autre. Classer ouvre le message (lu) et note le choix sur la fiche. Seul **Ne plus écrire** a un effet : l'adresse écrite et celle qui a répondu sont exclues, comme après un clic de désinscription. Les autres classes n'ont pas d'effet sur le statut de la fiche : qualifier ou disqualifier reste une décision de la personne.
- **Droits** : propriétaire et managers voient les réponses de l'équipe, les autres seulement celles à leurs envois.
- **Panne** : identifiants IMAP refusés → la boîte passe « En erreur » (elle n'envoie plus non plus) ; réseau coupé → l'erreur s'affiche sur la boîte, la lecture reprend seule.
- **Envois bloqués** : un email resté `SENDING` plus de 15 minutes passe en échec (« vérifiez le dossier Envoyés ») et libère sa place du jour.

## Ce qui bloque un envoi (vérifié sur le serveur)

Dans l'ordre :
1. la personne n'a pas le droit d'écrire à la fiche (voir plus bas) ;
2. la fiche est « ne pas contacter », ou son contact l'est (on ne contourne pas son refus par l'adresse `contact@` de l'entreprise) ;
3. il n'y a aucune adresse ;
4. l'adresse ou son domaine est dans la liste d'exclusion (vérifié une deuxième fois sous verrou, au moment de l'envoi) ;
5. l'adresse est générique et l'envoi n'a pas été confirmé ;
6. il reste une variable non remplie ;
7. la boîte n'est pas à la personne, ou elle est en pause ou en erreur, ou son plafond du jour est atteint ;
8. un email est déjà parti vers cette adresse dans les 10 dernières minutes (double clic).

**Plafond garanti même en parallèle** : l'envoi verrouille la ligne de la boîte (`SELECT … FOR UPDATE`), compte les envois du jour (heure de Paris), puis réserve une place (`SENDING`) avant de libérer le verrou. L'appel au serveur SMTP se fait hors du verrou. Testé : 10 envois simultanés pour un plafond de 5 en laissent passer 5. Sans le verrou, le test échoue (10 envois passent). Un envoi en échec ne compte pas dans le plafond.

## Qui peut quoi

| Action | Qui |
|---|---|
| Ajouter, modifier, tester, mettre en pause une boîte | propriétaire (`mailbox:manage`) |
| Écrire à une fiche | la personne à qui elle est attribuée ; le closer qui porte son opportunité ouverte ; propriétaire et managers sur toutes. Un SDR s'attribue d'abord une fiche du pool, pour que deux personnes n'écrivent jamais au même prospect. |
| Depuis quelle boîte | la sienne ; propriétaire et managers peuvent utiliser toutes les boîtes |
| Créer, modifier, archiver un modèle | propriétaire, manager, SDR (`sequence:manage`) |

## Mise en route

1. **Variables** (Netlify et `.env`) :
   - `MAILBOX_SECRET_KEY` = `openssl rand -base64 32`. Ne plus la changer : les mots de passe enregistrés ne seraient plus lisibles.
   - Facultatives : `OUTREACH_LINK_SECRET` (signature des liens ; à défaut, `NEXTAUTH_SECRET`), `OUTREACH_LINK_BASE_URL` (pour servir les liens de désinscription depuis un domaine de prospection plutôt que cleads.fr), `OUTREACH_PROTECTED_DOMAINS` (`cleads.fr` par défaut).
2. **Migration** `20261031000000_outreach_mailboxes` : additive, appliquée par le build. Faire un dump de la base avant.
3. **Domaines** : sur chaque domaine de prospection, configurer SPF, DKIM (fournis par l'hébergeur des boîtes) et DMARC (`p=none` au début, avec un rapport), et rediriger le site vers cleads.fr.
4. **Boîtes** : chez l'hébergeur choisi, créer 1 à 2 boîtes par domaine, puis les ajouter dans Réglages → Boîtes d'envoi. Le formulaire préremplit les serveurs de Google Workspace, Zoho, Namecheap Private Email, OVHcloud et Microsoft 365. Avec la validation en deux étapes, il faut un mot de passe d'application.
5. **Premier test** : « M'envoyer un test » sur chaque boîte. Vérifier que le message arrive en boîte de réception (pas en spam) et que le lien de désinscription s'affiche.

## Vérifié

- E9b : `tests/inbound.test.ts` (rapports de rebond, retards, réponses, absences, citations) et `tests/replies.integration.test.ts` (base jetable, faux serveur IMAP : réponse rattachée, relecture sans doublon, boucle concurrente, absence, courrier étranger, rebond définitif/temporaire/de test, identifiants refusés, envoi bloqué, classement et « Ne plus écrire »). Un test a été vérifié en retirant volontairement l'exclusion : il échoue. **Pas encore vérifié** : la lecture IMAP contre un vrai serveur Google (le faux serveur remplace `transport.fetchNew`), et la fonction planifiée Netlify en production.

- Tests : `tests/outreach.test.ts` (règles, modèles, chiffrement, jetons, erreurs SMTP) et `tests/outreach.integration.test.ts` (base jetable : plafond en parallèle, exclusions, droits, échecs, désinscription concurrente, modèles).
- Dans le navigateur, sur une base jetable avec un faux serveur SMTP local : ajout d'une boîte avec test de connexion, email de test reçu (en-têtes, `Message-ID`, pied de page), modèle créé puis rempli depuis une fiche, envoi par un SDR, historique et statut « Contacté » à jour, désinscription par la page, puis envoi bloqué avec les raisons affichées.
- **Pas encore vérifié** : un envoi réel depuis une vraie boîte vers Gmail ou Outlook, et l'arrivée en boîte de réception plutôt qu'en spam.

## Pas dans ce jalon

- **E9b** (fait, ci-dessus). Pas encore : classement assisté par IA, notification à l'arrivée d'une réponse, réponse depuis le CRM (on répond pour l'instant depuis la messagerie de la boîte), plaintes de spam (les fournisseurs de boîtes ne les renvoient pas toujours ; SES les gère déjà côté transactionnel).
- **E9c** : séquences, arrêt automatique (réponse, rebond, désinscription, plainte), fenêtres horaires, délais aléatoires, pause automatique sur seuils, tableau de délivrabilité. Cette étape n'est lancée que si les premiers envois montrent des rebonds et des plaintes sous contrôle.
- Connexion OAuth (API Gmail, Microsoft Graph) : à ajouter si l'hébergeur choisi refuse les mots de passe d'application.
