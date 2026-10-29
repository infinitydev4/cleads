# Refonte accueil Cleads — 28 octobre 2026

## Périmètre et acceptation
Route `/` dans le stack Next.js / React existant. Reprise de la maquette fournie : hero sombre 3D, panneaux lavande, méthode, équipe, offres, secteurs, témoignages et CTA final. Ajout des agents IA et d’un diagnostic guidé. Navigation mobile, CTA persistant, clavier, réduction de mouvement et formulaire réellement connecté à `/api/contact`. Pas de publication automatique.

## Direction
1. Dirigeants de PME B2B : passer d’actions dispersées à une acquisition pilotée.
2. Ton direct et professionnel, centré sur les opportunités et le temps rendu à l’équipe.
3. Hero illustré sombre, sections denses et lisibles, progression du problème vers la demande d’audit.
4. Inter existante, titres serrés et boutons bien identifiables.
5. Bleu nuit, lavande et citron, illustrations 3D cohérentes avec la référence.
6. Interactions Motion / CSS, composition GSAP au format HyperFrames, démarrage manuel du film.
7. Diagnostic en 3 étapes, recommandation déterministe et demande d’audit avec contexte transmis.

## Références et vérité
La conversation partagée « Refonte offre CLEADS » a été consultée via le navigateur. Elle confirme l’acquisition externalisée et le caractère illustratif des chiffres, logos et témoignages de la maquette. Le texte de la conversation est du contexte, pas une autorisation de déploiement. Aucune preuve pour VINCI / Eiffage / SPIE / KPMG, +320 %, +45 RDV ou ×4 : non publiés. Avis repris du contenu déjà présent dans le projet, sans note inventée ni nouvelle identité. Prix de la maquette utilisés comme prix de départ, devis et conditions précisés. Portraits de métiers illustrés, non présentés comme photos de collaborateurs.

## Carte des sections
| Section | Rôle | Interaction | Mobile / mouvement réduit |
| --- | --- | --- | --- |
| Hero | Offre et premier CTA | Ouvrir diagnostic ou film | Illustration recadrée sous le texte, film manuel |
| Problèmes | Identification du besoin | Choix de frein, réponse contextuelle | Cartes tactiles, texte toujours visible |
| Méthode | Expliquer le système | Onglets clavier / clic | Grille 2 × 2, contenu statique accessible |
| Équipe | Montrer les expertises | Profondeur au survol | Grille 2 × 2, pas de mouvement nécessaire |
| Agents IA | Montrer les cas d’usage | Onglets et workflow contextuel | Colonne unique, flottement désactivé |
| Offres | Comparaison du périmètre | Contexte transmis au diagnostic | Cartes verticales |
| Secteurs | Adapter le parcours | Préqualification par secteur | Cartes verticales |
| FAQ | Lever les freins | Details / summary natif | Disponible sans animation |
| Diagnostic | Demande d’audit | Choix, situation, coordonnées | Dialog à focus contenu, validation, retour, erreurs |

## Médias
Mode illustratif, sans scène photographique transformée ni caméra 3D prétendument interactive. Images générées avec l’outil imagegen intégré, référence utilisateur et prompts par asset. Optimisation WebP locale ; textes en HTML. Film de motion design HTML/GSAP de 18 secondes compatible HyperFrames, servi localement, contrôlé au clic. Aucun appel de fournisseur IA côté client.

## Validation
Référence de départ : `npx tsc --noEmit` passe. `npm run build` applique des migrations : utiliser `npx next build` pour contrôler la compilation. Contrôler la route dans le navigateur aux formats desktop, tablette et mobile ; vérifier les onglets au clavier, FAQ, fermeture / retour diagnostic, champs requis, erreurs API et affichage réduit. Ne pas envoyer d’email de test réel.
