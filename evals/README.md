# Jeux d'évaluation des agents IA (E27)

Ces jeux mesurent les agents sur des cas connus, avant tout changement de modèle ou de consigne importante. Les évaluations se lancent dans **Agents IA › Qualité** ; le code qui les rejoue est dans `features/quality/`, la description d'ensemble dans [docs/crm-v1/AGENTS-IA.md](../docs/crm-v1/AGENTS-IA.md) §20.

| Fichier | Agent | Contenu |
|---|---|---|
| `sites.ts`, `site-kit.ts` | Auditeur digital | 30 sites figés : pages HTML, PageSpeed, fiche Google, signaux attendus et interdits |
| `audits.ts` | Conseiller offres, Rédacteur outreach | 10 audits de référence, offres principales acceptables et offres exclues |
| `replies.ts` | Analyste réponses | 80 réponses étiquetées : classe, urgence, action, et le piège quand il y en a un |
| `fiches.ts` | Analyste qualification | 45 fiches jugées pour trois campagnes bâties sur les offres V1 |
| `briefs.ts` | Designer web | 3 briefs validés |
| `copilot.ts` | Copilote | une agence fictive figée au jeudi 12 novembre 2026 (équipe, 28 fiches, campagnes, tâches, rendez-vous, réponses, recherches, base de l'Extractor) et 45 demandes de son équipe, avec ce que le copilote doit faire, ne pas faire et dire |

## Règles

- **Tout est fictif.** Domaines `.example`, numéros de la plage `01 99 00 xx xx` que l'ARCEP réserve à la fiction, adresses `@exemple.test`. Aucun cas ne reprend une entreprise réelle, ni la fiche d'un prospect du CRM.
- **Rien ne sort sur le réseau.** Les sites figés sont servis par `features/quality/frozen.ts` ; une page absente répond 404, un site « injoignable » lève une erreur de réseau. La date des constats est fixée (`EVAL_NOW`), pour qu'un copyright « vieux de trois ans » le reste.
- **Un site dit ce qu'il teste.** Son champ `about` le résume ; `expect.signals` liste ce qu'un audit juste doit lever, `expect.absent` ce qu'il ne doit pas affirmer. On n'y met que des cas tranchés.
- **Le copilote ne touche à rien.** Il lit ce monde par ses vraies actions ; ce qu'il écrit est enregistré, jamais fait (`features/quality/cases/copilot-world.ts`). Ses identifiants sont opaques, comme ceux du CRM : il doit les lire, pas les deviner.
- **Les attentes sont vérifiées.** `tests/quality.test.ts` passe chaque site figé dans les vraies règles de l'audit, avec une lecture parfaite (`read`) : un site qui contredit ses attentes fait échouer la suite. Les audits de référence doivent valider le schéma du rapport, et leurs offres attendues être des candidates du catalogue. `tests/copilot-eval.test.ts` vérifie que chaque demande du copilote ne cite que des fiches et des actions qui existent, que ses réponses attendues sont bien dans les données, et que les plans d'un bon copilote passent les contrôles.

## Ajouter ou modifier un cas

1. Écrire le cas dans le fichier de sa suite, avec un identifiant nouveau, et l'ajouter à l'échantillon rapide de `features/quality/suites.ts` s'il couvre un piège.
2. Lancer `npx vitest run tests/quality.test.ts tests/copilot-eval.test.ts`.
3. Tout changement d'un jeu change sa **version** (une empreinte de son contenu). Les évaluations faites sur l'ancienne version restent lisibles, mais ne valent plus comme preuve pour changer de modèle : il faut évaluer à nouveau.

Les réponses classées et les fiches tranchées par l'équipe dans le CRM forment un second jeu, qui grandit avec l'usage (objectif : 200 à 500 réponses). Il n'est pas versionné ici : chaque évaluation fige la liste de ses cas au lancement.
