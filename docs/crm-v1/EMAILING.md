# Emailing de prospection (E9a)

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

- Tests : `tests/outreach.test.ts` (règles, modèles, chiffrement, jetons, erreurs SMTP) et `tests/outreach.integration.test.ts` (base jetable : plafond en parallèle, exclusions, droits, échecs, désinscription concurrente, modèles).
- Dans le navigateur, sur une base jetable avec un faux serveur SMTP local : ajout d'une boîte avec test de connexion, email de test reçu (en-têtes, `Message-ID`, pied de page), modèle créé puis rempli depuis une fiche, envoi par un SDR, historique et statut « Contacté » à jour, désinscription par la page, puis envoi bloqué avec les raisons affichées.
- **Pas encore vérifié** : un envoi réel depuis une vraie boîte vers Gmail ou Outlook, et l'arrivée en boîte de réception plutôt qu'en spam.

## Pas dans ce jalon

- **E9b** : lecture des réponses par IMAP (rattachement par `In-Reply-To`), classement des réponses, rebonds lus dans les boîtes. Il faut une tâche régulière : une fonction planifiée Netlify toutes les quelques minutes suffit pour quelques boîtes ; le VPS OVH reste l'option si le volume grandit.
- **E9c** : séquences, arrêt automatique (réponse, rebond, désinscription, plainte), fenêtres horaires, délais aléatoires, pause automatique sur seuils, tableau de délivrabilité. Cette étape n'est lancée que si les premiers envois montrent des rebonds et des plaintes sous contrôle.
- Connexion OAuth (API Gmail, Microsoft Graph) : à ajouter si l'hébergeur choisi refuse les mots de passe d'application.
- Un envoi resté `SENDING` après un plantage du serveur garde sa place dans le plafond jusqu'au lendemain ; le nettoyage arrivera avec la tâche régulière d'E9b.
