# Enrichissement des prospects (E30)

Quatre sources, chacune pour une question (décisions D45 à D53 dans [PLAN.md](PLAN.md)) :

| Question | Source | Lot | Coût |
|---|---|---|---|
| Quand appeler, qui écarter | **BODACC** (open data de la DILA) et **annuaire des entreprises** (INSEE, RNE) | 1, fait | gratuit, sans clé |
| À qui parler | **Exa**, par les outils de la passerelle IA | 2 | 7 $ les 1 000 recherches |
| Quoi dire | **Perplexity**, par les outils de la passerelle IA | 2 | 5 $ les 1 000 recherches |
| La preuve d'un budget | **Meta**, bibliothèque publicitaire | 3 | gratuit, application Meta vérifiée |

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

## Conformité
- **Sources** : BODACC et annuaire des entreprises sont des données publiques sous Licence Ouverte Etalab 2.0. On n'en garde que ce qui sert à la fiche.
- **Opposition** : une entreprise non diffusible, ou un entrepreneur individuel opposé à la prospection (RNE), n'est jamais importé. Un dirigeant n'est jamais proposé quand l'entreprise s'est opposée. La liste d'exclusion du CRM s'applique comme pour tout import.
- **Base légale** : l'intérêt légitime pour la prospection B2B. Chaque contact ajouté garde sa source, sa date et sa base légale.
- **Couverture** : le BODACC ne publie que les créations inscrites au RCS. Les artisans et libéraux en nom propre n'y sont pas ; Sirene les apportera en V2.

## Vérifier sur le serveur
- **Journal du worker** : `registry work` avec le type (veille, balayage, identité) et ses chiffres ; `registry work failed` en cas d'erreur.
- **Base de données** : `SELECT "workspaceId", "nextRunAt", "lastRunAt", "lastReport" FROM "SignalSweep";` puis `SELECT "campaignId", "active", "nextRunAt", "lastReport" FROM "CampaignWatch";`.
- **Journal d'audit** : `campaign.watch_saved`, `campaign.watch_run`, `lead.legal_override` et `lead.contact_added_from_registry`.
