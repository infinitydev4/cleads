# Envoi des emails du CRM (fournisseurs)

Page : **Réglages → Fournisseurs d'envoi** (`/app/settings/emails`, propriétaire seulement).

## Deux circuits, jamais mélangés

| Circuit | Pour quoi | Par où |
|---|---|---|
| **Transactionnel** | confirmations et rappels de rendez-vous, invitations, notifications, formulaire de contact | **Amazon SES** par défaut, **Resend** en secours |
| **Prospection** (E9a) | cold mail, séquences | boîtes dédiées sur des domaines secondaires, jamais SES ni Resend |

Pourquoi : les conditions de SES et de Resend interdisent l'envoi non sollicité. Une suspension du compte arrêterait aussi les emails de rendez-vous. Le code l'impose : `sendMail(message, { purpose })` **lève une erreur** si la finalité n'est pas `transactional` (testé, y compris en désactivant le garde-fou pour vérifier que le test échoue).

## Comment un email part

`lib/mail` : une interface (`MailProvider`), deux fournisseurs (`ses`, `resend`), un point d'entrée (`sendMail`).
1. Les destinataires sont mis en minuscules et dédoublonnés.
2. Une adresse en **rebond définitif** ou qui a **porté plainte** ne reçoit plus rien, transactionnel compris. Un désabonnement à la prospection n'empêche pas une confirmation de rendez-vous.
3. Le fournisseur choisi dans les réglages est essayé en premier ; s'il échoue et que le **secours automatique** est actif, l'autre prend le relais. Chaque échec est consigné.
4. `sendMail` ne lève jamais d'erreur pour une panne de fournisseur : l'appelant reçoit le résultat (`ok`, fournisseur, échecs) et décide. Une réservation est conservée même si son email n'a pas pu partir.

Sans réglage enregistré, le défaut est SES si ses clés sont présentes, sinon Resend (`MAIL_PROVIDER` force un défaut). Choisir un fournisseur sans clés est refusé.

## Identifiants

Variables d'environnement (jamais en base) : `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_REGION` (défaut `eu-north-1`). Netlify réserve les noms `AWS_*`, d'où ces noms. La clé est celle de l'utilisateur IAM **`cleads-crm-ses-sender`**, sans accès console, avec la seule politique `cleads-ses-send-only` : envoyer depuis `cleads.fr` et `contact@cleads.fr` (région de Stockholm), et lire le quota (`ses:GetAccount`).

## Rebonds et plaintes

SES publie ses événements (jeu de configuration) vers un sujet SNS, qui appelle `POST /api/webhooks/ses`. Trois vérifications avant de croire un message :
- la **signature AWS** (certificat téléchargé uniquement depuis un hôte `sns.*.amazonaws.com`) ;
- le **sujet** : seul `SES_SNS_TOPIC_ARN` est accepté (une signature valide d'un autre compte ne compte pas) ; sans cette variable la route répond 503 ;
- l'URL de confirmation d'abonnement, qui doit être sur un hôte SNS.

Un rebond **définitif** ajoute l'adresse à la liste d'exclusion (`BOUNCED`) et marque le contact « ne pas contacter » ; une **plainte** fait de même (`COMPLAINED`) et l'emporte sur un désabonnement. Un rebond temporaire (boîte pleine) ne suspend rien. Rejouer un événement ne change rien.

## Mise en route (à faire une fois)

1. AWS IAM → utilisateur `cleads-crm-ses-sender` → *Security credentials* → *Create access key* (cas d'usage « application hors AWS »). Copier la clé **une seule fois** dans Netlify (`SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`) et, pour les tests locaux, dans `.env`.
2. Page « Fournisseurs d'envoi » : « M'envoyer un test » sur SES.
3. Suivi des rebonds (avant tout envoi en volume) : SES → *Configuration sets* → créer `cleads-default` ; SNS → créer un sujet `cleads-ses-events` ; dans le jeu de configuration, ajouter une destination d'événements (rebonds et plaintes) vers ce sujet ; abonner `https://cleads.fr/api/webhooks/ses` (HTTPS) au sujet ; renseigner `SES_CONFIGURATION_SET` et `SES_SNS_TOPIC_ARN`. Le site doit être déployé avant l'abonnement.

## Pas dans cette version

- Pas de choix de fournisseur par type d'email : un seul fournisseur actif pour tout le transactionnel.
- Les boîtes de prospection (identifiants chiffrés en base, quotas, chauffe) : voir [EMAILING.md](EMAILING.md).
- SMTP générique (Zoho, etc.) : volontairement absent du transactionnel ; Zoho reste la messagerie humaine.
