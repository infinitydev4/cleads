# Couche agentique IA du CRM Cleads

> Architecture de référence décidée le 2 novembre 2026 (décisions D13 à D27 de [PLAN.md](PLAN.md)). Elle sert de spécification aux epics E17 à E27.
>
> **État** : le socle (E17), le worker (E18), les agents, skills et catalogue d'offres (E19), l'audit des prospects (E20), les offres argumentées (E21), la rédaction et le classement des réponses (E22), le Studio Web (E23) et le copilote (E24) sont implémentés : `lib/ai/`, `features/ai/`, `features/offers/`, `features/prospect-audit/`, `features/offer-pitch/`, `features/email-draft/`, `features/reply-triage/`, `features/studio/`, `features/copilot/`, `worker/`, Réglages › IA, Agents IA (`/app/agents`), Studio Web (`/app/studio`), les onglets « Audit IA », « Offres suggérées » et « Maquette » des fiches, le Brouillon IA, les suggestions de la boîte et le panneau du copilote (⌘J). Les sections 4 à 17 décrivent ce qui existe, sauf le Stratège. Le reste (stratège, QG, évaluations) est la spécification des epics E25 à E27.

## 1. Objet

Assister tout le parcours d'acquisition avec des agents IA :
- trouver les bons secteurs ;
- auditer chaque prospect ;
- savoir quelle offre lui proposer, et pourquoi ;
- rédiger le premier email ;
- classer les réponses ;
- montrer au prospect une landing de démonstration construite à partir de son propre site.

Trois contraintes encadrent le tout : plusieurs modèles interchangeables, l'humain garde la main sur tout ce qui sort du CRM, et le budget reste sous 100 € par mois au départ.

## 2. Principes

1. **Trois façons d'exécuter, de la plus cadrée à la plus libre.**
   - *Décision* : un choix, un score ou un oui / non avec une probabilité (Jev). Au-dessus du seuil, la suggestion s'applique dans le CRM ; dans la zone d'incertitude, un modèle génératif reprend la question ; en dessous, un humain décide.
   - *Workflow* : le code enchaîne les étapes et appelle un modèle là où il faut, avec une sortie typée (zod). C'est prévisible, testable et peu coûteux. Il sert pour l'audit, les offres, les brouillons et le Studio.
   - *Agent* : le modèle choisit lui-même ses outils, dans une boucle bornée (`ToolLoopAgent`). On le réserve à ce qui est vraiment ouvert : le copilote et le stratège.
2. **Délégation.** Une exécution porte la personne qui l'a demandée (`requestedById`). Chaque outil vérifie les droits de cette personne par les services existants (`features/*/service.ts`, `lib/rbac.ts`) : un agent ne peut jamais faire plus qu'elle. Le compte de service `AGENT` ne sert qu'aux exécutions planifiées.
3. **L'humain valide ce qui sort du CRM** : email, inscription en séquence, recherche Extractor, lien envoyé au prospect. Le pied de page légal et la désinscription restent du code.
4. **Faits sourcés.** Chaque affirmation sur un prospect s'accompagne de sa preuve (URL, mesure, capture), affichée dans l'interface. Ni faux avis, ni chiffre inventé.
5. **Contenu non fiable.** Les pages web et les avis peuvent cacher des consignes. Une étape sans outils les lit et rend une sortie structurée et bornée ; seules ces données passent aux étapes suivantes.
6. **L'IA reste une assistance.** Si la passerelle ou un fournisseur tombe, le CRM continue de fonctionner, et les boutons IA disent qu'ils sont indisponibles.

## 3. Vue d'ensemble

```
UI 2D + 3D (Netlify, Next 16)
 ├─ Fiche : Audit IA · Offres suggérées · Brouillon IA · Générer une landing ─► AgentRun en file
 ├─ /app/agents (exécutions, à valider, skills, offres, coûts) · /app/studio (maquettes)
 └─ Copilote ⌘J (tours courts en streaming)               ▲ Pusher : progression en direct
PostgreSQL ◄── file AgentRun ──► Worker agents (VPS OVH, Docker, Node 24)
                            ├─ workflows + ToolLoopAgent (AI SDK 7)
                            ├─ outils = services CRM (droits + journal, actorKind AGENT)
                            ├─ MCP Extractor en lecture (réseau local du VPS)
                            ├─ Playwright : captures, rendu et contrôle des maquettes
                            └─ PageSpeed Insights · annuaire des entreprises
Vercel AI Gateway ──► Jev · Claude Haiku / Sonnet / Opus 5.5 (+ OpenAI, Google, Mistral en secours)
apercu.cleads.fr ──► réécriture par hôte ──► route d'aperçu (page en base, CSP sandbox, noindex)
```

**Parcours type, de la fiche à la maquette**
1. **Lancement.** Sur la fiche d'un plombier lyonnais, la SDR clique « Auditer ». Le CRM crée une exécution (`AgentRun`, statut `QUEUED`), réserve son budget (0,30 € au plus) et la met en file.
2. **Collecte.** Le worker lit le site (5 pages au plus), interroge PageSpeed, prend deux captures, lit la fiche Google fournie par l'Extractor et les dirigeants dans l'annuaire des entreprises. La progression s'affiche en direct sur la fiche.
3. **Analyse.** Haiku 5.5 extrait le contenu des pages en données structurées. Sonnet 5.5 analyse les captures et écrit l'audit, chaque constat avec sa preuve. Le coût réel est enregistré et le reste de la réservation est libéré.
4. **Offres.** Le Conseiller offres croise les signaux de l'audit avec le catalogue. Il propose par exemple « Refonte de site + SEO local », avec trois preuves, un script d'appel de 15 minutes et un angle d'email.
5. **Email.** La SDR ouvre « Brouillon IA » : l'email cite le score mobile et la fiche Google incomplète. Elle le relit, le modifie et l'envoie ; le code ajoute le pied de page légal.
6. **Maquette.** Avant l'appel, le closer clique « Générer une landing ». Quelques minutes plus tard, la maquette est prête : lien privé `apercu.cleads.fr/…` valable 30 jours, captures avant / après, scores « votre site → maquette ». Le closer l'envoie après validation ; il est prévenu dès que le prospect l'ouvre.

## 4. Socle technique

| Brique | Rôle | Version relevée le 2 novembre 2026 |
|---|---|---|
| AI SDK (`ai`) | génération, sorties structurées, `ToolLoopAgent`, `toolApproval`, sous-agents, `experimental_decide`, télémétrie | 7.0.159 |
| `@ai-sdk/mcp` | client MCP de l'Extractor | 2.0.88 |
| `@ai-sdk/react` | streaming du copilote (`useChat`) | 4.0.163 |
| Vercel AI Gateway | une clé pour tous les fournisseurs, bascules, prix, suivi des dépenses, variantes batch | service |
| File de tâches | la table `AgentRun` elle-même (`FOR UPDATE SKIP LOCKED`, bail par battement de cœur), voir [WORKER-IA.md](WORKER-IA.md) | E18 |
| Playwright (`playwright-core`) et axe-core | rendu et contrôle des maquettes dans le worker (Chromium *headless shell*) ; les captures de l'audit viennent de PageSpeed | 1.64.1 et 4.14.0 (E23) |

**Pourquoi ce socle.**
- **Intégration** : le CRM est en TypeScript (Next 16, React 19, zod) et l'AI SDK s'y intègre sans couche de traduction. Il parle aux principaux fournisseurs avec la même interface.
- **Production** : il apporte ce qu'il faut pour des agents en production : validation humaine des outils, MCP, streaming vers React.
- **Passerelle** : elle permet de changer de modèle par un simple identifiant (`anthropic/claude-sonnet-5.5`, `typesafe-ai/jev`…) et de définir des secours. Elle fonctionne depuis Netlify comme depuis le VPS.
- **Options envoyées à chaque appel** (`lib/ai/gateway.ts`) :
  - les modèles de secours ;
  - `disallowPromptTraining: true` : la passerelle n'utilise que des fournisseurs qui n'entraînent pas leurs modèles sur nos données (D16) ;
  - pour ses rapports de dépense, l'identifiant opaque de la personne et une étiquette `agent:<id>`, jamais un nom ni un email.

**Écartés.**
- **LangChain / LangGraph** : couche lourde, pensée Python d'abord, intégration moins directe au streaming React. Ce que LangGraph apporte (reprise, humain dans la boucle) est couvert par notre file PostgreSQL, nos tables d'exécution et `toolApproval`.
- **Mastra** : framework crédible, mais une couche et des conventions de plus, alors que nos services doivent rester au centre.
- **SDK propres à chaque fournisseur** : accès complet aux fonctions de chaque modèle, mais la bascule, le streaming et les outils seraient à réécrire.

**Règle de code.** Aucun code métier n'importe un fournisseur ni ne nomme un modèle : il demande un **rôle** à `lib/ai/models.ts`.

## 5. Modèles par rôle et décisions

| Rôle | Par défaut | Secours | Sert à |
|---|---|---|---|
| `decision` | Jev `typesafe-ai/jev` | GPT-6 Luna Decisions, puis un humain | pertinence d'un import, classement d'une réponse, prochaine action, aiguillage du copilote |
| `fast` | Claude Haiku 5.5 | GPT-6 Luna, Mistral Small | extraction du contenu des pages, résumés, petites vérifications |
| `writer` | Claude Sonnet 5.5 | GPT-6.1 Sol, Mistral Large 4 | analyse d'audit et des captures, offres, emails, copilote |
| `designer` | Claude Opus 5.5 | Gemini 4 Argon, GPT-6 Astra | Studio Web, audit approfondi à la demande |

Prix relevés sur la passerelle le 2 novembre 2026, par million de jetons (entrée / sortie) :

| Modèle | Entrée | Sortie |
|---|---|---|
| Jev | 0,042 $ | gratuite |
| Claude Haiku 5.5 | 0,10 $ | 0,50 $ |
| Claude Sonnet 5.5 | 2 $ | 10 $ |
| Claude Opus 5.5 | 4 $ | 20 $ |
| GPT-6 Luna | 0,10 $ | 0,50 $ |
| Mistral Large 4 | 0,70 $ | 2,10 $ |

- **Changer de modèle** : dans Réglages › IA (propriétaire), parmi une liste blanche ; la surcouche est enregistrée dans `AiSetting`. Le changement est précédé d'une évaluation (E27) et journalisé.
- **Secours** : la passerelle essaie les modèles de secours dans l'ordre si le principal échoue ou n'est pas disponible.
- **Versions fixées** : les identifiants de modèle sont fixés, sans alias « dernier ». Une mise à jour chez le fournisseur ne change donc pas la qualité sans évaluation.
- **Cache** : les consignes des agents et les skills sont placés en tête des requêtes, pour profiter du cache de prompts des fournisseurs.

**Décisions (Jev).** `decideForRun` (`features/ai/calls.ts`) appelle `experimental_decide`, avec les règles de `lib/ai/decide.ts`.
- **Confiance** : elle est mesurée sur la réponse retenue. C'est la probabilité de l'option choisie, ou du niveau le plus probable d'un score, ou la plus grande de P(oui) et P(non).
- **Bascule conditionnelle** : le premier secours, GPT-6 Luna Decisions, relance automatiquement toute réponse dont la confiance est sous le seuil `auto`. La passerelle exige ici un modèle de décision.
- **Seuils**, appliqués ensuite :
  - au-dessus d'`auto`, la suggestion s'applique dans le CRM, jamais sous forme d'action externe ;
  - entre les deux, elle est proposée à confirmer ;
  - sous `human`, ou sans probabilité, la fiche va dans une file « À classer ».

Les seuils partent prudents (0,85 et 0,60), puis sont calibrés sur le jeu d'évaluation. Jev accepte un état en texte ou en JSON, pas d'image. L'API est encore marquée expérimentale : elle n'est appelée que depuis `features/ai/calls.ts`.

## 6. Budget et coûts (D22)

- **Plafond de l'espace** : 100 € par mois par défaut, réglable par le propriétaire. Les propriétaires reçoivent une notification dans le CRM à 50 %, 80 % et 100 %, une fois par seuil et par mois. Au-delà du plafond, les fonctions IA se mettent en pause jusqu'au mois suivant ou jusqu'à une hausse du plafond.
- **Quota quotidien par personne** (D24), à l'intérieur du plafond global.
- **Plafond par exécution** : audit ≤ 0,30 €, maquette ≤ 2 €, brouillon ≤ 0,05 €. Une exécution qui l'atteint s'arrête proprement.
- **Réservation verrouillée** : avant de démarrer, une exécution réserve son plafond, sous un verrou de ligne comme les plafonds d'envoi d'E9. Le coût réel remplace la réservation à la fin. Des exécutions simultanées ne peuvent donc pas dépasser le plafond.
- **Appels bornés** : avant chaque appel, la sortie maximale est calculée pour que le pire cas tienne dans ce qu'il reste à l'exécution. Ce pire cas se calcule au prix le plus cher parmi le modèle et ses secours, entrée estimée comprise. Si même une réponse courte ne tient pas, l'exécution s'arrête (`BUDGET_EXCEEDED`) sans appeler le modèle.
- **Longueur des réponses** : la sortie maximale d'une étape compte aussi le raisonnement du modèle, car Sonnet 5.5 raisonne avant d'écrire (environ 1 000 jetons mesurés le 2 novembre 2026). Chaque étape garde donc une marge :
  - extraction de l'audit : 4 000 jetons ;
  - analyse de l'audit : 6 000 jetons ;
  - pitch : 6 000 jetons ;
  - test d'un skill : 3 000 jetons ;
  - brief du Studio : 8 000 jetons ; page du Studio : 24 000 jetons, écrite en flux continu (une page entière prend plusieurs minutes) ; critique d'une page : 4 000 jetons.

  Une réponse coupée à cette limite arrête l'exécution sans nouvel essai, car elle serait coupée de la même façon, et le message le dit.
- **Coût réel** : il est calculé à partir de l'usage renvoyé par chaque appel, y compris une réponse coupée ou illisible (la passerelle la facture aussi), et des prix lus sur la passerelle (liste publique relue toutes les 12 heures, instantané intégré en secours). Il est converti en micro-euros au taux réglé dans `AiSetting` au moment de l'appel. Chaque étape garde l'identifiant de génération de la passerelle, pour rapprocher plus tard ce coût estimé du coût facturé.
- **Économies** :
  - audit réutilisé 30 jours par domaine ;
  - cache des prompts ;
  - pas de traitement en masse par défaut ;
  - devis affiché avant tout traitement de plusieurs fiches ;
  - variantes batch (−50 %) le jour où l'on traite en masse.

Exemple de mois (ordre de grandeur, à mesurer en E20 et E23) :

| Usage | Volume | Coût unitaire | Total |
|---|---|---|---|
| Audits | 200 | ≈ 0,15 € | ≈ 30 € |
| Maquettes | 35 | ≈ 1,20 € | ≈ 42 € |
| Brouillons | 500 | ≈ 0,02 € | ≈ 10 € |
| Classements Jev | quelques centaines | ≈ 0,0001 € | ≈ 0 € |
| **Total** | | | **≈ 82 €** |

## 7. Les agents

| Agent | Rôle d'expert (résumé des consignes) | Modèle | Outils principaux | Sortie | Validation humaine |
|---|---|---|---|---|---|
| Auditeur digital | Consultant senior en acquisition locale et en performance web : factuel, cite ses preuves, classe par impact sur l'activité du prospect | `writer` (`fast` pour l'extraction) | `fetch_page`, `pagespeed`, `screenshot`, `detect_stack`, `find_socials`, `dirigeants`, MCP `get_business`, `save_audit` | `ProspectAudit` | aucune (interne) |
| Conseiller offres | Directeur conseil d'agence : relie chaque faiblesse à une offre du catalogue, compose un pack réaliste, prépare le closer | `writer` | `get_audit`, `list_offers`, `save_recommendations` | `OfferRecommendation`, script, angle | aucune ; la personne accepte ou refuse |
| Rédacteur outreach | Copywriter B2B français spécialisé en cold email : court, personnel, une seule demande, règles CNIL | `writer` | `get_lead`, `get_audit`, `get_recommendations`, `draft_email` | brouillon | l'envoi (toujours relu) |
| Analyste réponses | — | `decision` | `classify_reply` | `ReplyClass`, urgence, probabilité | sous le seuil |
| Designer web | Directeur artistique et intégrateur : pages modernes, accessibles, rapides, fidèles à l'identité du prospect | `designer` (`writer` pour la critique) | `collect_site`, `build_page`, `render_preview`, `critique_page`, `publish_preview` | `GeneratedSite` | le partage du lien |
| Copilote | Chef d'agence : répond sur les données que la personne voit, délègue aux spécialistes | `writer` (`decision` pour l'aiguillage) | outils de lecture, `start_audit`, `start_studio`, `draft_email`, `create_task` | réponses, actions proposées | toute action externe |
| Stratège marché | Stratège growth : secteurs, douleurs par métier, offre phare, angle | `writer` | `list_offers`, `campaign_metrics`, MCP `list_sectors`, `propose_campaign`, `launch_search` | campagne brouillon, recherche | le lancement |
| Analyste qualification | — | `decision` | `score_import`, `next_action` | pertinence, probabilité | sous le seuil |

**Définition dans le code** (`features/ai/agents.ts`), versionnée et testée. Depuis E19, chaque agent y a son rôle d'expert (`persona`), les rôles de modèle permis, ses outils, ses skills V1, ce qu'il produit, ce qu'une personne valide et ses limites. Son epic métier y branchera son comportement :
```ts
auditor: defineAgent({
  id: "auditor",
  label: "Auditeur digital",
  mission: "Audite le site et la présence en ligne d'un prospect, chaque constat avec sa preuve.",
  persona: `Tu es consultant senior en acquisition locale et en performance web…`,
  modelRole: "writer",
  modelRoles: ["writer", "fast", "designer"], // ce que le propriétaire peut choisir, le sien d'abord
  epic: "E20",
  tools: ["fetch_page", "pagespeed", "screenshot", /* … */ "read_skill"],
  skills: [{ name: "audit-seo-local", mode: "on_demand" } /* … */],
  limits: { maxSteps: 12, maxCostEur: 0.3 }, // le plafond réservé au démarrage d'une exécution
}),
```

**Surcouche éditable** (`AgentDefinition`, `features/ai/definitions.ts`) : elle complète l'agent sans rien remplacer.
- Consignes de l'équipe et skills : propriétaire et managers (`skill:manage`).
- Rôle de modèle parmi ceux permis, limites plus basses que celles du code, activation : propriétaire (`ai:manage`). Une valeur hors bornes est refusée, jamais rognée.
- Chaque enregistrement crée une version (`AgentDefinitionVersion`, avec l'état complet) et une ligne du journal d'audit. Une exécution réserve le plafond de la surcouche ; un agent désactivé ne démarre pas.
- Les consignes d'une exécution s'écrivent toujours dans le même ordre (`features/ai/runtime.ts`) : rôle d'expert, règles communes, consignes de l'équipe, skills « toujours », catalogue des skills « à la demande ». Les consignes de l'équipe ne lèvent aucune règle commune.

## 8. Skills

Un skill est un savoir-faire qu'on ajoute à un agent sans toucher au code : une procédure d'audit, une grille, des règles de rédaction, un playbook par secteur.

- **Format** compatible SKILL.md (standard ouvert [agentskills.io](https://agentskills.io/)), avec des fichiers annexes possibles (grilles, exemples) :
  ```markdown
  ---
  name: audit-seo-local
  description: À utiliser pour évaluer la visibilité locale d'une entreprise (fiche Google, cohérence nom-adresse-téléphone, pages par ville).
  ---
  # Audit SEO local
  1. Fiche Google : catégories, horaires, photos, nombre d'avis, note…
  2. …
  ```
- **Stockage** : `Skill` (nom, description, version courante), `SkillVersion` (chaque version, avec ses fichiers annexes en texte et une note) et `AgentSkill`, qui donne un skill à un agent en mode `ALWAYS` (le contenu entre dans les consignes) ou `ON_DEMAND`. Un skill archivé n'est plus donné aux agents ; ses versions restent lisibles.
- **Chargement à la demande** : l'agent ne reçoit que le catalogue (nom et description) et appelle `read_skill(name)` quand il en a besoin. Les consignes restent courtes, stables et cachables.
- **Écran** (`/app/agents`, onglet Skills ; lecture pour tous ceux qui utilisent l'IA, écriture pour le propriétaire et les managers) :
  - créer et modifier, chaque enregistrement créant une version, et revenir à une version ;
  - tester sur une fiche : une exécution réelle de l'agent choisi, avec ce skill seul, faite par le worker et comptée dans le budget ; la fiche est transmise sans nom de contact, email ni téléphone ;
  - archiver et restaurer ;
  - importer un fichier SKILL.md ou le `.zip` d'un dossier de skill (les annexes qui ne sont pas du texte sont ignorées), exporter au même format.
- **Skill généré** : `offres-cleads` n'a pas de texte propre ; il est écrit à partir des offres actives à chaque utilisation.
- **Origine** : un skill est une consigne interne, écrite par l'équipe. Il n'est jamais rempli automatiquement à partir d'un contenu externe.

| Skill V1 | Utilisé par | Contenu |
|---|---|---|
| `audit-seo-local` | Auditeur | fiche Google, cohérence nom-adresse-téléphone, pages locales, données structurées LocalBusiness |
| `audit-geo-site` | Auditeur | ce qu'un moteur IA comprend du site : entité claire, FAQ, données structurées, `llms.txt`, robots IA |
| `audit-ux-conversion` | Auditeur, Designer | promesse, preuves, appels à l'action, freins, mobile |
| `presence-sociale` | Auditeur | réseaux attendus selon le secteur, signes d'inactivité |
| `preparation-ads` | Auditeur, Conseiller | balises présentes, page d'atterrissage, secteurs à forte intention |
| `offres-cleads` | Conseiller, Rédacteur, Stratège | catalogue, packs, prix, objections (généré depuis la table `Offer`) |
| `cold-email-fr` | Rédacteur | longueur, personnalisation, une seule demande, mentions CNIL, ton, interdits |
| `script-appel-15min` | Conseiller | structure de l'appel, accroche sur l'audit, proposition de rendez-vous |
| `charte-studio` | Designer | principes de design, typographies, sections, accessibilité, interdits (scripts, faux avis) |
| `playbook-<secteur>` | tous | architectes, artisans du bâtiment, restaurants, santé… : douleurs, vocabulaire, offres qui marchent |

Le catalogue V1 (`features/ai/skills/catalog-v1.ts`) est installé une fois par espace, à la première ouverture d'Agents IA : 12 skills rédigés, dont quatre playbooks (artisans du bâtiment, restaurants, santé, architectes), plus `offres-cleads`. Ce que l'équipe archive ensuite ne revient pas.

## 9. Outils et MCP

Chaque outil est déclaré une seule fois (`defineTool`) avec :
- un schéma d'entrée et de sortie (zod) ;
- le droit requis ;
- une politique de validation (`auto`, `user` ou interdit) ;
- une classe de coût ;
- une description destinée au modèle.

Un outil appelle un service existant ; il ne touche jamais la base directement.

| Famille | Exemples | Validation |
|---|---|---|
| Lecture | `get_lead`, `search_leads`, `get_campaign_metrics`, `get_audit`, `list_offers` | auto |
| Écriture interne | `add_note`, `create_task`, `save_audit`, `save_recommendations`, `enrich_company`, `propose_contact` | auto, journalisée avec `actorKind = AGENT` |
| Effet externe | `send_email`, `enroll_in_sequence`, `launch_search`, `share_preview` | **toujours par une personne** |
| Interdit aux agents | supprimer, fusionner, gérer les boîtes, exporter, changer les droits | — |

**MCP de l'Extractor.**
- **Connexion** : client `@ai-sdk/mcp` en Streamable HTTP vers `/mcp`, avec la clé `crm`, côté serveur seulement ; le worker passe par le réseau local du VPS.
- **Liste blanche** : `list_sectors`, `search_prospect_base`, `get_business`, `get_job`, `get_job_results`, `get_system_health`.
- **Non exposés** : `create_extraction_job` et `cancel_job`. `launch_search` passe par `features/search/service.ts`, qui enregistre la recherche, la campagne et le journal (D27).
- **Workflows codés** : ils gardent le client REST `lib/extractor/client.ts`.

**Outils web (worker).**

| Outil | Comportement |
|---|---|
| `fetch_page` | http(s) seulement, ports 80 et 443. La résolution DNS est vérifiée à chaque redirection (5 au plus) pour refuser les adresses privées, réservées ou locales (IPv4 et IPv6). 2 Mo et 10 s par page, 5 pages par audit, `robots.txt` respecté, agent identifié (`CleadsAuditBot`, avec une page d'explication). |
| `pagespeed` | PageSpeed Insights (clé gratuite), sur mobile et ordinateur. |
| `screenshot` | Pour l'audit, les captures viennent de PageSpeed Insights (mobile et ordinateur) : aucun navigateur ne tourne sur notre serveur. Playwright arrive avec le Studio (E23), pour nos propres maquettes. |
| `detect_stack` | CMS et version, bibliothèques, balises GA4, GTM, pixel Meta et Google Ads. |
| `find_socials` | Liens présents sur le site et réseaux connus de l'Extractor. L'existence est vérifiée par une simple requête, sans lire les profils. |
| `dirigeants` | recherche-entreprises.api.gouv.fr, par SIREN, sinon par nom dans le même code postal (jamais un choix au hasard entre deux). Aucun dirigeant n'est proposé quand l'entreprise s'oppose à l'usage commercial de ses données ou que sa fiche n'est pas entièrement publique. |

## 10. Exécution, validation, temps réel

**Cycle d'une exécution** (`AgentRun.status`) : `QUEUED` → `RUNNING`, puis éventuellement un ou plusieurs passages par `WAITING_APPROVAL`, jusqu'à une fin : `SUCCEEDED`, `FAILED`, `CANCELLED`, `BUDGET_EXCEEDED` ou `EXPIRED` (validation non donnée à temps).

- **Mise en file** : le CRM (Netlify) vérifie le droit et le budget, puis crée l'exécution `QUEUED` avec sa réservation, dans une seule transaction. L'exécution est elle-même l'entrée de la file : aucune tâche ne peut se perdre (détails : [WORKER-IA.md](WORKER-IA.md)).
- **File** :
  - prise par `FOR UPDATE SKIP LOCKED`, par priorité puis par ancienneté ;
  - bail renouvelé toutes les 20 s, et reprise automatique si le worker s'arrête ;
  - 3 tentatives au plus, avec un délai croissant ;
  - une seule exécution d'un agent à la fois par fiche (index unique) ;
  - concurrence bornée par agent ;
  - expiration après 24 h en file.
- **Étapes** : chaque appel de modèle, outil ou décision devient un `AgentStep` : entrée et sortie tronquées, modèle, jetons, coût, durée. Les données personnelles n'y sont recopiées que si c'est nécessaire.
- **Validations** : une action à effet externe crée un `AgentApproval`, avec un résumé lisible, les données exactes de l'action et une expiration.
  - Elle apparaît sur la fiche, dans `/app/agents` (« À valider ») et dans l'espace 3D « Agents IA ».
  - Approuver relance l'exécution à cette étape ; refuser la termine proprement.
- **Temps réel** : le worker publie la progression sur Pusher, dans un canal privé par personne autorisé par `app/api/pusher/auth`. En secours, l'interface interroge l'exécution.
- **Copilote** : il tourne dans une route Next en streaming (`POST /api/ai/chat`), en tours courts (6 étapes au plus, 50 s au plus). Chaque tour est une exécution `RUNNING` du CRM, sans worker. Tout ce qui est long part dans le worker par un outil (`start_audit`, `suggest_offers`, `draft_email`, `start_studio`), qui renvoie une carte d'exécution. Ses validations se donnent dans la conversation (section 17).

## 11. Données

Migrations additives uniquement ; chaque table porte `workspaceId`.

| Table | Epic | Champs principaux |
|---|---|---|
| `AiSetting` | E17 | modèles par rôle, plafond mensuel, quota par personne, plafonds par exécution, taux dollar → euro, alertes envoyées |
| `AiUsage` | E17 | jour, personne, agent, modèle, jetons (entrée, sortie, cache), coût |
| `AgentRun` | E17 | agent, type, statut, demandeur, fiche ou campagne liée, entrée, sortie, erreur, réservation, coût réel, début, fin, exécution parente |
| `AgentStep` | E17 | exécution, rang, type (modèle, outil, décision, validation), nom, entrée et sortie tronquées, modèle, jetons, coût, durée |
| `AgentApproval` | E17 | exécution, action, données de l'action, résumé, statut (en attente, approuvée, refusée, expirée), décidée par, date |
| `AgentDefinition`, `AgentDefinitionVersion` | E19 | agent, consignes ajoutées, rôle de modèle, limites, activation, version ; chaque version garde l'état complet, skills compris |
| `Skill`, `SkillVersion`, `AgentSkill` | E19 | nom, description, version courante, archivé ; contenu, fichiers et note de chaque version ; mode `ALWAYS` ou `ON_DEMAND` |
| `Offer` | E19 | identifiant stable, nom, catégorie, description, livrables, signaux, fourchette de prix et facturation, angle, objections, statut (à valider, active, archivée), validée par |
| `ProspectAudit` | E20 | fiche, entreprise, domaine, sous-scores, constats et preuves, résumé, captures, coût, date, valable jusqu'au |
| `OfferPitch` | E21 | fiche, audit, exécution, phrase d'accroche, script d'appel, objections, angle d'email, preuves citées (copiées), notes, modèle, coût |
| `OfferRecommendation` | E21 | pitch, offre (nom et prix copiés), rang, rôle (principale, pack, entrée, plus tard), adéquation, signaux, argumentaire, gain, preuves, objection, statut (suggérée, retenue, écartée), raison et note d'un refus, décidée par, date |
| `EmailDraft` | E22 | type (premier email, réponse, étape de séquence), fiche, réponse visée, audit, exécution, objet, corps, faits cités (preuves copiées), points à vérifier, modèle, coût, message envoyé, écart `editRatio` |
| `ReplyTriage` | E22 | réponse, exécution, classe proposée et probabilité, place par rapport aux seuils (`AUTO`, `REVIEW`, `HUMAN`), urgence et probabilité, action attendue et probabilité, modèle |
| `GeneratedSite` | E23 | fiche, audit, statut, ce que le collecteur a trouvé, brief (et qui l'a modifié), version en ligne, aléa et empreinte du lien, expiration, visites, date de purge |
| `GeneratedSiteVersion` | E23 | maquette, numéro, instruction, exécution, page publiée, captures (ordinateur, téléphone, premier écran), contrôles, scores PageSpeed avant / après, jeton PageSpeed (empreinte), modèle, coût |
| `GeneratedSiteAsset` | E23 | maquette, nom, type (logo, image, police), données, dimensions, source |
| `GeneratedSiteVisit` | E23 | maquette, version, date (ni cookie ni adresse IP) |
| `AiConversation` | E24 | personne, titre, page de départ, fiches lues (la conversation les suit à l'effacement), coût, tour en cours |
| `AiMessage` | E24 | conversation, ordre, rôle, contenu au format de l'AI SDK (texte, appels d'outils, validations, résultats), métadonnées (page et date d'une question ; exécutions, coût et arrêt d'une réponse), dernière exécution |

Le contenu d'un site audité n'est pas stocké en entier. On ne garde que les extraits utiles aux constats et les captures (S3, purgées avec la fiche).

## 12. Droits

| Droit | OWNER | MANAGER | SDR | CLOSER | VIEWER | Portée |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `ai:use` | ✓ | ✓ | ✓ | ✓ | — | fiches que la personne peut modifier (`lead:write`) |
| `ai:read` | ✓ | ✓ | ✓ | ✓ | ✓ | fiches que la personne voit (`lead:read`) |
| `ai:manage` | ✓ | — | — | — | — | réglages, plafonds, modèles |
| `skill:manage` | ✓ | ✓ | — | — | — | |
| `offer:manage` | ✓ | ✓ | — | — | — | |
| `studio:generate` | ✓ | ✓ | ✓ | ✓ | — | fiches que la personne peut modifier |

Peut valider l'action d'un agent : la personne qui a lancé l'exécution, ou un manager ou le propriétaire. Dans tous les cas, il faut avoir soi-même le droit de faire l'action (par exemple `email:send` sur sa boîte).

`skill:manage` et `offer:manage` sont interdits aux outils des agents : un agent ne réécrit jamais ses consignes ni les offres qu'il recommande.

**Agents IA** (`/app/agents`, E19) :
- **Accès** : visible avec `ai:use`. Un lecteur n'y a pas accès : il verrait des consignes internes et des prix.
- **Onglets** : agents, skills, offres, exécutions (avec le détail des étapes et le résultat), « À valider », consommation.
- **Routes** : `PUT /api/ai/agents/[id]`, `GET` et `POST /api/ai/skills`, `POST /api/ai/skills/import`, `GET` et `PATCH /api/ai/skills/[id]`, `GET /api/ai/skills/[id]/versions/[version]`, `POST /api/ai/skills/[id]/test`, `GET` et `POST /api/ai/offers`, `PATCH /api/ai/offers/[id]`, `GET /api/ai/runs/[id]`.

**Offres suggérées** (fiche, E21) :
- **Accès** : `ai:use` sur une fiche visible, comme Agents IA, car l'onglet montre des offres et des prix. Lancer le Conseiller et décider d'une offre demandent aussi de pouvoir modifier la fiche (`lead:write`).
- **Routes** : `GET` et `POST /api/leads/[id]/offers` (état et lancement), `PATCH /api/leads/[id]/offers/[recommendationId]` (retenir, écarter avec une raison, annuler).

**Rédaction et réponses** (E22) :
- **Brouillons** : `ai:use` et `email:send` sur une fiche que la personne peut modifier. Pour une étape de séquence : `ai:use` et `sequence:manage`. La personne suit son brouillon ; un manager voit ceux de l'équipe.
- **Répondre** : `email:send`, depuis la boîte qui a reçu la réponse, avec les règles de la fiche (exclusion, « ne plus contacter »).
- **Routes** :
  - `POST /api/leads/[id]/email/draft` ;
  - `POST /api/replies/[id]/draft` ;
  - `POST /api/sequences/draft` ;
  - `GET /api/ai/drafts/[runId]` ;
  - `POST /api/replies/[id]/answer` ;
  - `POST /api/leads/[id]/email`, qui accepte `draftId`.

**Studio Web** (E23) :
- **Accès** : `studio:generate` (propriétaire, manager, SDR, closer), avec la portée de `lead:write` pour agir ; voir une maquette demande de voir sa fiche. Lancer le Designer demande aussi `ai:use` et réserve son plafond (2 €).
- **Routes** :
  - `GET` et `POST /api/leads/[id]/studio` (état de la fiche, nouvelle maquette) ;
  - `GET` et `PATCH /api/studio/sites/[id]` (maquette, brief modifié) ;
  - `POST /api/studio/sites/[id]/brief`, `/build`, `/revise` (brief relancé, génération, instruction) ;
  - `POST` et `DELETE /api/studio/sites/[id]/link` (créer ou prolonger le lien, le désactiver) ;
  - `POST /api/studio/sites/[id]/versions/[n]` (remettre une version en ligne) ;
  - `GET /api/studio/sites/[id]/preview?v=n`, `/versions/[n]/[desktop|mobile|thumb]`, `/assets/[name]` (aperçu interne, captures, images) ;
  - public, sur l'hôte d'aperçu seulement : `/<jeton>`, `/<jeton>/a/<nom>`, `/<jeton>/vu` (`app/apercu/[...path]`).

**Copilote** (E24) :
- **Accès** : `ai:use`. Ses outils sont ceux que le rôle permet, et chacun passe par le service habituel au nom de la personne : il voit et fait exactement ce qu'elle peut. Un lecteur n'a pas de copilote (chaque tour coûte).
- **Conversations** : privées ; ni les managers ni le propriétaire ne les lisent. Les exécutions des tours restent visibles comme les autres (Agents IA › Exécutions), avec des étapes courtes.
- **Routes** : `POST /api/ai/chat` (un tour, en streaming) ; `GET` et `DELETE /api/ai/conversations` (liste, tout effacer) ; `GET` et `DELETE /api/ai/conversations/[id]` ; `GET /api/ai/runs/[id]?view=status` (état d'une exécution, pour les cartes).

**Réglages › IA** (`/app/settings/ai`) :
- **Accès** : la page est visible avec `ai:use`. Le propriétaire la modifie (`ai:manage`) ; les autres la lisent.
- **Contenu** : la consommation du mois et le quota du jour de la personne, le détail par personne (propriétaire et manager seulement), les validations en attente et les exécutions récentes.
- **Routes** : `GET` et `PUT /api/ai/settings`, `POST /api/ai/approvals/[id]` (approuver ou refuser), `POST /api/ai/runs/[id]/cancel`.

## 13. Audit et enrichissement (E20)

| Volet | Contrôles | Source |
|---|---|---|
| Technique | HTTPS, redirections, temps de réponse, poids, `title`, `description`, H1, OpenGraph, `sitemap.xml`, `robots.txt` | site |
| Vitesse et mobile | scores Lighthouse mobile et ordinateur, Core Web Vitals, viewport | PageSpeed Insights, site |
| SEO local | fiche Google (catégories, horaires, photos, avis, note) ; cohérence nom-adresse-téléphone entre site et fiche ; données structurées LocalBusiness ; pages par ville ou par service | Extractor, site |
| GEO (sur le site) | entité claire, FAQ, données structurées, `llms.txt`, robots IA autorisés | site |
| Conversion | promesse, preuves, appels à l'action, téléphone cliquable, prise de rendez-vous, freins | captures + vision |
| Image | modernité, cohérence visuelle, signes d'un site daté (copyright ancien, bibliothèques obsolètes, mise en page fixe) | captures + vision, site |
| Présence | réseaux présents ou absents, balises publicitaires (indice d'une pub en cours) | site, Extractor |
| Entreprise | dirigeants, SIREN, NAF | annuaire des entreprises, Extractor |

**Sortie `ProspectAudit`** : 8 sous-scores sur 100, chacun avec ses preuves ; forces, faiblesses, frictions et opportunités ; un résumé en 3 points pour le closer.

**Effets sur la fiche** :
- le score (`features/leads/scoring.ts`) reçoit une raison « IA » avec sa confiance, sans que ses règles changent ;
- un dirigeant trouvé devient un contact **proposé**, avec sa source et sa base légale renseignées dans `Contact` ; jamais une adresse devinée ;
- un site injoignable donne un audit partiel, qui le dit.

**Implémentation (E20, `features/prospect-audit/`)** : un workflow codé, exécuté par le worker, en cinq temps.
1. **Collecte** sans modèle :
   - le site, à travers `net.ts` (adresses publiques seulement à chaque redirection, ports 80 et 443, 2 Mo et 10 s par page, robot identifié par la page publique `/robot`) ;
   - chaque page est décodée dans son encodage, comme le fait un navigateur : celui de l'en-tête, sinon celui déclaré dans la page. Une page dont les octets ne sont pas de l'UTF-8 valide est lue en Windows-1252, encodage de beaucoup d'anciens sites français, même si elle se dit en UTF-8 ;
   - PageSpeed Insights sur mobile et ordinateur ;
   - l'annuaire des entreprises ;
   - la fiche Google telle que l'Extractor l'a importée : note, avis, catégorie, téléphone. Horaires et photos ne sont pas disponibles par une source gratuite.
2. **Extraction** par le rôle `fast`, sans outil : le texte des pages, encadré comme contenu externe, devient un relevé borné qui ne cite les pages que par leur identifiant.
3. **Mesure** par des règles (`rules.ts`) : constats mesurés, sous-scores, signaux d'offres. Chaque élément a sa preuve : P pour une page, M pour une mesure, C pour une capture, S pour une source.
4. **Analyse** par le rôle de l'agent (Sonnet par défaut), avec les deux captures.
   - Consignes : celles de l'agent, plus ses skills d'audit et le playbook du secteur, s'ils lui sont donnés.
   - Ce qui ne cite aucune preuve existante est supprimé avant l'enregistrement.
5. **Enregistrement** : `ProspectAudit`, plus `ProspectAuditCapture` pour les captures, gardées en base et supprimées avec l'audit.
   - L'audit est réutilisé 30 jours pour toutes les fiches du même domaine, sauf « Refaire l'audit ».
   - Le score de la fiche affiche une ligne « Audit IA » avec sa confiance, qui est la part des 8 volets réellement mesurés.

## 14. Offres et pitch (E21)

**Catalogue V1** (`features/offers/catalog-v1.ts`), installé une fois par espace **en brouillon**. Le propriétaire ou un manager vérifie chaque offre dans Agents IA › Offres, puis l'active. Les agents ne voient que les offres actives : `list_offers`, le skill `offres-cleads` et la garde `assertActiveOffers` lisent le même filtre. Les prix sont indicatifs : à remplacer par les tiens. Les signaux viennent d'un vocabulaire fixe (`features/offers/signals.ts`), que l'audit (E20) lèvera avec leurs preuves.

| Offre | Signaux qui la déclenchent | Livrables | Prix indicatif HT |
|---|---|---|---|
| Site vitrine | pas de site, site injoignable, seulement une page de réseau social | site de 5 à 8 pages, responsive, SEO de base, mise en ligne | 1 500 à 4 000 € |
| Refonte de site | site daté, site lent ou non adapté au téléphone (score mobile < 50 ou page sans viewport), pas de HTTPS, CMS obsolète | refonte complète, reprise des contenus, redirections | 2 000 à 6 000 € |
| Landing de conversion | site correct mais appel à l'action faible, pas de prise de rendez-vous, publicité sans page dédiée | une page orientée conversion, formulaire ou réservation, suivi | 600 à 1 500 € |
| SEO local | fiche Google incomplète, moins de 20 avis ou note < 4, incohérences nom-adresse-téléphone, pas de LocalBusiness | fiche optimisée, citations, pages locales, collecte d'avis | 300 à 800 € / mois |
| SEO éditorial | peu de pages, pas de contenu par service ou par ville | contenus mensuels, maillage, suivi des positions | 600 à 1 500 € / mois |
| GEO | pas de données structurées, pas de FAQ, entité floue | données structurées, FAQ, `llms.txt`, contenus « réponse » | 400 à 1 000 € / mois |
| Réseaux sociaux | aucun réseau ou réseaux inactifs, secteur visuel | ligne éditoriale, contenus, animation | 400 à 1 200 € / mois |
| Google Ads | aucune balise Google Ads dans un secteur à forte intention (urgence, devis) | campagnes, page d'atterrissage, suivi des conversions | 300 à 900 € / mois hors budget média |
| Meta Ads | secteur visuel sans pixel Meta | campagnes, créations, pixel, suivi | 300 à 900 € / mois hors budget média |
| Parcours d'acquisition complet | au moins trois volets de l'audit sous 50 | site ou landing + SEO / GEO + réseaux + publicité + prospection | 1 500 à 4 000 € / mois |
| Cleads Essential / Growth / Enterprise | prospect à accompagner dans la durée | formules de la landing (`components/home-v2/content.ts`) | prix de la landing |

**Recommandation.**
1. Des règles transforment les signaux de l'audit en offres candidates.
2. Le Conseiller offres (Sonnet 5.5) les classe, écrit pourquoi avec les preuves et compose un pack réaliste.
3. Il prépare :
   - un script d'appel de 15 minutes (accroche sur l'audit, question, proposition de rendez-vous) ;
   - les objections probables, avec leurs réponses ;
   - un angle d'email.

Tout s'affiche dans l'onglet « Offres suggérées » de la fiche. La personne accepte ou refuse chaque offre, ce qui sert à mesurer la pertinence (E27).

**Implémentation (E21, `features/offer-pitch/`)** : un workflow codé, exécuté par le worker.
1. **Candidates** (`rules.ts`, sans modèle) : une offre active devient candidate quand l'audit a levé l'un de ses signaux avec une preuve existante ; huit au plus, les mieux étayées d'abord. « Prospect à accompagner dans la durée » est ajouté quand l'audit trouve trois volets sous 50, ou des besoins récurrents dans deux domaines (SEO et publicité, par exemple), avec leurs preuves.
2. **Refus avant toute dépense** : pas d'audit, aucune offre active ou aucune candidate. La fiche le dit et propose l'étape qui manque (lancer l'audit, valider le catalogue).
3. **Conseiller offres** (`advisor.ts`) : un appel du rôle de l'agent, sans outil.
   - Il reçoit l'audit encadré comme contenu externe (ses textes peuvent reprendre le site du prospect), sans le nom des dirigeants, puis les candidates.
   - Ses consignes comprennent son rôle d'expert, `offres-cleads`, `script-appel-15min`, le playbook du secteur et `preparation-ads` quand une offre de publicité est candidate.
   - Il ne peut nommer qu'une candidate : le schéma de sortie n'en connaît pas d'autre.
4. **Ce qui est gardé** :
   - une offre dont l'argument ne cite aucune preuve existante est retirée, avec une note ;
   - l'accroche du script sans preuve est remplacée par le premier constat de l'audit ;
   - l'angle d'email sans preuve est retiré ;
   - le pack garde une offre principale, deux compléments au plus et une offre d'entrée au plus ;
   - si aucune offre ne reste, l'exécution est retentée (trois fois au plus, dans son plafond).
5. **Enregistrement** : `OfferPitch` et `OfferRecommendation`, avec le nom et le prix de chaque offre tels que recommandés et les preuves citées, copiées de l'audit. Les offres désactivées pendant l'appel sont écartées à ce moment-là ; si aucune ne reste, l'exécution échoue avec la raison. Le budget du pack est additionné à partir des prix du catalogue, jamais écrit par le modèle.
6. **Décisions** : « Retenir » ou « Écarter » avec une raison (pas adaptée, trop chère, déjà équipé, pas le bon moment, autre), annulables. Elles sont journalisées (`offer.recommendation_*`), et Agents IA › Offres affiche pour chaque offre combien de fois elle a été suggérée, retenue et écartée. Une offre qui n'est plus active peut être écartée, pas retenue.

## 15. Rédaction et réponses (E22)

- **Brouillon IA** (fenêtre d'email, étapes de séquence) :
  - sujet et corps courts, personnalisés, une seule demande (un échange de 15 minutes) ;
  - uniquement des faits issus de l'audit ou de la fiche, en suivant le skill `cold-email-fr` ;
  - les variables des modèles (`features/outreach/template.ts`) restent utilisables ;
  - le pied de page légal et la désinscription sont ajoutés par `features/outreach/footer.ts`, jamais par le modèle ;
  - la personne relit et modifie ; l'écart entre le brouillon et l'envoi est conservé pour mesurer la qualité.
- **Classement des réponses** : Jev répond à trois questions, chacune avec sa probabilité : la classe `ReplyClass`, l'urgence, le besoin d'une action.
  - Au-dessus du seuil, la suggestion est pré-remplie et se confirme en un clic.
  - En dessous, la réponse reste « À classer ».
  - Les arrêts de séquence existants (E9c) ne changent pas.
- **Réponse suggérée** à une réponse intéressée : un brouillon qui propose des créneaux (lien de réservation `/rdv/[closer]`), relu avant envoi.

**Implémentation (E22)**
- **Classement** (`features/reply-triage/`) :
  - la lecture des boîtes met en file une exécution de l'Analyste réponses pour chaque réponse d'une personne ; une exécution déjà en file pour la fiche prend aussi les suivantes ;
  - Jev reçoit la réponse encadrée comme contenu externe. Sous le seuil bas (0,6) ou en cas de refus, la réponse reste « À classer » ; au-dessus, la suggestion s'affiche avec sa probabilité et se confirme en un clic ;
  - la maintenance du worker remet en file les réponses oubliées des 7 derniers jours, en laissant reposer 30 minutes une fiche qui vient d'avoir une exécution ;
  - l'historique de l'exécution ne recopie pas le texte de la réponse.
- **Brouillons** (`features/email-draft/`) : un appel du rôle de l'agent (Sonnet), sans outil, avec 3 000 jetons de sortie (raisonnement compris).
  - **Premier email** : il s'appuie sur l'audit et sur le pitch, s'il existe. Les faits cités sans preuve existante sont retirés, et les points à vérifier sont listés : passage entre crochets, lien, longueur.
  - **Réponse** : notre email (sans pied de page), la réponse et le contexte, encadrés. Le lien de réservation est ajouté par le code ; sans page active, la réponse demande le créneau qui convient.
  - **Étape de séquence** : un modèle avec les variables `{{prenom}}`, `{{entreprise}}`, `{{ville}}`, `{{secteur}}` et `{{site}}`, contrôlé par `templateErrors`.
- **Mesure** : à l'envoi, le message est relié à son brouillon avec `editRatio`, la distance d'édition entre leurs mots rapportée au plus long (0 = envoyé tel quel). Un brouillon manquant ou déjà utilisé ne bloque jamais l'envoi.

## 16. Studio Web (E23)

**Pipeline**
1. **Collecte** : textes, images, logo, couleurs et typographies du site (5 pages au plus), données de l'Extractor (horaires, adresse, note), constats de l'audit.
2. **Brief** (Opus 5.5) : positionnement, plan des sections, ton, palette, typographies, et « ce qui change par rapport à votre site ». On peut le relire et le modifier avant la génération.
3. **Code** (Opus 5.5, skill `charte-studio`) :
   - une page HTML avec des classes Tailwind, responsive, accessible, en français ;
   - seulement des faits de la fiche et du site ;
   - images du prospect rehébergées, ou fonds neutres ;
   - **aucun script, aucun faux avis** : seulement la note Google agrégée, avec sa source.
4. **Construction (worker)** :
   - Tailwind compilé et minifié dans la page ;
   - nettoyage par liste blanche : suppression de `script`, des attributs `on*`, des `iframe`, `object`, `embed` et des formulaires ;
   - liens limités à `https:`, `tel:` et `mailto:`.
5. **Contrôle** :
   - rendu Playwright en 1440 et en 390 px ;
   - critique visuelle (Sonnet 5.5) sur une grille : hiérarchie, lisibilité, contrastes, mobile, fidélité à la marque ;
   - axe-core (aucune erreur critique) et Lighthouse ;
   - une ou deux corrections par Opus si la grille n'est pas atteinte.

   Les scores « votre site → maquette » vont dans le pitch.
6. **Publication** : fichiers sur S3 (`studio/<id>/v<n>/`) ; jeton aléatoire de 128 bits dont seule l'empreinte est stockée ; URL `https://apercu.cleads.fr/<jeton>`.

**Aperçu.** `proxy.ts` reconnaît l'hôte `apercu.cleads.fr` et sert la page avec ces en-têtes :
```
Content-Security-Policy: sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https:; frame-ancestors https://cleads.fr
X-Robots-Tag: noindex, nofollow
Referrer-Policy: no-referrer
Cache-Control: private, no-store
```
- **Isolation** : la directive `sandbox` donne à la page une origine opaque. Même sur un sous-domaine de `cleads.fr`, elle ne peut ni exécuter de script, ni lire ou écrire de cookie. Les cookies de session du CRM restent attachés à `cleads.fr` seul.
- **Bandeau** : « Maquette non contractuelle réalisée par Cleads pour <entreprise> ».
- **Expiration** : après 30 jours, le lien affiche une page « maquette expirée ». Les fichiers sont purgés à 90 jours, ou dès la suppression de la fiche.

**Versions.**
- « Modifier par instruction » (« passe le bouton en vert », « ajoute une section zone d'intervention ») crée une nouvelle version.
- Historique et comparaison dans `/app/studio`.
- L'aperçu interne du CRM passe par une route signée, affichée dans un `iframe` `sandbox` ; il ne compte pas de visite.

**Suivi des visites (D25).**
- Une visite est comptée quand un navigateur affiche réellement la page (il charge une ressource de la page). Cela écarte la plupart des robots des messageries qui ouvrent les liens pour les vérifier.
- On enregistre la date, sans cookie ni adresse IP en clair.
- Le closer reçoit une notification : « la maquette de X vient d'être ouverte ».
- À mentionner dans la politique de confidentialité.

**Partage.** Envoyer le lien au prospect est une action externe : elle passe par une validation, puis par l'envoi d'email habituel.

**Implémentation (E23, `features/studio/`)** : un workflow codé, exécuté par le worker, en deux exécutions de l'agent `designer`.
1. **Brief** (`kind: "brief"`) :
   - le collecteur de l'audit lit le site (`collectSite`, robots.txt respecté, adresses publiques seulement) en gardant le HTML de chaque page ;
   - `brand.ts` y relève le logo, les photos (y compris chargées en différé ou en fond), les feuilles de style et la couleur déclarée ; `palette.ts` classe les couleurs des feuilles de style, `fonts.ts` les polices ;
   - les images sont téléchargées par `safeFetch` en binaire (4 Mo au plus), puis préparées par Chromium : décodées, réduites à 1 600 px (600 pour le logo), réencodées en WebP. Les couleurs du logo sont lues au passage. Un SVG devient une image : il n'est jamais servi tel quel ;
   - le brief (Opus) reçoit les pages, la fiche (F1…) et les constats de l'audit (A1…), encadrés comme contenu externe. Chaque point cite sa source ; un point sans source connue est retiré, et une image ou une police hors liste est remplacée ;
   - la personne relit et modifie le brief : un point qu'elle écrit n'a pas de source, il est le sien.
2. **Page** (`kind: "build"`, ou `"revise"` avec une instruction) :
   - Opus écrit le contenu du `<body>` en classes Tailwind, en flux continu ;
   - `sanitize.ts` le nettoie par liste blanche, sur un arbre analysé puis réécrit (htmlparser2) : éléments et attributs connus, images `asset:<nom>` du site seulement (avec leurs vraies dimensions, en différé sous le premier écran), liens `https:`, `tel:`, `mailto:` ou ancres, SVG simples sans référence extérieure ;
   - `tailwind.ts` compile les classes utilisées avec le thème de la marque (`brand`, `accent`, `font-display`), puis retire toute règle qui chargerait une ressource ;
   - `document.ts` assemble la page : en-tête, polices hébergées avec la page (Google Fonts, sous-ensemble latin), bandeau, balise de visite ;
   - Chromium la rend sur ordinateur et téléphone, sans réseau, toutes ses images chargées ; axe-core la contrôle (WCAG 2.1 A et AA) ; Sonnet la critique sur six critères (hiérarchie, lisibilité, contrastes, mobile, fidélité à la marque, conversion) d'après les captures ;
   - si la grille n'est pas atteinte (une note sous 3, une moyenne sous 3,8, un défaut grave, une erreur axe critique ou sérieuse), Opus corrige, deux fois au plus et s'il reste 0,65 € dans le plafond ; la meilleure version est publiée ;
   - une page coupée par la limite de longueur n'est jamais publiée ;
   - PageSpeed mesure la version publiée par un jeton de 15 minutes, sans `noindex` ni balise de visite, et avec `sandbox allow-scripts` : Lighthouse mesure par ses propres scripts et échoue sous une isolation qui les interdit. `default-src 'none'` refuse toujours ceux de la page. Les scores du site actuel viennent de son audit ;
   - les réponses du modèle (brief, critique) sont validées par des schémas souples : longueurs, nombres et formats sont ramenés par le code, car un seul texte un peu long faisait rejeter toute la critique au premier essai réel ;
   - ce qui manque ou reste à vérifier avec le prospect va dans la liste « À vérifier » du brief, jamais sur la page. Une page qui en garde la trace (« à fournir », « à confirmer ») est corrigée, même sans critique ;
   - seules les polices du site que Google Fonts sert sont proposées.
3. **Lien** : jeton de 22 caractères (132 bits), HMAC d'un aléa par `STUDIO_PREVIEW_SECRET` (ou une clé dérivée de `NEXTAUTH_SECRET`). La base garde l'aléa et l'empreinte du jeton : un vol de la base ne donne aucun lien, et le CRM peut réafficher le sien. « Prolonger » garde l'adresse, « Désactiver » la coupe, et un nouveau lien en change.
4. **Hôte d'aperçu** : `netlify.toml` et `next.config.mjs` réécrivent toute adresse de `apercu.cleads.fr` vers `app/apercu/[...path]`, et `proxy.ts` y renvoie les chemins du CRM. Le CRM ne répond donc jamais sur cet hôte. En développement, les aperçus sont servis sous `/apercu` sur l'hôte du CRM.
   - Son `robots.txt` autorise l'exploration. Une page partagée se garde des moteurs par `noindex` (en-tête et balise), qu'un robot ne lit que s'il peut charger la page.
   - Un `Disallow: /` ne désindexait rien, et faisait tomber le score SEO de PageSpeed à 66 sur la première maquette réelle.
5. **Stockage** : les pages, captures, images et polices sont en base, comme les captures de l'audit ; une maquette pèse environ 1 à 2 Mo.
6. **Visites** : une par demi-heure et par maquette, robots et vérificateurs de liens écartés. La personne qui a créé le lien et le responsable de la fiche reçoivent une notification, et l'historique de la fiche note l'ouverture.
7. **Purge** : la maintenance du worker vide une maquette 90 jours après sa dernière version ou la dernière prolongation de son lien. Les pages, captures, images et le brief sont supprimés ; la trace reste (statut, visites, coût).
8. **Partage** : « Insérer le lien de la maquette » dans la fenêtre d'email de la fiche. La personne relit et envoie l'email, ce qui vaut validation.

## 17. Copilote (E24) et Stratège (E25)

**Copilote (E24, `features/copilot/`, `components/crm/copilot/`).**
- **Panneau** : à droite, dans la 2D et la 3D, ouvert par ⌘J, par le bouton des barres ou par la palette ⌘K (« Ouvrir le copilote », « Demander au copilote : … »). La conversation survit à la navigation dans le CRM. Dans la 3D, ⌘J marche aussi depuis une fenêtre, et ses liens (fiches citées, « Ouvrir le brouillon », « Ouvrir la maquette ») s'ouvrent dans les fenêtres de la vue (`ModuleWindow`).
- **Contexte** : le panneau envoie l'adresse de sa page (dans la 3D, celle de la fenêtre ouverte). Le serveur la décrit au modèle en une ligne (fiche, campagne, maquette, liste filtrée et ses filtres) après avoir vérifié que la personne la voit, avec la date et l'heure de Paris. Cette ligne précède la question plutôt que les consignes, qui restent identiques d'un tour à l'autre.
- **Agent** : un `ToolLoopAgent` (AI SDK 7), rôle `writer` (Sonnet 5.5) ou `fast` (Haiku 5.5) au choix du propriétaire, raisonnement « low », 2 000 jetons au plus par étape et 6 étapes par tour. Ses consignes : persona, règles communes, consignes de l'équipe, catalogue de skills (`offres-cleads`, playbooks), puis la façon de travailler ici.
- **Outils** : lecture sans validation (`search_leads`, `get_lead`, `get_lead_audit`, `get_lead_offers`, `get_today`, `list_meetings`, `get_pipeline`, `list_campaigns`, `get_campaign`, `read_skill`) ; actions validées (`create_task`, `add_note`, `start_audit`, `suggest_offers`, `draft_email`, `start_studio`). Les résultats sont courts et en français ; l'email et le téléphone du contact restent sur la fiche, et le texte d'un email reçu arrive balisé comme contenu externe.
- **Validation** : `toolApproval` de l'AI SDK. Le serveur écrit la carte (« Créer la tâche « Rappeler Jean » sur la fiche Plomberie Dupont, pour le mardi 10 novembre. », « … 0,30 € au plus ») ; un appel impossible est refusé avant de demander, et le modèle en lit la raison. La personne valide ou refuse ; une validation laissée en attente est refusée à la question suivante. Refuser n'appelle pas le modèle.
- **Le serveur garde la conversation** : du navigateur, il ne prend que le texte d'une question, ou la réponse aux validations du dernier message, appariée à ce qu'il a lui-même demandé (appel, identifiant de validation, état). Un historique forgé, une validation inventée, rejouée ou venue d'une autre personne n'atteignent ni le modèle ni les outils.
- **Budget** : un tour est une exécution du copilote, qui réserve son plafond (0,10 €) avant d'écrire quoi que ce soit. Chaque étape est facturée avant la suivante, sa sortie est bornée par ce qui reste au pire prix du modèle et de ses secours, et le tour s'arrête quand une réponse courte ne tiendrait plus. L'historique envoyé au modèle se limite aux 24 derniers messages, et les résultats d'outils des réponses plus anciennes que les deux dernières y sont résumés : le modèle relance l'outil s'il en a besoin.
- **Durée** : un tour s'arrête à 50 s, garde ce qui est écrit et le dit (« demandez la suite ») ; la réponse est enregistrée après chaque étape et à la fin, même si le panneau s'est fermé (`after` de Next). Un tour à la fois par conversation ; un tour mort sans le dire libère la conversation au bout de 3 minutes.
- **Délégation** : les spécialistes travaillent dans le worker. La carte suit leur exécution en direct (Pusher, sinon toutes les 5 s) et ouvre le résultat : l'audit ou les offres sur la fiche, la maquette dans le Studio, le brouillon dans la fenêtre d'email de la fiche (`?brouillon=<exécution>`), que la personne relit et envoie elle-même.
- **Conversations** : privées, listées dans le panneau avec leur coût, effaçables une à une ou toutes. Supprimées avec toute fiche qu'elles ont lue (dans la transaction de suppression) et 90 jours après leur dernier message (maintenance du worker).
- **Stratège** :
  - il part du catalogue d'offres, des résultats des campagnes (`features/metrics`) et de la taxonomie de l'Extractor (`list_sectors`) ;
  - il propose les secteurs à cibler, les douleurs de chaque métier, l'offre phare, l'angle et les zones ;
  - il prépare une campagne brouillon (E15) et une recherche ; le lancement est validé, puis passe par `launch_search` ;
  - après l'import, Jev trie les fiches selon leur pertinence pour la campagne et l'offre.

## 18. Interfaces 2D et 3D

| Endroit | Ajout | Epic |
|---|---|---|
| Fiche (`app/(crm)/app/leads/lead-detail-view.tsx`) | onglets « Audit IA » et « Offres suggérées », boutons « Auditer » et « Générer une landing », carte d'exécution en direct | E20, E21, E23 |
| Fenêtre d'email (`email-dialog.tsx`), séquences | bouton « Brouillon IA » | E22 |
| Réponses (`/app/mailbox`) | classement suggéré avec sa probabilité, réponse suggérée | E22 |
| `/app/agents` | exécutions, « À valider », agents, skills, offres, consommation, qualité | E17, E19, E27 |
| `/app/studio` | maquettes, versions, visites | E23 |
| Réglages › IA (`/app/settings/ai`) | modèles par rôle, plafonds, quotas, consommation | E17 |
| Palette ⌘K | « Ouvrir le copilote », « Demander au copilote : … » (l'audit et la maquette se lancent depuis la fiche, ou en le demandant au copilote) | E24 |
| Partout | copilote ⌘J, bouton des barres 2D et 3D | E24 |

**QG 3D (E26).**
- **Deux nouveaux espaces** dans `features/hq/zones.ts` :
  - « Agents IA » : touche 9, ouvre `/app/agents`, droit `ai:read` ;
  - « Studio Web » : touche 0, ouvre `/app/studio`, droit `studio:generate`.
- **Scène** : plateforme agrandie (`components/crm/hq/scene/layout.ts`), compositions dans `scene/zones.tsx`.
- **Contenu** : « Agents IA » montre les agents à leur poste et leur activité en direct, avec la file « À valider » dans le panneau ; « Studio Web » montre les dernières maquettes.
- **Personnages** : générés avec Meshy, après confirmation du coût.
- **Au passage** : le commentaire de `zones.ts` qui cite encore E13 sera mis à jour.

## 19. Sécurité et RGPD

- **Secrets** : `AI_GATEWAY_API_KEY`, `GOOGLE_PAGESPEED_API_KEY` et la clé `crm` de l'Extractor restent côté serveur. Jamais en `NEXT_PUBLIC_`, jamais dans une réponse ni dans un journal.
- **Injection** :
  - le contenu externe est lu par une étape sans outils, avec une sortie structurée et bornée ;
  - les consignes des agents sont placées avant le contenu et rappellent qu'un contenu externe n'est jamais une instruction ;
  - toute action externe est validée par une personne ;
  - chaque agent a une liste blanche d'outils.
- **SSRF** : `fetch_page`, les captures et la collecte du Studio refusent les adresses privées, réservées et locales, à chaque redirection.
- **Maquettes** : HTML nettoyé par liste blanche, aucun script exécuté (CSP `sandbox`), non indexées, expirantes.
- **Données personnelles** :
  - minimisation : les audits portent sur l'entreprise ; le nom et l'email ne servent qu'à rédiger ;
  - pas de recopie inutile dans les étapes ;
  - purge avec la fiche : audits, captures, maquettes, conversations ;
  - fournisseurs hors UE avec DPA et sans entraînement sur nos données (D16) ;
  - à compléter : la politique de confidentialité (usage de l'IA, suivi des maquettes) et le registre des traitements (E14) ;
  - droits d'accès et d'effacement : les données IA d'une fiche suivent la fiche.
- **Journal** : chaque action d'un agent est journalisée (`AuditLog`, `Activity.actorKind = AGENT`) avec l'exécution qui l'a produite.

## 20. Qualité et évaluations (E27)

| Agent | Jeu d'évaluation | Mesures |
|---|---|---|
| Auditeur | une trentaine de sites figés en HTML (sans réseau), avec leurs constats attendus | constats justes, preuves présentes (100 %), coût, durée |
| Conseiller offres | audits de référence et offres attendues | adéquation, taux d'acceptation par les closers |
| Rédacteur | fiches de référence | grille : personnalisation, longueur, une seule demande, faits sourcés, ton, orthographe ; taux d'édition |
| Analyste réponses | 200 à 500 réponses étiquetées par les SDR | exactitude, calibration, part traitée au-dessus du seuil ; comparatif Jev / Haiku / règles |
| Designer | briefs de référence | grille visuelle, Lighthouse, axe-core, absence de script (100 %) |

- Les évaluations se lancent à la demande, avec le coût affiché avant.
- Les tests automatiques n'appellent jamais de vrai modèle : ils utilisent les modèles simulés de `ai/test`, dont `Experimental_DecisionMockModelV4`.
- Tout changement de modèle ou de consigne importante passe par une évaluation chiffrée.

## 21. Exploitation

| Variable | Où | Rôle |
|---|---|---|
| `AI_GATEWAY_API_KEY` | CRM, worker | passerelle IA |
| `GOOGLE_PAGESPEED_API_KEY` | worker | PageSpeed Insights |
| `DATABASE_URL` | worker | même base que le CRM |
| `EXTRACTOR_URL`, `EXTRACTOR_API_KEY` | CRM, worker | REST et MCP de l'Extractor (adresse interne côté worker) |
| variables Pusher existantes | CRM, worker | progression en direct |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME` | CRM | fichiers du CRM (S3, `lib/s3.ts`) ; les captures et les maquettes sont gardées en base |
| `STUDIO_PREVIEW_HOST` | CRM, worker | hôte des aperçus, `apercu.cleads.fr` par défaut en production ; aucun en développement (aperçus sous `/apercu`) |
| `STUDIO_PREVIEW_SECRET` | CRM | facultatif : secret dont les liens d'aperçu sont dérivés ; sinon une clé dérivée de `NEXTAUTH_SECRET` |

**Worker** (E18, détails et commandes : [WORKER-IA.md](WORKER-IA.md)).
- **Image** : Node 24, construite sur le VPS depuis le paquet `worker/dist`, un seul fichier produit par esbuild, plus le client Prisma généré dans l'image. Chromium arrivera avec E20.
- **Service** : projet Compose à part dans `/opt/cleads/ai`, relié au réseau de l'Extractor ; les déploiements de l'Extractor n'y touchent pas.
- **Robustesse** : bail par battement de cœur, reprises bornées, arrêt propre (les exécutions en cours sont remises en file), point de santé local, journaux JSON.
- **Alertes** : notification aux propriétaires après des échecs répétés ou à l'approche du plafond.
- **Déploiement** : `scripts/deploy-ai-worker.sh`, avec retour automatique à l'image précédente ; l'automatisation viendra avec E14.

## 22. Points ouverts

| Point | Qui | Avant |
|---|---|---|
| `DATABASE_URL` du worker (base Railway, rôle dédié recommandé) à saisir avec `scripts/set-ai-worker-env.sh` | le propriétaire | mise en service du worker |
| Clé Vercel AI Gateway (compte Vercel) et clé gratuite Google PageSpeed Insights | le propriétaire | E17, E20 |
| Vérifier puis activer les offres du catalogue V1 dans Agents IA › Offres (prix indicatifs) | le propriétaire | E21 |
| Crédits Meshy pour les personnages des agents | confirmation au moment venu | E26 |
| DPA des fournisseurs, politique de confidentialité, registre des traitements | le propriétaire | ouverture à l'équipe |
| Durée de streaming réellement permise par les fonctions Netlify | à mesurer | E24 |

**Prochaine étape : E25 (stratège et sourcing).**
