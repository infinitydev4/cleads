# Vue 3D isométrique « QG » (E16, E26)

Page : `/app/3d`, ouverte par le sélecteur **2D / 3D** de la barre du haut (ou la palette ⌘K : « Vue 3D du CRM »). « 2D » ramène à la dernière page 2D de l'onglet. La vue 2D n'a pas changé : la 3D est une seconde façon de regarder le même CRM, avec les mêmes chiffres et les mêmes droits.

## Ce qu'on y voit

Une plateforme isométrique ivoire : le bâtiment Cleads au centre, huit espaces autour, un par module, reliés par des circuits néon lime où courent des impulsions de lumière. Sur sa face gauche, l'aile « Agence IA » (E26) ajoute deux espaces sur un plancher de verre marine : la salle de contrôle des agents et l'atelier du Studio Web.

| Touche | Espace | Ce qu'il montre (chiffres réels) | Module 2D |
|---|---|---|---|
| 1 | Scraping / Sources | recherches Extractor (en cours, trouvées, importées), état de l'Extractor, imports, origine des prospects | `/app/search` |
| 2 | Qualification | fiches qui ont répondu (en premier) ou contactées, qualifiées et non qualifiées sur la période | `/app/leads?status=REPLIED` |
| 3 | Coordination | ma file du jour (retards, tâches, RDV, à clôturer), charge de l'équipe pour les managers | `/app` |
| 4 | Prospection multicanale | emails du jour et de la semaine, réponses, non lues, appels, séquences, boîtes et quotas ; LinkedIn et WhatsApp marqués « bientôt » | `/app/mailbox` |
| 5 | Pipeline CRM | opportunités par étape, montants renseignés seulement, opportunités ouvertes | `/app/pipeline` |
| 6 | Analytics | parcours d'acquisition sur la période et la précédente, conversion, prospects par semaine, campagnes | `/app/campaigns` |
| 7 | RDV & Planning | rendez-vous du jour, de la semaine, résultats à saisir | `/app/meetings` |
| 8 | Campagnes | campagnes et leurs résultats | `/app/campaigns` |
| 9 | Agents IA | les agents à leur poste et ce qu'ils font, la file « À valider », les dernières exécutions, la dépense du mois | `/app/agents` |
| 0 | Studio Web | les dernières maquettes (leur vraie capture), celles en cours, les briefs à relire, les visites | `/app/studio` |

Certains objets de la scène sont dessinés à partir des données : le tableau kanban compte les opportunités par étape, le planning allume un créneau par rendez-vous des 7 jours, les écrans d'analyse tracent les prospects par semaine, les baies serveurs clignotent pendant une recherche, le cadran de qualification donne le score moyen des derniers prospects, les points lumineux sur le chemin sont plus nombreux quand la semaine a vu plus d'emails, les tuiles de canaux s'allument quand le canal est actif. Dans l'aile IA, chaque androïde prend la lumière de son état, le noyau du copilote tourne plus vite quand des agents travaillent, des paquets de données vont des postes au travail vers le noyau, les avenues du circuit s'éclairent avec eux, et le mur du Studio montre les dernières maquettes.

**HUD** (identique à la maquette) : quatre indicateurs (prospects générés, RDV pris, taux de conversion, campagnes actives) avec leur tendance, le parcours d'acquisition, les performances des campagnes, les derniers prospects, la période (7, 30 ou 90 jours), l'heure, l'ambiance.

## Interactions

- **Cliquer un espace** (ou son étiquette, ou une étape du parcours) : la caméra s'en approche, des crochets lime l'entourent, une barre « Qualification 2/8 · ← → · Échap Quitter » apparaît, le panneau de droite montre ses chiffres et ses listes.
- **Cliquer une fiche** dans une liste : carte du prospect (statut, score, coordonnées, prochaine action) avec **Planifier le RDV**, **Contacter**, **Fiche complète** (le panneau latéral habituel : qualifier, appeler, tâches…) et **Ouvrir en 2D**. Ce sont les dialogues du CRM, avec les mêmes contrôles côté serveur.
- **Tout se fait dans la 3D** : chaque action qui mène à une page du CRM l'ouvre dans une **fenêtre** au-dessus de la scène, sans quitter la vue (voir « Fenêtres » plus bas). C'est le cas de **Nouvelle recherche**, **Importer un CSV**, **Nouvelle campagne** (le formulaire s'ouvre directement), des recherches passées, des campagnes, de « Ouvrir le pipeline / l'agenda / les emails / les fiches à qualifier / Aujourd'hui », des **Séquences**, de « Voir tout » et « Voir ses fiches ». C'est aussi le cas des liens de la barre du haut, du logo, de la palette ⌘K et de « Ouvrir en pleine page » dans une fiche. Seuls **2D** et **Ouvrir en 2D** quittent la vue.
- **Cliquer un agent** (E26) : son panneau donne sa mission, son modèle, ce qu'il fait et sur quelle fiche, ses chiffres du jour et ses dernières exécutions (avec leurs étapes). Au survol, son nom et son état s'affichent au-dessus de lui. Le **noyau** au centre de la salle de contrôle est le copilote : un clic l'ouvre. Un **cadre de la galerie** du Studio ouvre sa maquette dans une fenêtre.
- **Cliquer une personne** : membre de l'équipe (rôle, statut « en rendez-vous » ou « connecté aujourd'hui », charge de travail pour les managers). Chacun **choisit son personnage** dans son propre panneau ; sans choix, un personnage est attribué à partir du rôle, toujours le même pour la même personne. Les personnages sans membre (un par espace vide) représentent le module : les cliquer ouvre l'espace.
- **Caméra** : glisser pour se déplacer, clic droit ou deux doigts pour tourner, molette ou pincement pour zoomer ; boutons + − ⟲ ⟳ et « vue d'ensemble ».
- **Visite guidée** : un espace toutes les 7 secondes, jusqu'à Échap ou un clic.
- **Clavier** : 1 à 9 puis 0, ← →, Échap (revient d'une fiche ou d'un agent à l'espace, puis à la vue d'ensemble, puis au cadrage de départ), Début (vue d'ensemble), + −. Avant E26, 0 ramenait à la vue d'ensemble ; c'est désormais le Studio Web. Les étiquettes des espaces sont de vrais boutons (Tab, Entrée) ; un message vocal annonce l'espace cadré.

## Fenêtres

Une fenêtre affiche la page 2D elle-même (formulaire de recherche, import, kanban du pipeline, agenda, campagne, fiche…), chargée dans un cadre et sans la coque du CRM (ni barre latérale, ni barre du haut). Chaque module fonctionne donc en 3D exactement comme en 2D, avec ses règles et ses droits côté serveur, sans rien écrire deux fois.

- **Adresse** : la fenêtre ouverte fait partie de l'adresse (`/app/3d?w=/app/pipeline`). Le bouton Précédent la ferme, un rechargement la rouvre, et une navigation à l'intérieur (une carte du pipeline vers la fiche) met à jour le titre et l'adresse.
- **Fermer** : bouton ×, Échap (le premier Échap ferme d'abord le dialogue ou le menu ouvert dans la page), Précédent. À la fermeture, les chiffres de la scène sont rechargés : ce qui a été fait dans la fenêtre s'y voit aussitôt.
- **Pendant ce temps** : la scène se repose (une image seulement quand quelque chose change), ses raccourcis et son HUD sont hors d'atteinte du clavier et des lecteurs d'écran. Un lien cliqué dans un dialogue ou un panneau de la vue 3D le ferme d'abord.
- **Garde-fous** : seules les pages du CRM de ce site s'ouvrent dans une fenêtre (`windowPath`, testé : ni autre site, ni `//hôte`, ni `javascript:`, ni la vue 3D dans elle-même). Le clic du milieu ou ⌘-clic ouvre toujours la page 2D dans un nouvel onglet.
- **Fichiers** : `lib/crm/hq-window.ts` (adresse, ouverture, fermeture), `components/crm/hq/hud/module-window.tsx` (la fenêtre, et l'interception des liens de la vue), `components/crm/shell/embed-bridge.tsx` (dans la page, signale l'adresse, le titre et Échap). La coque sait qu'elle est dans une fenêtre par l'en-tête `Sec-Fetch-Dest: iframe` (premier affichage sans clignotement), puis par le cadre lui-même.

## Jour et nuit

Mode **Auto** par défaut : l'éclairage suit l'heure de l'appareil, avec aube et crépuscule, selon la saison (modèle simple du soleil vers 46° N, `features/hq/ambience.ts`, testé). **Jour** et **Nuit** désactivent la synchronisation. Le choix est mémorisé dans le navigateur (`localStorage`). La nuit, le ciel passe au bleu marine, les circuits, les néons du mobilier et les écrans brillent davantage, et l'éclairage de nuit s'allume : une vraie lumière par lampadaire (lime et chaude en alternance) avec sa flaque au sol, une lumière chaude dans le salon du bâtiment, les bandeaux du plafond. Ces lumières restent montées de jour à intensité nulle : passer à la nuit ne recompile aucun shader. En rendu léger, seules les flaques (sans coût) restent.

## Droits

La vue suit la matrice (`lib/rbac.ts`) : chaque chiffre est calculé sur les fiches que la personne voit (`lead:read`), les emails selon la règle du journal d'envoi, les rendez-vous selon `meeting:read`. Un espace dont le module est fermé au rôle reste visible mais **verrouillé** : son panneau dit pourquoi (par exemple Scraping / Sources pour un closer ou un lecteur). La charge de travail des collègues n'est montrée qu'à ceux qui voient toute l'équipe. L'aile IA suit les règles de ses pages 2D : Agents IA demande `ai:use`, et ses exécutions et validations sont celles de toute l'équipe pour le propriétaire et les managers, les siennes pour les autres ; le Studio Web demande `studio:generate` et ne montre que les maquettes des fiches visibles.

## Architecture

```
features/hq/            zones.ts (les 10 espaces : une liste), characters.ts, ambience.ts, service.ts (chiffres), types.ts,
                        agency.ts (postes et états des agents, badges), agency-service.ts (pouls de l'agence, détail des espaces IA)
features/metrics/       definitions.ts (chaque indicateur et sa définition), service.ts (calculs, portée par rôle)
app/api/hq/             GET /api/hq?days=30 · GET /api/hq/zones/:zone · PUT /api/hq/character · GET /api/hq/agency
app/(crm)/app/3d/       la page (données rendues côté serveur au premier affichage)
components/crm/hq/
  hq-view.tsx           magasin d'état, rafraîchissement (60 s, onglet visible), raccourcis, visite, chargement différé
  store.ts              état partagé scène / HUD (useSyncExternalStore, sans bibliothèque)
  hud/                  indicateurs, parcours, campagnes, panneau de détail, contrôles, étiquettes DOM, fenêtres,
                        agency-panel.tsx (panneaux de l'aile IA, pastille), panel-kit.tsx (pièces communes des panneaux)
  scene/                React Three Fiber : layout.ts, materials.ts, kit.tsx, textures.ts, zones.tsx, world.tsx,
                        characters.tsx, props.tsx, circuits.tsx, effects.tsx, labels.tsx, camera-rig.tsx, hq-canvas.tsx,
                        agency.tsx (salle de contrôle, atelier, totem, plancher), android.tsx (les agents)
public/3d/characters/   4 personnages GLB (≈ 550 Ko chacun) et l'androïde des agents (≈ 670 Ko)
public/3d/props/        9 objets Meshy GLB (105 à 175 Ko chacun) ; leurs mesures dans scene/props.json
scripts/                build-characters.mjs, build-props.mjs
```

- **Bibliothèques** : `three` 0.186.1, `@react-three/fiber` 9.8.2, `@react-three/drei` 10.7.9, `@react-three/postprocessing` 3.2.2 et `postprocessing` 6.39.5 (versions figées). GSAP n'est pas utilisé ici : les transitions de caméra viennent de camera-controls (via drei). Hyperframes sert aux films de la landing, pas à une interface interactive.
- **Chargement** : le code 3D est un morceau séparé (`next/dynamic`, sans rendu serveur) ; la vue 2D ne le télécharge jamais. Le HUD s'affiche tout de suite avec les données du serveur ; la scène arrive ensuite.
- **Sans WebGL** (ou si la scène plante) : le HUD reste utilisable et un message propose la vue 2D.
- **Ajouter un espace** : une entrée dans `features/hq/zones.ts`, une composition dans `scene/zones.tsx`, un cas dans `getZone`. Un espace hors de la grille (comme l'aile IA) déclare aussi sa porte dans `doorOf` (`scene/layout.ts`), d'où part son avenue du circuit.
- **En direct (aile IA)** : le pouls de l'agence (`GET /api/hq/agency`) est relu à chaque événement `ai-run` du canal privé de la personne (`components/crm/ai/run-events.ts`, commun à Agents IA et au copilote), et toutes les 8 s tant qu'un agent travaille, que quelque chose attend ou qu'un espace IA est ouvert, onglet visible. Les badges des deux espaces en découlent sans attendre le rafraîchissement de la minute.

## Rendu

- **Lumière** : un soleil (ou la lune) avec ombres douces (PCSS), un ciel en dégradé avec un brouillard de la même couleur, et un studio rendu une seule fois dans une petite cube map (des panneaux lumineux de drei : aucun fichier HDR à télécharger) pour les reflets.
- **Matériaux** : ivoire chaud plutôt que blanc pur (#fbf8f1, avec une légère granulation de rugosité), céramique laquée pour le mobilier en code, verre, marine, et le néon lime de la marque (#9dff2a) poussé au-dessus de 1 pour que le bloom le fasse rayonner. Sur les objets Meshy, quelques lignes ajoutées au shader lisent la couleur de la texture et rendent lumineuses les parties peintes en lime (bandeaux, anneaux, voyants), davantage la nuit.
- **Circuits** (`scene/circuits.tsx`) : une seule géométrie et un seul shader pour tous les tracés : un sillon ivoire, un cœur néon net, un halo qui s'estompe, des impulsions qui courent vers les espaces et, de temps en temps, un paquet plus brillant. Le néon est mélangé au sol plutôt qu'additionné : sur un sol ivoire, une lumière additionnée deviendrait blanche et invisible de jour. La sélection (contour animé et crochets) utilise le même shader.
- **Post-traitement** : occlusion ambiante (N8AO, demi-résolution, qualité « performance »), bloom seulement sur ce qui dépasse 1 (les néons), tone mapping Khronos PBR Neutral (les couleurs de la marque restent fidèles, là où AgX délavait l'ivoire), SMAA, léger vignettage.
- **Aile IA (E26)** :
  - **Plancher** : verre marine laqué ; une trame lime d'un mètre, en traits fins qui s'effacent quand ils deviennent plus denses que les pixels (vue de loin, une grille fine teinterait toute la surface) ; une flaque de lumière au centre ; un anneau qui part du centre tant que l'espace travaille.
  - **Lumières** : pas de lumière réelle de plus. Chaque lumière se paie sur chaque pixel éclairé de la scène : le lampadaire du coin de l'aile est celui de l'ancien coin, déplacé. Le noyau brille par le bloom.
  - **Holographie** : panneaux, toile, faisceau en matériaux sans éclairage.
- **Deux pièges rencontrés** (image entièrement noire) : une géométrie sans normales sous un matériau éclairé produit des NaN que le bloom étale à toute l'image (les bandes au sol ont donc des normales) ; `smoothstep` avec des bornes inversées n'est pas défini en GLSL (les shaders n'utilisent que des bornes croissantes).

## Performance

Géométries mises en cache par taille, matériaux partagés, arbres instanciés (un appel de dessin par partie du modèle), textures dessinées sur canvas et reconstruites seulement quand leurs chiffres changent. Étiquettes en DOM placées par une seule boucle (pas un rendu React par étiquette). Ombres d'une seule lumière. Avec `prefers-reduced-motion`, rien ne bouge seul et l'image n'est recalculée qu'en cas d'interaction.

**Rendu léger** (sans ombres, sans occlusion, résolution 1) : un garde mesure la fluidité seulement quand tous les modèles sont arrivés, puis après 5 secondes de calme, par fenêtres de 4 secondes ; deux fenêtres de suite sous 30 images par seconde le déclenchent, une seule fois. Les pauses (onglet masqué, image de plus de 0,5 s) et le temps passé sous une fenêtre ne comptent pas. Le bouton jauge permet de le forcer ou de l'enlever, et le choix fait à la main n'est plus contredit. Les shaders sont compilés dès l'arrivée des modèles (`compileAsync`, en parallèle quand le navigateur le permet), au lieu de saccader les premières images qui les montrent : c'est cette saccade qui, mesurée trop tôt, déclenchait le rendu léger à tort.

Mesuré dans le navigateur de développement (Apple M4, rendu complet, 1636 × 1069 px puis 2160 × 1266 px) : **60 images par seconde de jour comme de nuit**, pire image 18 à 21 ms.

**Après l'aile IA (E26)**, la mesure a comparé `main` et la branche dans les mêmes conditions : Chrome piloté (fenêtre réelle, Apple M4, ANGLE Metal), serveur de développement, rendu complet, 1600 × 960 px.

| | Image médiane | Images/s en moyenne |
|---|---|---|
| `main` | 16,7 ms | 47 à 49 |
| E26 | 16,7 ms | 45 à 46 |

- Les deux versions sautent la même part d'images dans ce harnais : la 3D n'a pas régressé.
- La vue d'ensemble passe de 369 à 508 appels de dessin, et de 1,5 à 1,9 million de triangles par image, ombres et post-traitement compris.
- Les 60 images/s n'ont pas été remesurées dans le navigateur de l'application. Ce qui coûtait : l'occlusion ambiante en qualité « medium » à une résolution de 1,75 faisait tomber l'image à 26 images par seconde ; en qualité « performance » avec une résolution plafonnée à 1,5, elle ne coûte plus que quelques millisecondes. Build de production : three.js, React Three Fiber et Drei tiennent dans un morceau chargé seulement par `/app/3d` (aucune page 2D ne le référence) ; personnages (2,2 Mo) et objets (1,3 Mo) ne se téléchargent qu'en 3D. Non mesuré : un portable d'entrée de gamme, une tablette.

## Personnages (Meshy)

Les quatre personnages viennent de l'illustration d'équipe de cleads.fr (`public/images/home/team.webp`) : community manager (blazer), closer / SDR (chemise et casque), développeur (sweat), chef de projet (costume). Chaîne : recadrage → image en pied en T-pose (`nano-banana-2`) → modèle 3D texturé remaillé à 15 000 triangles (Meshy 7.1) → squelette → animations « assis au bureau » et « discussion » (bibliothèque Meshy), marche offerte avec le squelette. **188 crédits** au total.

**Assis sur la chaise** : chaque clip pose les hanches à un endroit différent (certains personnages se retrouvaient à côté du siège). La scène mesure la position des hanches dans le clip joué (un mixeur jetable, une image de l'animation), décale le personnage pour mettre ses hanches au-dessus du centre du siège, et règle la hauteur de la chaise Meshy pour que l'assise arrive sous les hanches (dans une marge de quelques centimètres, au-delà le personnage est légèrement remonté ou descendu).

`scripts/build-characters.mjs` assemble et compresse chaque personnage : clip de marche ajouté sans avancer (le personnage marche sur place), noms de clips stables (`sit`, `sit_talk` ou `stand_talk`, `walk`), texture 1024 px en WebP, géométrie et animations compressées (EXT_meshopt_compression, décodées par three-stdlib, aucun CDN). De 4 Mo à 550 Ko par personnage.

| Personnage | image-to-image | image-to-3d | rig | animate |
|---|---|---|---|---|
| community | 01a1986f-30b8-759c-8682-239d7cca8898 | 01a19870-7ec0-70b4-b204-ed145917bcc2 | 01a19872-f6d7-7368-8b02-4bdbcf04ade3 | 01a19874-3993-731c-8703-6e07c4491a0a |
| closer | 01a1986f-33f3-7044-9c73-1b2f39f8b58a | 01a19870-821c-770a-9f69-794c5a87193e | 01a19873-01b3-7510-ba6b-ae27612d0f05 | 01a19874-991b-7097-b13d-05878645f6e1 |
| dev | 01a1986f-376e-724d-af14-9291f8948639 | 01a19870-84e6-70e2-bb0d-b538ab7b373a | 01a19873-10ab-77eb-8ff4-313df7fb788f | 01a19874-da15-729b-99bb-f739ea88479f |
| manager | 01a1986f-3bd1-7730-9f2b-b8a1ac60f50c | 01a19870-8789-7540-9c60-f7e57760110c | 01a19873-1d80-74a3-a032-fdb9d7e479ad | 01a19875-195a-7656-8ff8-75c2d843aa56 |

## Objets et mobilier (Meshy)

Arbres et plantes stylisés (d'après les deux images fournies : un arbre dans un bac carré blanc, une plante aux feuilles lime dans un pot blanc), et le mobilier Cleads, ivoire et lime avec néon : bureau, chaise, canapé, accueil, baie serveur, lampadaire, table de réunion (aussi utilisée à hauteur de table basse dans le salon). Chaîne : image de référence (`nano-banana-2`, fond neutre) → modèle texturé en **Smart Topology** (`meshy-t2.5`, 3 000 à 9 500 triangles). **183 crédits** au total (le canapé a demandé une seconde image : sur fond blanc, le détourage avait mangé l'assise).

`scripts/build-props.mjs` centre chaque objet sur son emprise, pose sa base au sol, mesure la hauteur d'assise de la chaise, réduit la texture à 1024 px en WebP et compresse la géométrie : environ 2 Mo → 105 à 175 Ko. La scène dimensionne chaque objet en mètres à partir de ces mesures (`scene/props.json`). Un objet absent ou qui ne charge pas est remplacé par sa version en code (formes simples, mêmes matériaux), qui reste la base des murs, plateaux, écrans et du bâtiment.

| Objet | image-to-image | image-to-3d |
|---|---|---|
| tree | (image fournie) | 01a198b9-7a7d-7106-8cf9-2819c44f50d9 |
| plant | (image fournie) | 01a198b9-7e9c-7542-af8a-86c1971cc228 |
| desk | 01a198b9-8348-744c-9d10-afb1586fb124 | 01a198bc-ba52-72e1-99af-cfb1b700af05 |
| chair | 01a198b9-87bb-70e8-9ac8-68b39adc8035 | 01a198bc-bd19-774a-bdf0-762aa17525d1 |
| sofa | 01a198bc-cf81-7433-9a30-f6c9a46ccbea | 01a198c5-2b9e-7570-aca2-afd7eaa1f750 |
| reception | 01a198b9-9056-754f-a526-829ccf10e72e | 01a198bc-c003-73a9-b9cb-ee1f98665c1e |
| rack | 01a198b9-947c-71f4-aeb7-8b5443ae77d4 | 01a198bc-c329-7029-94dc-fe931b322710 |
| lamp | 01a198b9-989c-74b5-b624-b96c8813e836 | 01a198bc-c78f-709b-9c6d-ffc0413427ec |
| table | 01a198b9-9ca9-74f6-8de3-34b687fcf58b | 01a198bc-cbe5-728a-98bb-ceb2e9867b7a |

Tripo n'a pas été nécessaire (Meshy était déjà connecté). Total Meshy du projet : 188 + 183 = **371 crédits** avant E26.

## Les agents (Meshy, E26)

Un androïde unique, réutilisé pour les sept agents qui ont un poste. Son apparence :
- coque céramique ivoire ;
- visière marine ;
- yeux et liserés lime, comme le mobilier.

**Chaîne**
1. Image de référence en T-pose (`nano-banana-2`), à partir de l'image du personnage « dev », pour garder les proportions et le style des humains.
2. Modèle Meshy 7.1 texturé, remaillé à 12 400 triangles.
3. Squelette.
4. Trois animations de la bibliothèque : *Chair Sit Idle* (repos), *Sitting Answering Questions* (travail) et *Sit Thumbs Up Right* (réussite). La marche est offerte avec le squelette.

**50 crédits**, pour un accord donné à 70 au plus. Total Meshy du projet : **421 crédits**.

**Construction**
- `scripts/build-characters.mjs` donne aux clips des noms stables : `sit`, `sit_talk`, `sit_done`, `walk`.
- Meshy peint les liserés d'un lime trop pâle, presque l'ivoire de la coque : le script les repeint dans le vert néon de la scène.
- Le shader des objets peut ainsi les allumer. Chaque androïde a son propre réglage : vif et battant au travail, lent en file, ambre quand une personne doit décider, éteint quand l'agent est désactivé.
- Un androïde en formes simples le remplace pendant le chargement, ou si le fichier manque.

| Étape | Tâche Meshy |
|---|---|
| image-to-image | 01a19e66-8249-7793-9744-dcf921c0ee4c |
| image-to-3d | 01a19e67-1bf7-7616-bf7b-85536f5c5a37 |
| rig | 01a19e68-9755-72f2-8e8d-36f3a8cefcce |
| animate (actions 33, 307, 357) | 01a19e6b-b487-72a1-8c10-91029d909823 |

## Vérifié

- `tests/hq.test.ts` : jour / nuit (saisons, aube, modes forcés), les huit espaces (touches, positions, bureaux sur leur plateau, chemins), répartition de l'équipe par rôle, personnages, indicateurs (pas de taux inventé, formats français).
- `tests/hq.integration.test.ts` (base jetable) : indicateurs et tendance, portée par rôle, espaces verrouillés, répartition et charge de l'équipe, statut « en rendez-vous », ordre de la qualification, choix du personnage.
- Dans le navigateur (base jetable, équipe et données fictives) : vue d'ensemble, zoom sur un espace, panneau et listes, clic sur un membre, choix du personnage, carte prospect, dialogue « Planifier le RDV » (annulé, rien envoyé), jour / nuit, pages 2D (Aujourd'hui, Prospects, Campagnes) inchangées.
- Dans le navigateur, après la passe de rendu : personnages assis dans leur chaise (Coordination, accueil RDV, bureaux), logos du bâtiment sans fond et détachés du mur, salon et canapés, sélection et circuits lime de jour comme de nuit, lampadaires et flaques de lumière la nuit, 60 images par seconde en rendu complet.
- Fenêtres, dans le navigateur : les huit espaces et leurs liens. Les vérifications :
  - Nouvelle recherche, Importer un CSV et Nouvelle campagne (formulaire ouvert, le premier Échap ne ferme que lui) ;
  - le pipeline, puis une carte et sa fiche en pleine page (titre et adresse suivent) ;
  - la barre du haut, qui remplace la fenêtre ouverte, et la palette ⌘K ;
  - le logo, « Voir tout » et « Voir toutes » ;
  - « Ouvrir en pleine page » depuis la fiche de la vue 3D (le panneau se ferme d'abord) ;
  - Précédent, un rechargement avec `?w=`, et « Ouvrir en 2D », qui quitte vers la page 2D.
- La vue 2D reste inchangée.
- **Aile IA (E26)** :
  - `tests/hq.test.ts` : dix espaces et leurs touches, plateaux et portes dans la plateforme agrandie, avenues entre les plateaux, postes face au noyau et jamais entre lui et la caméra, états et badges des agents ;
  - `tests/hq.integration.test.ts` : portée par rôle (un SDR ne voit que ses exécutions), validations, agent désactivé, worker hors ligne, maquettes des seules fiches visibles, une génération échouée qui ne compte pas en cours, espaces verrouillés pour un lecteur ;
  - dans Chrome sur la base de démonstration :
    - survol et clic du noyau (le copilote s'ouvre) et d'un androïde ;
    - approbation depuis le panneau ;
    - cadre de la galerie ouvert en fenêtre ;
    - Échap jusqu'au cadrage de départ, Début, 9 et 0 ;
    - pastille « Agence IA » ;
    - téléphone (390 px), mouvement réduit, jour et nuit ;
    - aucune erreur dans la console.
- **Pas encore vérifié** : un vrai téléphone (le HUD passe en panneau bas sous 640 px), un lecteur d'écran réel, un poste peu puissant.

## Écarts assumés

- Pas de redirection automatique vers la 3D au démarrage : le sélecteur mémorise la dernière page 2D, pas une préférence globale (une redirection renverrait en 3D quelqu'un qui clique « Aujourd'hui »).
- Personnages des espaces vides : ils représentent le module, pas une personne (aucun nom, le clic ouvre l'espace).
- Aucune marche animée en V1 : le clip existe dans les fichiers, prêt pour des déplacements entre espaces.
- Un seul modèle d'androïde pour tous les agents : chacun se distingue par son poste, son pictogramme et la lumière de son état. Le copilote n'a pas d'androïde : il est le noyau.
- Agents IA demande `ai:use` (le droit de sa page 2D), et non `ai:read` comme le disait la spécification ([AGENTS-IA.md](AGENTS-IA.md)).
