# Registre des traitements (brouillon)

> **Brouillon du 5 novembre 2026** (E14, lot 4, D65), à faire valider par l'avocat avant tout usage. Il est tiré du code et des docs (`PLAN.md`, `AGENTS-IA.md`, `ENRICHISSEMENT.md`, `EMAILING.md`, `RENDEZ-VOUS.md`, `ENVOI-EMAILS.md`, `EXTRACTOR.md`), lus sur `main` (b23dfc1). Ce que le code ne tranche pas est marqué **Question pour l'avocat**. Quand le code change (nouvelle donnée, nouveau fournisseur, nouvelle durée), ce fichier change dans la même PR.

## Responsable du traitement

- **CLEADS LLC**, société à responsabilité limitée de l'État du Nouveau-Mexique (États-Unis). Adresse et numéro d'enregistrement : ceux des mentions légales.
- Contact pour l'exercice des droits : `contact@cleads.fr`, l'adresse du responsable dans la politique de confidentialité.
- **Représentant dans l'UE (art. 27).** CLEADS LLC n'a pas d'établissement déclaré dans l'UE et prospecte des personnes en France : le RGPD s'applique (art. 3.2). Il faut alors en principe désigner un représentant dans l'UE, sauf pour un traitement occasionnel (art. 27.2), ce que la prospection n'est pas.
  - **Question pour l'avocat** : faut-il un représentant, lequel, et faut-il le nommer dans la politique de confidentialité (art. 13.1.a et 14.1.a) ?
  - **Question pour l'avocat** : si la LLC est dirigée au quotidien depuis la France, a-t-elle un établissement en France (art. 3.1) ? Le représentant ne serait alors plus la question.
- **Délégué à la protection des données.** Aucun n'est désigné. **Question pour l'avocat** : la prospection suivie et notée (score, tri par Jev) est-elle un « suivi régulier et systématique à grande échelle » (art. 37.1.b) ?

## Vue d'ensemble

| # | Traitement | Finalité | Base légale (selon le code) | Personnes concernées |
|---|---|---|---|---|
| 1 | Prospection B2B | Trouver, qualifier et suivre des TPE et PME | Intérêt légitime (art. 6.1.f) | Dirigeants, décideurs et contacts d'entreprises |
| 2 | Emailing de prospection | Écrire 1 à 1 ou en séquence, lire les réponses, respecter les refus | Intérêt légitime, avec opposition | Contacts des fiches |
| 3 | Rendez-vous | Réserver, confirmer, rappeler, déplacer, annuler | « Consentement » à la réservation en ligne | Prospects, closers |
| 4 | Agents IA | Audits, offres, brouillons, tri, maquettes, copilote, MCP | Intérêt légitime (aide à la prospection) | Prospects (surtout leur entreprise), membres |
| 5 | Enrichissement | Identité légale, signaux, décideurs, brief, publicités | Intérêt légitime (art. 6.1.f) | Dirigeants et décideurs |
| 6 | Équipe et journal d'audit | Comptes, droits, sécurité, traçabilité | Contrat (art. 6.1.b) ; intérêt légitime pour la sécurité | Membres et invités |
| 7 | Formulaire du site | Répondre aux demandes de cleads.fr | Case « J'accepte d'être recontacté » | Visiteurs |

## Sous-traitants et destinataires

| Fournisseur | Rôle | Données | Où | Hors UE | À vérifier |
|---|---|---|---|---|---|
| **Vercel** (Vercel Inc., États-Unis) | Héberge le site et le CRM, fonctions, tâches planifiées | Toutes celles du CRM, en transit | Fonctions en `iad1` (États-Unis) d'après une lecture du 5 novembre 2026 | Oui | Région dans Settings › Functions ; DPA ; certification DPF ou clauses types |
| **Railway** (Railway Corp., États-Unis) | Base PostgreSQL et ses sauvegardes planifiées | Toutes celles du CRM | Région non documentée | Probable | Région du service ; DPA. Les fonctions Vercel doivent être « au plus près de la base » (`MIGRATION-VERCEL.md`) : si elles sont en `iad1`, la base est sans doute aux États-Unis |
| **OVH** (OVH SAS, France) | VPS : worker IA, Cleads Extractor, copie chiffrée des sauvegardes (D62, gardée 14 jours) | Toutes celles que le worker lit ; recherches de l'Extractor | Centre de données non documenté | A priori non | Localisation du VPS ; DPA |
| **Amazon Web Services** | SES : emails transactionnels (rendez-vous, invitations, notifications, formulaire). S3 : photos des membres | Adresse, objet et texte de ces emails ; photos | `eu-north-1` (Stockholm) | Société mère américaine | DPA AWS (clauses types) |
| **Resend** (États-Unis) | Secours des emails transactionnels | Comme SES | Région non documentée | Oui | Région du domaine d'envoi ; DPA |
| **Pusher** (groupe Bird) | Notifications en temps réel | Titre et texte des notifications des membres | Cluster `eu` | Non, a priori | DPA ; ce que contient chaque événement |
| **Passerelle IA de Vercel** et ses fournisseurs : Anthropic (Claude), OpenAI, Google (Gemini), Mistral (secours et dictée), le fournisseur de Jev ; Exa et Perplexity pour les recherches | Modèles des agents, recherches web | Contenu public des sites, données d'entreprise ; nom et email du contact seulement pour rédiger ; textes des réponses reçues ; requêtes de recherche (entreprise, ville, métier, nom d'un dirigeant) | Surtout aux États-Unis | Oui | `disallowPromptTraining: true` est posé (D16) ; DPA de la passerelle et de chaque fournisseur ; conservation des requêtes chez eux |
| **Meta** (bibliothèque publicitaire) | Source : publicités en cours d'une entreprise | Envoyé : nom de l'entreprise ou numéro de sa page, aucune donnée personnelle | Selon les conditions de l'API (Meta Platforms Ireland pour l'UE, à confirmer) | Pas de donnée personnelle envoyée | Conditions de l'API ; Meta est une source, pas un sous-traitant |
| **Sentry** (Functional Software Inc., États-Unis) | Erreurs du site et du worker (D64, lot 3 d'E14) | Aucune donnée personnelle : ni corps de requête, ni cookie, ni email ; un identifiant de membre au plus | Région UE | Société américaine | DPA ; réglages de nettoyage en production |
| **Google** (PageSpeed Insights) | Mesure de la vitesse d'un site pour l'audit | Adresse du site de l'entreprise | États-Unis | Pas de donnée personnelle | — |
| **Hébergeur des boîtes de prospection** (Google Workspace, Zoho, Namecheap, OVHcloud ou Microsoft 365, selon le choix) | Envoi et réception des emails de prospection | Emails envoyés et réponses | Selon l'hébergeur | Selon l'hébergeur | Lequel est utilisé ; DPA |
| **Hébergeur de `contact@cleads.fr`** | Reçoit les messages du formulaire | Nom, email, message | Non documenté | ? | Lequel ; DPA |

Accès depuis un pays tiers : un membre qui consulte les fiches depuis un pays sans décision d'adéquation (par exemple un closer en Algérie) crée a priori un transfert (lignes directrices 05/2021 du CEPD). **Question pour l'avocat** : quel contrat avec ce membre (clauses types, art. 28) ?

**Question pour l'avocat** (tous les transferts vers les États-Unis) : pour chaque fournisseur, la certification au Data Privacy Framework suffit-elle, ou faut-il des clauses types et une analyse d'impact du transfert ?

## 1. Prospection B2B

- **Finalité** : trouver des TPE et PME françaises, les qualifier et suivre leurs fiches jusqu'au gain ou à la perte : statut, score, qualification, opportunités, tâches, campagnes.
- **Base légale** : intérêt légitime (art. 6.1.f). Chaque contact garde sa source (`collectedFrom`), sa date de collecte (`collectedAt`) et sa base légale (`legalBasis`).
- **Personnes concernées** : dirigeants, décideurs et contacts des entreprises prospectées, dont des entrepreneurs individuels.
- **Données** :
  - le contact : nom, fonction, rôle (dirigeant, décideur), email professionnel, téléphone, profil LinkedIn public, « ne pas contacter » et son motif ;
  - son entreprise : nom, adresse, SIRET, SIREN, NAF, site, téléphone, email, note et nombre d'avis Google ;
  - l'historique : notes, appels (résultat, durée), changements de statut ;
  - la qualification : besoin, budget, interlocuteur, échéance ;
  - un score à règles visibles, des étiquettes, la campagne ;
  - les opportunités : étape, montant, dates, motif de perte.
- **Sources** :
  - Cleads Extractor (VPS OVH), qui interroge l'API Google Places, Google Maps sans API, OpenStreetMap, SIRENE et les sites des entreprises (≤ 4 pages par site, robots.txt respecté) ;
  - imports de fichiers CSV, saisie par l'équipe, réservation en ligne (traitement 3) ;
  - registre et recherches web (traitement 5).
- **Destinataires internes** : la matrice des rôles (`lib/rbac.ts`) : propriétaire et managers voient tout ; un SDR ses fiches et le pool non attribué ; un closer les siennes et celles où il a une opportunité ou un rendez-vous ; un lecteur lit tout.
- **Sous-traitants** : Vercel, Railway, OVH, Pusher.
- **Durée** :
  - **Ce que fait le code** : aucune purge. Une fiche reste jusqu'à ce que le propriétaire la supprime (`data:delete`). La suppression efface l'historique, les rendez-vous, les opportunités, les maquettes et les conversations du copilote qui l'ont lue, puis le contact et l'entreprise quand plus rien ne les utilise. Les emails restent (traitement 2), et l'adresse reste sur la liste d'opposition.
  - **Écart** : la politique de confidentialité annonce « 3 ans à compter du dernier contact » pour les données de prospection, ce qui correspond au repère de la CNIL. Rien ne l'applique encore.
  - **Question pour l'avocat** : confirmer 3 ans après le dernier contact venant du prospect. Une purge automatique serait alors à construire (V2).
- **Mesures** :
  - droits vérifiés côté serveur, journal d'audit ;
  - liste d'opposition vérifiée à l'import et avant chaque envoi ;
  - l'Extractor écarte les établissements en diffusion partielle (SIRENE), et l'import les entreprises fermées ; la veille du registre n'importe ni entreprise non diffusible ni entrepreneur opposé à la prospection (RNE) ;
  - export des données d'une personne et suppression (voir « Droits des personnes »).
- **Questions pour l'avocat** :
  - **Google Maps sans API** : les conditions de Google interdisent cet accès automatisé. L'Extractor l'active par défaut « à la demande du propriétaire du projet » (`cleads-extractor/docs/COMPLIANCE.md`). Quel risque, et quelle base légale pour cette collecte ?
  - **Information (art. 14)** : le premier email donne l'origine de l'adresse. Comment informer, dans le mois, une personne appelée sans avoir reçu d'email ?
  - **Profilage** : le score et le tri de Jev (traitement 4) sont-ils un profilage (art. 4.4) à mentionner dans l'information ? Aucune décision n'est automatique : une personne décide toujours (art. 22).
  - **Cas particuliers** (`PLAN.md` § 7.3) : adresses génériques (`contact@`), entrepreneurs individuels, Bloctel pour les appels aux entrepreneurs individuels.
  - **Analyse d'impact (art. 35)** : le croisement de sources (Google, registre, web) et la notation l'exigent-ils ?

## 2. Emailing de prospection

- **Finalité** : envoyer des emails de prospection un par un ou en séquence (quatre messages au plus), lire les réponses, traiter les rebonds, les désinscriptions et les refus.
- **Base légale** : intérêt légitime, sur le régime B2B de l'opposition : adresse professionnelle, sujet lié à la fonction, expéditeur identifié, refus simple et gratuit dans chaque message (`PLAN.md` § 7.3). **Question pour l'avocat** : confirmer, avec l'art. L34-5 du CPCE.
- **Personnes concernées** : les contacts écrits (ou l'adresse de l'entreprise quand la fiche n'a pas de contact) ; les membres qui envoient.
- **Données** :
  - chaque message : sens, adresses, objet, texte, dates, statut (envoyé, échec, rebond) ;
  - les réponses et leur classement (intéressé, pas maintenant, ne plus écrire…), la date de désinscription, l'inscription en séquence et son motif d'arrêt ;
  - les boîtes d'envoi : adresse, nom affiché, signature, mot de passe chiffré (AES-256-GCM, clé hors base).
- **Sources** : les fiches ; les boîtes lues en IMAP, en lecture seule, toutes les 5 minutes.
- **Sous-traitants** : l'hébergeur des boîtes, sur les domaines secondaires (`trycleads.com`, `usecleads.com`), jamais `cleads.fr` ; Vercel (tâches planifiées d'envoi et de lecture) ; Railway. SES et Resend sont interdits pour la prospection, et le code le refuse.
- **Pas de suivi** : ni pixel d'ouverture ni suivi des clics.
- **Durée** :
  - **Ce que fait le code** : les messages restent sans limite. **La suppression d'une fiche ne les efface pas** : ils en sont seulement détachés (`onDelete: SetNull` sur la fiche et sur le contact), avec l'adresse, l'objet et le texte. La liste d'opposition est gardée, pour ne jamais recontacter la personne.
  - **Question pour l'avocat** : combien de temps garder les messages, et la liste d'opposition après la suppression d'une fiche ? Faut-il effacer les messages avec la fiche ? Ils servent aussi à compter les envois du jour et la santé des boîtes.
- **Mesures** :
  - pied de page imposé (signature, origine de l'adresse, lien de désinscription) et en-têtes de désinscription en un clic (RFC 8058) ;
  - arrêt automatique d'une séquence sur une réponse, un rebond, une désinscription, une plainte ou « Ne plus écrire » ;
  - plafonds quotidiens, chauffe progressive, pause automatique d'une boîte au-delà de 5 % de rebonds ou 8 % de désinscriptions.

## 3. Rendez-vous

- **Finalité** : proposer les créneaux d'un closer, réserver, confirmer, rappeler (24 h avant), déplacer ou annuler un rendez-vous.
- **Base légale** : une réservation sur `/rdv/<closer>` passe par une case de consentement ; le contact créé porte la base « consentement ». Un rendez-vous pris par l'équipe suit la base de la fiche.
  - **Question pour l'avocat** : l'art. 6.1.b (mesures précontractuelles à la demande de la personne) conviendrait-il mieux ? Le consentement peut être retiré à tout moment.
- **Personnes concernées** : les prospects qui réservent ou à qui un rendez-vous est proposé ; les closers.
- **Données** : nom, email, téléphone, entreprise et sujet (facultatifs), message laissé à la réservation, créneau et fuseau, type, statut, issue, notes, motif d'annulation ; les disponibilités des closers.
- **Sous-traitants** : AWS SES, puis Resend en secours, pour les confirmations, rappels et invitations de calendrier ; Vercel (tâche horaire des rappels) ; Railway.
- **Durée** :
  - **Ce que fait le code** : les rendez-vous restent avec la fiche. L'adresse IP des limites de réservation est gardée hachée 24 h.
  - **Question pour l'avocat** : la durée des rendez-vous passés.
- **Mesures** : page `noindex`, sans cache ; 5 réservations par heure et par connexion ; champ piège pour les robots ; liens signés pour déplacer ou annuler.

## 4. Agents IA

- **Finalité** : aider l'équipe à prospecter :
  - auditer le site d'une entreprise et recommander des offres ;
  - rédiger des brouillons d'emails et classer les réponses ;
  - trier les fiches d'une campagne (Jev) ;
  - générer des maquettes de site (Studio Web) ;
  - le copilote, les missions, et l'accès MCP au CRM.
- **Base légale** : intérêt légitime, pour la même finalité que la prospection.
- **Personnes concernées** : les prospects, surtout à travers leur entreprise ; les membres qui utilisent l'IA.
- **Données** :
  - le contenu public du site (5 pages au plus, captures, PageSpeed) et les données de l'entreprise ;
  - le nom et l'email du contact, seulement pour rédiger ;
  - le texte des réponses reçues, pour les classer ;
  - les conversations du copilote ;
  - les journaux d'exécution : entrées et sorties tronquées, modèle, coût ;
  - les visites d'une maquette partagée : date et nombre, sans cookie (D25).
- **Sous-traitants** : la passerelle IA de Vercel et ses fournisseurs (voir le tableau) ; OVH (worker) ; Google PageSpeed (adresse du site seulement) ; Pusher.
- **Durée** :
  - **Ce que fait le code** :
    - conversations du copilote : 90 jours après le dernier message, ou avec la fiche qu'elles ont lue ;
    - maquettes : lien valable 30 jours ; contenu supprimé 90 jours après la dernière version ou la dernière prolongation, ou avec la fiche ;
    - journal des appels MCP : 90 jours ;
    - audits, offres, brouillons et journaux d'exécution : avec la fiche, sans autre limite.
  - **Question pour l'avocat** : la durée des journaux d'exécution.
- **Mesures** :
  - minimisation : les audits portent sur l'entreprise ; Jev ne lit jamais la personne de contact ;
  - fournisseurs sans entraînement sur nos données (`disallowPromptTraining`) ; les rapports de dépense ne portent qu'un identifiant opaque ;
  - rien ne sort du CRM sans le clic d'une personne (D18) ;
  - le contenu externe est balisé et n'est jamais une consigne ;
  - plafond de dépense (moins de 100 € par mois, D22) ;
  - maquettes non indexées, sans script (CSP `sandbox`).
- **Questions pour l'avocat** :
  - l'information des personnes sur l'usage de l'IA et sur le suivi des visites des maquettes (politique de confidentialité) ;
  - **MCP** : une fois activé par le propriétaire, ce qu'un client MCP lit part vers l'IA choisie par le membre, hors des contrats de D16. Faut-il un encadrement ?

## 5. Enrichissement

- **Finalité** : compléter les fiches :
  - l'identité légale de l'entreprise, relue tous les 90 jours ;
  - ses signaux : création, reprise, procédure collective ;
  - ses décideurs et ses comptes sociaux ;
  - une sonde GEO, un brief avant un rendez-vous, et ses publicités en cours.
- **Base légale** : intérêt légitime, enregistré sur le contact : « prospection B2B d'un dirigeant, données publiques du registre » ou « d'un décideur, profil professionnel public ».
- **Personnes concernées** : les dirigeants du registre ; les responsables marketing, communication ou commercial des PME de 10 salariés ou plus.
- **Données** :
  - les dirigeants : nom et rôle ;
  - les profils proposés : nom, poste, adresse du profil public, extrait qui le relie à l'entreprise, confiance ; **jamais d'email** (D48) ;
  - les signaux du BODACC ;
  - le brief : des affirmations, chacune avec sa source ;
  - les comptes sociaux et les publicités de l'entreprise (données d'entreprise).
- **Sources** :
  - annuaire des entreprises (INSEE, RNE) et BODACC (DILA), sous Licence Ouverte Etalab 2.0 ;
  - Exa (index de profils publics) et Perplexity, par la passerelle IA ;
  - bibliothèque publicitaire de Meta.
- **Sous-traitants** : passerelle IA (Exa, Perplexity, modèles) ; OVH (worker).
- **Durée** :
  - **Ce que fait le code** : signaux récents pendant 90 jours, supprimés après un an. Profils proposés, confirmés ou écartés : avec l'entreprise. Briefs : avec la fiche.
  - **Question pour l'avocat** : combien de temps garder un profil écarté ?
- **Mesures** :
  - une entreprise non diffusible, ou un entrepreneur opposé à la prospection, n'est jamais importé ;
  - un dirigeant n'est jamais proposé quand l'entreprise s'est opposée ;
  - un profil ne devient un contact qu'après le clic d'une personne ;
  - les requêtes ne portent que le nom de l'entreprise, sa ville, son métier et le nom d'un dirigeant du registre, jamais un email ;
  - les journaux d'exécution gardent des comptes, jamais les noms comparés.
- **Questions pour l'avocat** :
  - les profils LinkedIn trouvés par Exa : information de la personne (art. 14) ;
  - les homonymes : un profil « à vérifier » peut être celui d'une autre personne.

## 6. Équipe, accès et journal d'audit

- **Finalité** : gérer les comptes des membres (invitation, rôle, désactivation) ; sécuriser l'accès ; tracer les actions sensibles ; gérer les jetons et connexions MCP, les notifications, les quotas d'IA ; compter les résultats de chacun (rapports, E10).
- **Base légale** : le contrat avec chaque collaborateur (art. 6.1.b) pour le compte ; l'intérêt légitime pour la sécurité et le journal.
- **Personnes concernées** : propriétaire, managers, SDR, closers, lecteurs, invités.
- **Données** :
  - le compte : nom, email, téléphone, rôle, photo (S3), mot de passe haché (bcrypt) ;
  - les invitations ;
  - le journal d'audit : action, auteur, adresse IP, date, objet ; email tenté lors d'un échec de connexion ;
  - les jetons MCP, dont seule l'empreinte est gardée ;
  - la consommation d'IA par personne, les notifications ;
  - les chiffres par personne des rapports.
- **Sous-traitants** : Vercel, Railway, AWS (S3 pour les photos ; SES ou Resend pour les invitations et notifications), Pusher, Sentry.
- **Durée** :
  - **Ce que fait le code** :
    - journal d'audit : aucune purge ;
    - comptes désactivés : gardés, pour les rapports ;
    - limites de débit : 24 h ;
    - codes et jetons OAuth : supprimés un jour après leur expiration ;
    - journal des appels MCP : 90 jours.
  - **Question pour l'avocat** : la durée du journal d'audit. La recommandation de la CNIL sur la journalisation (2021) parle de 6 mois à 1 an.
- **Mesures** :
  - pas d'inscription libre : on entre sur invitation ;
  - le rôle et l'état du compte sont relus en base à chaque requête : une désactivation agit tout de suite ;
  - sessions de 12 h ; verrouillage après 5 échecs en 15 minutes ;
  - la page du journal est réservée au propriétaire et aux managers.

## 7. Formulaire du site

- **Finalité** : répondre aux demandes envoyées depuis le formulaire de cleads.fr.
- **Base légale** : la case « J'accepte d'être recontacté au sujet de ma demande », avec un lien vers la politique de confidentialité. **Question pour l'avocat** : consentement, ou mesures précontractuelles (art. 6.1.b) ?
- **Personnes concernées** : les visiteurs qui écrivent.
- **Données** : nom, email, objectif choisi, message.
- **Ce que fait le code** :
  - le message part par email à `contact@cleads.fr`, avec l'adresse du visiteur en réponse ;
  - un accusé de réception part au visiteur ;
  - le propriétaire et les managers reçoivent une notification sans le contenu ; un membre qui a choisi les notifications par email reçoit le contenu ;
  - rien n'est enregistré dans la base du CRM : aucune fiche n'est créée.
- **Sous-traitants** : AWS SES ou Resend ; l'hébergeur de `contact@cleads.fr` ; Vercel.
- **Durée** : celle des boîtes qui reçoivent le message, sans règle. **Question pour l'avocat** : quelle durée ?

## Droits des personnes : ce que fait le CRM

| Droit | Dans le CRM | Qui |
|---|---|---|
| **Accès (art. 15) et portabilité (art. 20)** | « Exporter ses données (RGPD) » dans la partie contact de la fiche. Un fichier JSON : identité et entreprise ; fiches avec leur historique (notes, appels, statuts) et leurs opportunités ; emails échangés ; rendez-vous ; profils proposés pour la personne ; présence sur la liste d'opposition. Rien d'une autre personne : ni collègue, ni membre de l'équipe, ni homonyme. Chaque export est inscrit au journal (`contact.exported`), sans son contenu | Propriétaire, managers (`data:export`) |
| **Effacement (art. 17)** | Suppression de la fiche (voir le traitement 1). L'adresse reste sur la liste d'opposition. **Les emails échangés restent**, détachés de la fiche (traitement 2) : à corriger. Effacer une personne sans sa fiche : V2 (D66) | Propriétaire (`data:delete`) |
| **Opposition (art. 21)** | Lien de désinscription, réponse classée « Ne plus écrire », « ne pas contacter », liste d'exclusion ; vérifiés à l'import et avant chaque envoi | Automatique, ou toute personne qui peut écrire sur la fiche |
| **Rectification (art. 16)** | « Modifier » sur la fiche | Qui peut écrire sur la fiche |

- **Pas dans l'export** (V2 possible) : les tâches, les inscriptions en séquence, les brouillons et audits de l'IA, les briefs, les maquettes, les conversations du copilote. **Question pour l'avocat** : faut-il les ajouter pour répondre à l'art. 15 ?
- **Hors du CRM** : vérifier l'identité de la personne qui demande, puis répondre sous un mois (art. 12.3). **Question pour l'avocat** : quelle procédure écrire ?

## Mesures de sécurité communes

- **Transport** : TLS partout, y compris entre le worker et la base.
- **Secrets** : jamais dans le navigateur ni dans les journaux.
- **Chiffrement** : mots de passe des boîtes chiffrés (AES-256-GCM) ; jetons MCP et OAuth hachés.
- **Droits** : matrice des rôles appliquée côté serveur, testée rôle par rôle ; journal d'audit des actions sensibles.
- **Sauvegardes** (D62, lot 2 d'E14) : celles de Railway, plus une copie quotidienne chiffrée sur le VPS OVH, gardée 14 jours ; chaque copie est restaurée dans une base jetable avant d'être gardée.
- **Erreurs** (D64, lot 3 d'E14) : Sentry, région UE, sans donnée personnelle.
- **Mise en production** : rien n'arrive en production sans une CI verte (D60, lot 1 d'E14).

## Questions pour l'avocat (récapitulatif)

1. **Représentant dans l'UE** (art. 27), ou établissement en France (art. 3.1). Le nommer dans la politique de confidentialité.
2. **Délégué à la protection des données** (art. 37) et **analyse d'impact** (art. 35).
3. **Durées de conservation** : prospects (la politique annonce 3 ans, le code ne purge pas), emails (gardés même après la suppression de la fiche), liste d'opposition après effacement, rendez-vous, journaux d'exécution de l'IA, profils écartés, journal d'audit, messages du formulaire.
4. **Transferts hors UE** : Vercel, Railway, la passerelle IA et ses fournisseurs, Resend, Sentry, et l'accès des membres depuis un pays tiers. Pour chacun : DPF, clauses types, analyse d'impact du transfert ; un DPA signé.
5. **Collecte** : Google Maps sans API (conditions de Google), sites des entreprises, profils LinkedIn trouvés par Exa.
6. **Bases légales** : réservation en ligne et formulaire (consentement, ou art. 6.1.b) ; régime B2B des emails (art. L34-5 du CPCE).
7. **Information** (art. 13 et 14) : origine des données dans le premier email ; personnes appelées sans email ; usage de l'IA, score et tri de Jev, suivi des visites des maquettes. La politique de confidentialité s'arrête à la section 5 sur 10 : il manque « Vos droits » et « Transfert de données ».
8. **Cas particuliers** : adresses génériques, entrepreneurs individuels, Bloctel.
9. **Contenu de l'export** : suffit-il pour l'art. 15 ?
10. **Procédure** de réponse aux demandes, et accès des collaborateurs depuis un pays tiers.
