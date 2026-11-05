# Enrichissement des prospects (E30)

Quatre sources, chacune pour une question (décisions D45 à D53 dans [PLAN.md](PLAN.md)) :

| Question | Source | Lot | Coût |
|---|---|---|---|
| Quand appeler, qui écarter | **BODACC** (open data de la DILA) et **annuaire des entreprises** (INSEE, RNE) | 1, fait | gratuit, sans clé |
| À qui parler | **Exa**, par les outils de la passerelle IA | 2, fait | 7 $ les 1 000 recherches |
| Quoi dire | **Perplexity**, par les outils de la passerelle IA | 2, fait | 5 $ les 1 000 recherches |
| La preuve d'un budget | **Meta**, bibliothèque publicitaire | 3, fait | gratuit : une app Meta et une identité confirmée |

Reporté en V2 (D53) :
- emails nominatifs vérifiés (Icypeas) ;
- bugs des sites (Chromium du worker) ;
- recrutements (France Travail) ;
- chiffres Instagram ;
- créations d'artisans et de libéraux en nom propre (Sirene) ;
- enveloppe budgétaire séparée.

## Lot 1 — Registre et BODACC

### Ce qui se passe seul
Le worker fait ce travail **une tâche à la fois**, à côté des agents (`tickSignals`, `features/signals/engine.ts`). Aucun modèle n'est appelé et rien ne coûte. Il fait trois choses :

1. **Les veilles qui sont dues.** Chaque campagne peut avoir sa veille. Elle passe chaque matin à 7 h 30, heure de Paris, et dans la minute qui suit son activation ou un changement de zone. Elle lit alors les 7 derniers jours. Une veille agit pour son responsable, dont les droits sont relus à chaque passage : s'il ne peut plus importer, la veille s'arrête et le dit.
2. **Le balayage du matin**, une fois par jour et par espace.
3. **L'identité des fiches.** Chaque entreprise française qui a un SIREN, un SIRET ou un code postal est cherchée dans l'annuaire, par lots de 25, cinq recherches par seconde au plus. Elle est relue tous les 90 jours.

### Une veille, pas à pas (`features/signals/watch.ts`)
1. **Lire le BODACC** : les créations (famille `creation`) et les reprises de fonds (famille `vente`) des départements choisis, cinq au plus. La veille relit chaque fois les deux derniers jours, pour retrouver ce que l'annuaire ne connaissait pas encore.
2. **Écarter par l'activité.** Les annonces dont l'activité, écrite en texte libre, ne nomme aucun des secteurs choisis sont écartées tout de suite : les mots doivent commencer comme « plomberie » pour « plombier ». Une annonce sans activité passe à l'étape suivante.
3. **Vérifier dans l'annuaire**, 300 recherches par passage au plus :
   - le code NAF doit être celui d'un des secteurs ;
   - l'entreprise doit être ouverte ;
   - sa fiche doit être diffusible et sans opposition à la prospection.

   Une entreprise que l'annuaire ne connaît pas encore est retentée le lendemain.
4. **Importer** avec le moteur d'import (source « Registre », dédoublonnage par SIREN, SIRET, puis nom et ville). L'identité est posée et le signal attaché. Jev trie les nouvelles fiches.
5. **Prévenir** le responsable de la veille et celui de la campagne. Rien n'est envoyé sans le clic d'une personne (D50).

Le compte rendu de chaque passage s'affiche sur la campagne : annonces lues, fiches créées, déjà présentes, en attente, écartées et pourquoi.

**L'aperçu** (« Aperçu sur 7 jours ») lit le BODACC seul, sans annuaire ni écriture. Il montre ce que la veille aurait trouvé avant la vérification.

### Le balayage du matin (`features/signals/sweep.ts`)
- **Ce qu'il lit** : toutes les annonces de France, jour par jour, depuis la veille, sans les dépôts de comptes (de 3 000 à 8 000 par jour).
- **Ce qu'il fait** : il les rapproche des fiches par SIREN.

| Annonce | Signal | Effet |
|---|---|---|
| Création, immatriculation après transfert | `CREATED`, `MOVED`, `NEW_SITE` | sur la fiche |
| Vente d'un fonds | `TAKEOVER`, pour l'acheteur et pour le vendeur | sur la fiche |
| Modification de l'administration | `NEW_LEADER` | sur la fiche |
| Transfert du siège | `MOVED` | sur la fiche |
| Procédure collective | `INSOLVENCY` | état légal `INSOLVENT` |
| Clôture pour insuffisance d'actif, radiation, dissolution | `CLOSED` | état légal `CLOSED` |

- **Qui est prévenu** : le responsable de chaque fiche concernée, par une seule notification.
- **Durée de vie** : un signal compte comme récent 90 jours, et il est supprimé après un an. Une annonce rejouée n'ajoute rien, car sa clé est unique par entreprise.

### Exclusions (D49)
Une entreprise en procédure collective, radiée ou fermée **n'est pas prospectée** :
- email individuel et inscription en séquence refusés, avec la raison (`legal_state`, `features/outreach/rules.ts`) ;
- séquence en cours arrêtée au prochain envoi (`LEGAL_STATE`) ;
- classée « non pertinente » par règle dans le tri de Jev, sans question ni dépense.

Le propriétaire ou un manager peut **reprendre la prospection** depuis la fiche (« Prospecter quand même »). C'est consigné au journal (`lead.legal_override`). Une décision de justice plus récente bloque de nouveau.

### Sur la fiche, dans la liste, pour le copilote
- **Fiche** : la carte « Registre et signaux » montre :
  - SIREN, activité, création, effectif, labels et état ;
  - les dirigeants, avec « Ajouter comme contact » (rôle « dirigeant », source et base légale ; jamais d'email) ;
  - la frise des signaux, chacun lié à son annonce, avec « Ignorer ».
- **Liste** : le filtre « Registre », gardé dans les vues enregistrées :
  - créées depuis moins de 6 mois ;
  - signal récent (30 jours) ;
  - reprise ou nouveau dirigeant ;
  - procédure ou radiée.
- **Copilote et MCP** : `get_lead_registry` et `list_signals`, en lecture. Le texte des annonces y est marqué comme contenu externe.

## Lot 2 — L'Enquêteur : Exa et Perplexity

Un neuvième agent, l'**Enquêteur** (`researcher`, `features/research/`), fait trois travaux sur le worker. Ce sont des déroulés codés, comme l'audit : le code écrit les recherches, un modèle lit leurs résultats, et le code ne garde que ce qu'ils disent vraiment.

### Les recherches et leur coût
- **Par la passerelle IA**, sans nouvelle clé (D46) :
  - `exaSearch` (Exa) sert aux profils et à l'actualité ;
  - `perplexitySearch` (Perplexity) sert aux comptes sociaux, à la sonde GEO et au brief.
  - Les options sont fixées par le code (`lib/ai/search.ts`) : France, français, quelques résultats.
- **Comment une recherche passe** :
  1. un appel court du modèle rapide lance la recherche écrite par le code, une question par appel (plusieurs questions partent en parallèle) ;
  2. la passerelle l'exécute et rend ses résultats dans la réponse ;
  3. le code garde ces résultats comme **sources**. Dans l'historique d'exécution, l'adresse d'un profil de personne est masquée.
- **Facturation** (`lib/ai/pricing.ts`) :
  - chaque recherche est facturée au prix catalogue, en plus des jetons (Exa 7 $, Perplexity 5 $ les 1 000) ;
  - l'essai réel du 4 novembre l'a vérifié : chaque étape estimée est à moins de 0,0002 $ du coût que donne la passerelle ;
  - le prix est réservé avant l'appel, puis compté sur l'exécution, dans son plafond et dans le budget du mois (D47) ;
  - Réglages › IA les montre à part : « Recherches Exa », « Recherches Perplexity ».
- **Plafonds par travail** : une exécution réserve ce que son travail peut coûter, jamais plus que le plafond de l'agent (0,40 €).

| Travail | Recherches | Coût habituel | Plafond |
|---|---|---|---|
| Décideurs et réseaux, par fiche | 1 à 3 Exa, et 1 Perplexity pour les comptes que le site n'affiche pas | ≈ 0,02 € | 0,04 € par fiche ; 0,08 € pour une fiche seule |
| Sonde GEO | 3 questions Perplexity | ≈ 0,02 € | 0,06 € |
| Brief de rendez-vous | 3 questions Perplexity et 1 Exa, puis une rédaction | ≈ 0,07 € (mesuré) | 0,30 € |

- **Reprises** : une exécution reprise après une panne passagère refait tout son travail. Chaque plafond en garde donc la place :
  - avant de commencer, une sonde vérifie qu'il reste de quoi payer une sonde au pire, soit 0,03 € avec le modèle « Traiter en volume » le plus cher ;
  - une fiche vérifie de même qu'il reste 0,04 € ;
  - le plafond d'une sonde ou d'une fiche seule couvre donc deux passages.
  - Les exécutions d'une campagne, à 0,04 € par fiche pour environ 0,02 € dépensés, ont cette marge d'elles-mêmes.

### Décideurs et réseaux (D45, D48 ; `features/research/people.ts`)
- **Qui est cherché** :
  - jusqu'à deux dirigeants du registre (lot 1) qui n'ont pas encore de profil ;
  - à partir de 10 salariés (tranche INSEE 11 et plus), le responsable marketing, communication ou commercial.
  - Une entreprise opposée à la prospection (RNE) n'est cherchée que pour ses comptes sociaux, jamais pour ses personnes.
- **Les comptes sociaux** : Instagram, Facebook, LinkedIn et TikTok, ceux qui manquent à la fiche :
  1. d'abord ceux que le site de l'entreprise affiche, lus sur sa page d'accueil si son robots.txt le permet : gratuits et sûrs ;
  2. puis, pour ceux qui manquent encore, une recherche Perplexity limitée aux quatre réseaux. Exa indexe mal Facebook et Instagram : l'essai réel n'a ramené que des résultats LinkedIn.
- **Le contrôle** : un modèle rapide compare chaque résultat à l'entreprise et recopie les mots qui le prouvent. Le code ne garde un résultat que si :
  - ces mots sont bien dans le résultat ;
  - pour un dirigeant, son nom de famille y est, en mot entier (« Roche » n'est pas « Rocher ») ;
  - pour un responsable marketing ou commercial, son poste en relève ;
  - la confiance dépasse 0,5.
- **Probable ou à vérifier** :
  - « probable » quand le modèle est sûr (0,8 et plus) et, pour le responsable marketing, que le nom de l'entreprise est dans le résultat ;
  - sinon « à vérifier ».
- **La décision d'une personne** :
  - les profils sont **proposés** sur la fiche (`ContactCandidate`) ;
  - « Confirmer » complète le contact du même nom, ou crée un contact : rôle, poste, profil, source « Recherche web », base légale, **jamais d'email** ;
  - « Écarter » ne le propose plus.
- **Les comptes de l'entreprise** : les liens du site et les comptes sûrs d'une recherche (0,8 et plus) entrent dans `data.socials`, avec leur provenance dans `data.socialsFound` (« site » ou « Perplexity »). Ce sont des données d'entreprise, pas de personne.
- **Minimisation** :
  - l'historique d'exécution garde des comptes et des résumés, jamais les noms comparés ;
  - d'un profil, on ne garde que l'adresse, le nom et le poste.
- **Lancement** :
  - « Trouver les décideurs » sur la fiche ;
  - ou, sur la campagne, pour ses bonnes cibles : un devis d'abord, puis 50 fiches au plus par clic, en exécutions de 10. Les fiches cherchées depuis moins de 30 jours sont sautées.

### La sonde GEO (D52 ; `features/research/geo.ts`)
- **Les questions** : trois, écrites par le code à partir du métier et de la ville (« plombier à Lyon », « plombier Lyon avis », « qui recommander comme plombier à Lyon »), sans adjectif ni article, pour que le genre du métier ne fausse rien (« auto-école »). Chacune est une recherche Perplexity, lancées en parallèle ; Perplexity rend les pages sur lesquelles un moteur de réponse s'appuie.
- **Le constat**, sans modèle :
  - la fiche est **citée** si son site est parmi ces pages, ou son nom complet en mot entier (s'il est assez distinctif) ;
  - sinon elle est **absente**, et le signal `GEO_ABSENT` est posé, une fois par mois au plus ;
  - le constat est daté et liste les sites cités (concurrents, annuaires).
- **Quand** :
  - chaque heure, la tâche des rappels met en file les sondes dues ;
  - elles visent les bonnes cibles de Jev qui ont un site, un métier et une ville ;
  - une fois par mois et par entreprise, dix par jour et par espace au plus ;
  - une sonde mise en file réserve l'entreprise trois jours. Si elle échoue ou expire, l'entreprise revient d'elle-même dans la file ; si elle aboutit, la suivante attend un mois ;
  - ou à la demande, sur la fiche.
- **Ce n'est pas une promesse** : les réponses des moteurs varient, la sonde dit ce qu'elle a lu à une date.

### Le brief de rendez-vous (D51 ; `features/research/brief.ts`)
- **Les recherches**, écrites par le code :
  - Perplexity : « l'entreprise et sa ville », « … avis clients », « le métier et la ville » ;
  - Exa : son actualité des douze derniers mois.
- **La rédaction** : l'Enquêteur (Sonnet) écrit une fois, à partir de la fiche (registre, signaux, sonde GEO, audit) et des pages trouvées. Il suit le skill `brief-rendez-vous`.
- **Ses rubriques** :
  - qui ils sont ;
  - leur actualité, datée ;
  - leur marché local ;
  - trois angles reliés aux offres actives ;
  - cinq questions à poser.
- **Les sources** : chaque fait cite sa page (« W3 ») ou la fiche (« CRM »). Le modèle n'écrit jamais de lien.
  - Un fait qui cite une page non lue est retiré, et compté.
  - L'actualité et le marché demandent une page.
  - Les signaux du registre sont recopiés par le code.
- **Quand** :
  - la veille de chaque rendez-vous : la tâche horaire met en file ceux qui commencent dans 2 à 36 heures, une fois par rendez-vous ;
  - ou à la demande, sur la fiche.
  - Le closer est prévenu quand il est prêt.

### L'essai réel du 4 novembre 2026
Deux vraies entreprises de Loire-Atlantique, sur une base jetable, pour 0,11 € en tout :
- **la passerelle** rend bien les résultats des recherches dans sa réponse, et son coût tombe à moins de 0,0002 $ près sur chaque étape estimée ;
- **le brief** est sourcé et utile : son taux de réussite comparé au marché local, ses concurrents nommés, ses avis contradictoires selon les plateformes, trois angles reliés aux offres. Un fait sans source lue a été retiré ;
- **la sonde GEO** l'a trouvée citée par son nom dans les annuaires et comparatifs que Perplexity donne ;
- **quatre défauts, corrigés depuis** :
  - Haiku réfléchit jusqu'à 2 000 jetons avant de répondre : la comparaison des profils a désormais 6 000 jetons, le brief 6 000, les appels de recherche 1 500 ;
  - un modèle prié de passer trois questions en liste les a écrites en une seule chaîne : une question passe désormais par appel ;
  - Exa n'a ramené aucun compte Facebook ou Instagram : ils viennent désormais du site, puis de Perplexity ;
  - les longues qualités du registre brouillaient la recherche d'un dirigeant : seuls restent son nom, l'entreprise et la ville.

### Le correctif du 5 novembre 2026
Le premier soir en production, le worker a pris les dix sondes du jour. Neuf n'ont montré aucun échec ; la dixième a échoué, et ses journaux ont montré trois défauts.
- **Un coût perdu** :
  - deux sondes tournaient à la fois, de trois recherches parallèles chacune ;
  - leurs écritures ont attendu les mêmes lignes et le petit pool du worker, et l'une a dépassé les 2 secondes que Prisma accorde par défaut ;
  - la passerelle avait facturé l'appel, mais il a été compté à 0 €, et présenté comme une panne de l'IA.
  - Désormais, l'écriture d'une étape attend jusqu'à 15 secondes et réessaie ; un appel facturé n'est plus jamais compté à 0 €.
- **Une reprise impossible** :
  - la sonde exigeait tout son plafond avant de commencer, si bien que toute reprise après une dépense était refusée ;
  - la recherche des décideurs d'une fiche seule avait le même défaut.
  - Les plafonds gardent désormais la place d'une reprise (ci-dessus).
- **Un mois perdu** : l'entreprise restait réservée un mois malgré l'échec. La réservation dure désormais trois jours.

### Ce que les autres agents en font
- **Offres (E21) et rédacteur (E22)** : la création récente, la reprise, l'absence des moteurs de réponse et l'actualité du dernier brief s'ajoutent aux preuves de l'audit (identifiants R1, R2…), et, depuis le lot 3, les publicités Meta en cours (`ads_running`). Trois signaux d'offre viennent du lot 2 :
  - `new_business`, que sert l'offre « site vitrine » ;
  - `takeover`, que sert l'offre « refonte du site » ;
  - `geo_absent`, que sert l'offre « GEO ».
  - Le catalogue version 3 les ajoute aux offres de ces identifiants dans les espaces existants, avec le skill `brief-rendez-vous`.
- **Copilote et MCP** :
  - `get_lead_research` en lecture, où le texte venu du web est marqué comme contenu externe ;
  - `start_research` pour confier un travail, après un clic.
- **Qualité (E27)** :
  - une suite « Enquêteur » : 10 entreprises fictives et leurs résultats figés (`evals/research.ts`), avec des pièges comme les homonymes, une ancienne salariée, une publication prise pour un compte, une consigne cachée ;
  - le tableau de bord montre la part des profils confirmés d'un clic.
  - Changer le modèle « Traiter en volume » demande désormais aussi cette évaluation.

## Lot 3 — Meta : les publicités en cours

Une entreprise qui paie des publicités Facebook ou Instagram a un budget marketing. Meta publie toutes les publicités diffusées dans l'Union européenne, quel qu'en soit le sujet (Digital Services Act), et les garde un an après leur dernière diffusion. Son API, `ads_archive`, est gratuite.

### La mise en place, une fois (propriétaire)
1. **L'application Meta** « cleads » existe depuis le 5 novembre 2026 :
   - ID `1843657773498923`, portefeuille business Webconcepter ;
   - créée sans cas d'utilisation : l'API n'a besoin d'aucune autorisation ni revue d'app.
2. **Confirmer son identité et son pays** sur [facebook.com/ID](https://www.facebook.com/ID) : pièce d'identité, puis quelques jours d'attente. Meta refuse sinon toute lecture.
3. **Le jeton** :
   - dans l'[explorateur de l'API Graph](https://developers.facebook.com/tools/explorer/), choisir l'app « cleads », puis « Générer un token d'accès » (jeton utilisateur) ;
   - dans l'[outil de débogage des tokens](https://developers.facebook.com/tools/debug/accesstoken/), « Prolonger le token d'accès » : il vaut alors 60 jours.
4. **Le poser sur le worker**, en saisie masquée, puis redéployer :
   ```bash
   scripts/set-ai-worker-env.sh META_ADS_TOKEN
   scripts/deploy-ai-worker.sh
   ```
5. **Le renouveler** de la même façon tous les 60 jours. Cleads prévient les propriétaires 7 jours avant l'échéance, puis s'il expire ou s'il est refusé.

### Ce qui se passe seul (`features/signals/ads.ts`)
- **Quand** : les fiches des campagnes actives sont relues une fois par semaine. « Vérifier » sur la fiche la fait relire dans la minute.
- **Le rythme** : c'est la boucle du registre du worker, une tâche à la fois, sans modèle ni dépense, 120 appels par heure au plus. Sur une limite de Meta, elle s'arrête une heure.
- **Retrouver la page de l'entreprise** :
  1. par son numéro, quand l'adresse Facebook de la fiche le donne (`profile.php?id=…`) ou qu'une lecture précédente l'a trouvé : dix pages par appel ;
  2. sinon, par une recherche sur le nom de l'entreprise. Une page n'est retenue que si :
     - ses publicités affichent le domaine du site de l'entreprise ;
     - ou elle porte le nom de l'entreprise, entier, d'au moins deux mots. Elle est alors marquée « reconnue à son nom : à vérifier ».
  - Un nom d'un seul mot (« Boulangerie ») n'est rapproché que par le domaine.
  - Une adresse Facebook personnalisée (facebook.com/plomberie.roche) ne donne pas le numéro de la page : il faudrait une revue d'app chez Meta.
- **Ce qui est gardé** dans `data.ads` :
  - la page, avec son numéro et sa façon d'être reconnue ;
  - le nombre de publicités en cours, depuis quand, sur quelles plateformes ;
  - les domaines affichés ;
  - cinq publicités au plus, avec leur titre et leur lien public.
- **Le signal `ADS_RUNNING`** :
  - il est posé tant que des publicités tournent, un par page et par mois, renouvelé à chaque lecture ;
  - il reste récent un mois après la dernière lecture : c'est un état, pas un événement ;
  - le responsable de la fiche est prévenu quand l'entreprise se met à faire de la publicité.
- **Les offres** :
  - le signal d'offre `ads_running` sert « Landing de conversion » et « Meta Ads » ;
  - le catalogue version 4 l'ajoute aux espaces existants ;
  - la preuve citée est la page de l'entreprise dans la bibliothèque publicitaire.

### Le jeton, en sûreté
- Il n'existe que sur le worker (`META_ADS_TOKEN`), en saisie masquée, jamais dans le CRM ni dans le dépôt.
- Il voyage dans l'en-tête `Authorization`. Seul le contrôle du jeton lui-même (`debug_token`) le prend dans son adresse, comme Meta l'exige. Aucune adresse n'est journalisée, et les messages d'erreur sont nettoyés du jeton.
- Les aperçus de Meta (`ad_snapshot_url`) contiennent le jeton : ils ne sont jamais demandés. Chaque publicité est liée par sa page publique dans la bibliothèque.
- Le worker vérifie le jeton toutes les six heures (`debug_token`). Il en publie l'état, jamais la valeur, dans son battement (`AiWorker.meta`), et la fiche l'affiche.

### Limites
- **Pas de page d'arrivée** : l'API ne donne pas l'adresse de destination d'une publicité, seulement le domaine qu'elle affiche. L'audit de la landing reste celui du site (V2 si besoin).
- **Couverture** : le nombre de publicités est celui que Meta publie pour la France. Une page de plus de 500 publicités en cours est comptée « plus de 500 ».

## Conformité
- **Sources** : BODACC et annuaire des entreprises sont des données publiques sous Licence Ouverte Etalab 2.0. On n'en garde que ce qui sert à la fiche.
- **Bibliothèque publicitaire Meta (lot 3)** :
  - ce sont des données publiques d'entreprises (des pages et leurs publicités), lues avec les conditions de Meta ;
  - aucune donnée personnelle n'est envoyée : seulement le nom de l'entreprise ou le numéro de sa page ;
  - Meta est à inscrire comme source au registre des traitements.
- **Recherches web (lot 2)** :
  - les requêtes ne portent que le nom de l'entreprise, sa ville, son métier et le nom d'un dirigeant du registre, jamais un email ;
  - elles passent par la passerelle Vercel (sans entraînement sur nos données, D16) vers Exa et Perplexity, destinataires à inscrire au registre des traitements ;
  - un profil ne devient un contact qu'après le clic d'une personne.
- **Opposition** : une entreprise non diffusible, ou un entrepreneur individuel opposé à la prospection (RNE), n'est jamais importé. Un dirigeant n'est jamais proposé quand l'entreprise s'est opposée. La liste d'exclusion du CRM s'applique comme pour tout import.
- **Base légale** : l'intérêt légitime pour la prospection B2B. Chaque contact ajouté garde sa source, sa date et sa base légale.
- **Couverture** : le BODACC ne publie que les créations inscrites au RCS. Les artisans et libéraux en nom propre n'y sont pas ; Sirene les apportera en V2.

## Vérifier sur le serveur
- **Journal du worker** : `registry work` avec le type (veille, balayage, identité) et ses chiffres ; `registry work failed` en cas d'erreur.
- **Base de données** : `SELECT "workspaceId", "nextRunAt", "lastRunAt", "lastReport" FROM "SignalSweep";` puis `SELECT "campaignId", "active", "nextRunAt", "lastReport" FROM "CampaignWatch";`.
- **Journal d'audit** : `campaign.watch_saved`, `campaign.watch_run`, `lead.legal_override` et `lead.contact_added_from_registry` ; pour le lot 2, `lead.candidate_confirmed`, `lead.candidate_dismissed` et `campaign.people_search`.
- **Lot 2** :
  - les exécutions de l'Enquêteur sont dans Réglages › IA, avec leur travail (« Décideurs et réseaux », « Brief de rendez-vous », « Sonde GEO ») ;
  - le coût des recherches est à part dans la consommation du mois ;
  - la réponse de la tâche horaire des rappels donne `research: { briefs, geo }`.
- **Lot 3** :
  - le journal du worker donne `registry work` de type `ads` : `companies`, `read`, `running`, `signals` et `error` ;
  - en base : `SELECT "beatAt", "meta" FROM "AiWorker" ORDER BY "beatAt" DESC LIMIT 1;` pour l'état du jeton, puis `SELECT "metaNotice" FROM "SignalSweep";` pour le dernier avis aux propriétaires.
