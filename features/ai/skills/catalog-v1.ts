import { OFFERS_SKILL } from "@/features/offers/skill"

/**
 * The V1 skills (docs/crm-v1/AGENTS-IA.md §8), written for the team to read, correct and extend in Agents IA. They are
 * installed once per workspace (features/ai/catalog.ts); the agents they go to are listed in features/ai/agents.ts.
 * "offres-cleads" has no text of its own: it is written from the active offers each time an agent uses it.
 */
export interface SkillSeed {
  name: string
  description: string
  content: string
  generator?: "offers"
}

export const GENERATED_SKILL_NOTE = "Contenu écrit à partir des offres actives du catalogue, à chaque utilisation : modifiez les offres, pas ce texte."

export const SKILLS_V1: readonly SkillSeed[] = [
  {
    name: "audit-seo-local",
    description: "À utiliser pour évaluer la visibilité locale d'une entreprise : fiche Google, avis, cohérence nom-adresse-téléphone, pages locales et données structurées LocalBusiness.",
    content: `# Audit SEO local

Objectif : savoir si l'entreprise apparaît quand un client cherche son métier dans sa zone, et ce qui l'en empêche.

## 1. Fiche Google
- La fiche existe-t-elle, affiche-t-elle le site et le téléphone ?
- Catégorie principale exacte (le métier, pas une catégorie voisine) et catégories secondaires utiles.
- Horaires renseignés, photos récentes (moins de 6 mois), description, services.
- Avis : nombre, note moyenne, date du dernier avis, réponses du professionnel. Repères : moins de 20 avis ou une note sous 4 est un signal faible ; aucun avis depuis 3 mois, une fiche qui s'endort.

## 2. Cohérence nom-adresse-téléphone
Compare le nom, l'adresse et le téléphone du site, de la fiche Google et de l'Extractor. Une différence (ancien numéro, ancienne adresse, nom commercial différent) est un constat : cite les deux valeurs et leur source.

## 3. Pages locales
- Le site cite-t-il la ville et la zone d'intervention dans ses titres et ses textes ?
- Y a-t-il une page par service important et, si l'entreprise couvre plusieurs villes, des pages locales utiles (pas des copies) ?

## 4. Données structurées
Cherche un JSON-LD LocalBusiness (ou un sous-type : Plumber, Restaurant, Dentist…) avec nom, adresse, téléphone, horaires et zone desservie.

## Signaux à lever
\`gbp_incomplete\`, \`few_reviews\`, \`low_rating\`, \`nap_inconsistent\`, \`no_localbusiness_schema\`, chacun avec sa preuve (valeur relevée et source).

## À ne pas faire
- Ne conclus pas sur le classement d'une entreprise sans mesure : dis ce qu'il faudrait vérifier.
- Ne recopie pas le texte des avis : résume leur tonalité sans nommer leurs auteurs.`,
  },
  {
    name: "audit-geo-site",
    description: "À utiliser pour évaluer ce qu'un moteur de réponse IA comprend d'une entreprise à partir de son site : entité claire, FAQ, données structurées, llms.txt et accès des robots IA.",
    content: `# Audit GEO du site

Objectif : un assistant IA (ChatGPT, Gemini, Perplexity, les réponses IA de Google) doit pouvoir dire sans hésiter qui est l'entreprise, ce qu'elle fait, où et pour qui, à partir de ce que le site expose. On n'interroge pas les assistants : on juge le site.

## 1. Entité claire
- Le nom, le métier, la zone et le type de clients sont-ils écrits en texte (pas seulement dans une image) sur l'accueil et la page de présentation ?
- Les services sont-ils nommés avec les mots des clients ?
- Signal \`unclear_entity\` si un lecteur pressé ne peut pas répondre à ces quatre questions en dix secondes.

## 2. Données structurées
- JSON-LD Organization ou LocalBusiness, Service, FAQPage, Product : relève les types présents et les champs importants qui manquent.
- Signal \`no_structured_data\` si aucun balisage utile.

## 3. Questions et réponses
- Une FAQ répond-elle aux vraies questions des clients (prix, délais, zone, garanties, démarches) ?
- Signal \`no_faq\` si aucune.

## 4. Accès des robots IA
- \`robots.txt\` : relève les règles pour GPTBot, Google-Extended, ClaudeBot, PerplexityBot et CCBot. Un blocage n'est pas une faute en soi : présente-le comme un choix à confirmer avec l'entreprise.
- \`llms.txt\` à la racine : présent ou non. C'est un bonus, pas une obligation.

## Restitution
Pour chaque point : le constat, sa preuve (URL et court extrait), l'effet probable sur la façon dont une IA présente l'entreprise, l'action proposée. Ne promets aucune place dans les réponses des assistants.`,
  },
  {
    name: "audit-ux-conversion",
    description: "À utiliser pour juger si un site transforme ses visites en demandes : promesse, preuves, appels à l'action, freins, signes d'un site daté et parcours mobile.",
    content: `# Audit UX et conversion

Regarde la page d'accueil et la page de contact, sur mobile d'abord (390 px de large), puis sur ordinateur.

## 1. Promesse (premier écran)
- En cinq secondes, comprend-on ce que fait l'entreprise, pour qui et où ?
- Le titre parle-t-il du client et de son bénéfice, plutôt que de l'entreprise (« Bienvenue sur notre site ») ?

## 2. Preuves
- Avis réels, réalisations, photos de l'équipe ou des chantiers, labels et certifications vérifiables, années d'expérience.
- Une preuve sans source vérifiable ne compte pas.

## 3. Appels à l'action
- Un bouton principal visible sans défiler (appeler, demander un devis, prendre rendez-vous) ; numéro de téléphone cliquable sur mobile.
- Signal \`weak_cta\` s'il faut chercher comment contacter l'entreprise ; \`no_booking\` si la prise de rendez-vous en ligne est naturelle dans ce métier et qu'elle manque.

## 4. Freins
Formulaire trop long, captcha pénible, fenêtre surgissante à l'ouverture, texte illisible sur mobile, éléments qui bougent, liens cassés, mentions légales absentes.

## 5. Signes d'un site daté
Design d'une autre époque, contenus non mis à jour (année de copyright ancienne, actualités vieilles de plusieurs années), images floues ou déformées, site non adapté au mobile. Signal \`site_outdated\` avec deux preuves au moins.

## Restitution
Trois freins au plus, classés par effet sur les demandes, chacun avec sa capture ou son URL et une correction concrète.`,
  },
  {
    name: "presence-sociale",
    description: "À utiliser pour évaluer la présence d'une entreprise sur les réseaux sociaux : réseaux attendus pour son secteur, activité récente, liens depuis le site.",
    content: `# Présence sur les réseaux sociaux

## 1. Réseaux attendus selon le secteur
- Métiers visuels (restaurants, beauté, décoration, artisans d'art, architectes, paysagistes) : Instagram d'abord, Facebook, Pinterest pour la décoration.
- Artisans du bâtiment et services à domicile : Facebook (groupes locaux), Instagram pour les réalisations.
- Professions libérales, B2B, conseil : LinkedIn (page de l'entreprise et profil du dirigeant).
- Commerces de proximité : Facebook, Instagram, publications de la fiche Google.

## 2. Ce que l'on relève
- Les liens présents sur le site (pied de page, contact) et les réseaux connus de l'Extractor.
- Pour chaque réseau trouvé : le lien répond-il ? La date de la dernière publication, si elle est visible sans compte.
- On ne lit pas les profils en détail, on ne crée pas de compte et on ne contourne aucune connexion.

## 3. Signaux
- \`no_social\` : aucun réseau trouvé alors que le secteur en attend.
- \`inactive_social\` : dernière publication visible de plus de 3 mois.
- \`visual_sector\` : le métier se vend en images.

## Restitution
Une ligne par réseau attendu : trouvé ou non, actif ou non, avec le lien. Aucun jugement sur le contenu des publications.`,
  },
  {
    name: "preparation-ads",
    description: "À utiliser pour savoir si une entreprise est prête pour la publicité en ligne (Google Ads, Meta Ads) : balises de suivi, page d'atterrissage, intention de recherche du secteur.",
    content: `# Préparation à la publicité en ligne

## 1. Balises présentes sur le site
- Google : Google Ads (\`AW-…\`, conversions gtag), Google Analytics 4 (\`G-…\`), Google Tag Manager (\`GTM-…\`).
- Meta : pixel (\`fbq('init', …)\` ou \`connect.facebook.net\`).
- Relève ce qui est présent, identifiant tronqué ; n'en déduis aucun budget dépensé.

## 2. Intention du secteur
- Forte intention, urgence ou devis (plombier, serrurier, chauffagiste, électricien, dépannage, avocat, déménagement) : Google Ads pertinent. Signal \`no_google_ads_high_intent\` si aucune balise Google Ads.
- Secteurs visuels et d'envie (restaurant, beauté, décoration, mariage, tourisme) : Meta Ads pertinent. Signal \`no_meta_pixel_visual\` si aucun pixel.

## 3. Page d'atterrissage
Une campagne mesurable a besoin d'une page dédiée, avec un seul appel à l'action et le suivi des conversions. Signal \`ads_without_landing\` si des balises publicitaires existent mais que les annonces ne peuvent atterrir que sur l'accueil.

## Restitution
Ce qui manque pour lancer une campagne mesurable, dans l'ordre : suivi, page, campagne. Aucune estimation de coût par clic sans source.`,
  },
  {
    name: OFFERS_SKILL.name,
    description: OFFERS_SKILL.description,
    content: GENERATED_SKILL_NOTE,
    generator: OFFERS_SKILL.generator,
  },
  {
    name: "cold-email-fr",
    description: "À utiliser pour écrire ou relire un email de prospection B2B en français : longueur, personnalisation, demande unique, ton, règles à respecter et interdits.",
    content: `# Cold email B2B en français

## Structure (60 à 120 mots)
1. Objet : moins de 50 caractères, concret, sans majuscules abusives, sans « Re: » ni « Urgent ».
2. Accroche : une observation précise et vérifiée sur l'entreprise, tirée de l'audit (la mesure, la page, la fiche Google). Jamais « J'ai vu votre super site ».
3. Enjeu : ce que cette observation fait perdre au prospect, en une phrase.
4. Proposition : ce que nous faisons, en une phrase, sans liste de services.
5. Demande unique : un échange de 15 minutes, avec une question simple (« Seriez-vous disponible jeudi ou vendredi ? »).
6. Signature : prénom, nom, société. Le CRM ajoute le pied de page légal et le lien de désinscription : ne les écris pas.

## Ton
- Vouvoiement, phrases courtes, aucun jargon (« growth hacking », « synergie »).
- Aucune promesse chiffrée (« +200 % de clients »), aucune fausse urgence, aucun faux compliment.
- Pas de pièce jointe ni de lien raccourci ; un seul lien au plus.

## Règles de la prospection B2B
- L'email s'adresse à un professionnel et parle de son activité professionnelle.
- L'expéditeur est clairement identifié ; l'objet n'est pas trompeur.
- La personne peut refuser simplement : le lien de désinscription ajouté par le CRM suffit, ne le retire jamais.
- N'utilise que les données de la fiche ; ne devine jamais une adresse email.

## Relecture
Avant de rendre le brouillon : chaque fait cité figure-t-il dans l'audit ? Le message tient-il sur un écran de téléphone ? Y a-t-il une seule demande ?`,
  },
  {
    name: "script-appel-15min",
    description: "À utiliser pour préparer l'appel de 15 minutes d'un closer avec un prospect audité : accroche sur l'audit, questions de découverte, proposition, objections, prochaine étape.",
    content: `# Script d'appel de 15 minutes

Le but de l'appel n'est pas de vendre : c'est d'obtenir, avec l'accord du prospect, un rendez-vous de présentation ou l'envoi d'une proposition.

## Déroulé
1. Ouverture (1 min) : se présenter, rappeler le contexte (« Je vous ai écrit à propos de votre fiche Google »), demander si c'est un bon moment.
2. Accroche sur l'audit (2 min) : un constat précis, avec sa preuve, posé comme une question (« Saviez-vous que votre site met 8 secondes à s'afficher sur mobile ? »).
3. Découverte (5 min) : trois questions ouvertes au plus.
   - D'où viennent vos clients aujourd'hui ?
   - Qu'avez-vous déjà essayé, et qu'est-ce qui a marché ?
   - Si vous aviez plus de demandes, pourriez-vous les traiter ?
4. Proposition (3 min) : une offre, reliée à ce que le prospect vient de dire, avec le bénéfice concret, et la fourchette de prix si elle est demandée.
5. Objections (2 min) : écouter, reformuler, répondre avec une preuve ; ne jamais contredire de front.
6. Conclusion (2 min) : une prochaine étape datée (rendez-vous, maquette à montrer, proposition écrite) et un récapitulatif.

## Préparation à rendre
- L'accroche : un constat et sa preuve.
- Les trois questions, adaptées au métier.
- L'offre principale et une offre d'entrée moins chère.
- Les deux objections les plus probables et leurs réponses.
- La prochaine étape proposée.

## Interdits
Aucune pression (« offre valable aujourd'hui seulement »), aucun dénigrement du prestataire actuel, aucun résultat garanti.`,
  },
  {
    name: "charte-studio",
    description: "À utiliser pour concevoir une landing de démonstration dans le Studio Web : principes, structure de page, design, accessibilité et interdits.",
    content: `# Charte du Studio Web

## Principes
- Fidélité : textes, services, logo, couleurs et photos viennent du site ou de la fiche du prospect. Ce qui manque est remplacé par un emplacement neutre, jamais inventé.
- Clarté : une promesse, un public, une zone et un appel à l'action dès le premier écran.
- Mobile d'abord : tout se lit et se touche au pouce sur 390 px de large.

## Structure type
1. En-tête : logo, téléphone cliquable, bouton principal.
2. Promesse : titre tourné vers le bénéfice, sous-titre (métier et zone), bouton, photo réelle.
3. Services : 3 à 6 cartes, chacune avec son bénéfice.
4. Preuves : avis réels avec leur source, réalisations, labels vérifiables.
5. Déroulé : comment se passe une intervention ou une collaboration, en trois étapes.
6. Zone d'intervention et horaires.
7. Appel final et contact (liens \`tel:\` et \`mailto:\` seulement).
8. Pied de page : mentions et « Maquette non contractuelle réalisée par Cleads ».

## Design
- Deux couleurs de la marque au plus, avec des neutres ; contraste de 4,5:1 au moins pour le texte.
- Une ou deux familles de polices courantes ; texte courant de 16 px au moins, interligne de 1,5.
- Espacements généreux et réguliers (multiples de 4 ou 8 px), coins et ombres discrets.
- Images avec texte alternatif, dimensions déclarées et poids raisonnable.

## Interdits
- Aucun script, aucun formulaire envoyé vers un service externe, aucun traceur ni cookie.
- Aucun faux avis, faux chiffre, faux label ni faux client ; aucune photo de banque d'images présentée comme réelle.
- Aucun texte copié d'un concurrent.`,
  },
  {
    name: "playbook-artisans-batiment",
    description: "À utiliser pour un artisan ou une entreprise du bâtiment (plombier, électricien, chauffagiste, couvreur, maçon, menuisier, peintre) : douleurs, vocabulaire, signaux et offres qui marchent.",
    content: `# Playbook : artisans du bâtiment

## Qui ils sont
TPE de 1 à 10 personnes. Le dirigeant est sur les chantiers la journée et fait l'administratif le soir. Clientèle de particuliers, parfois de professionnels, dans un rayon de 20 à 50 km.

## Douleurs fréquentes
- Des demandes peu qualifiées ou trop lointaines, et pas le temps de rappeler.
- La dépendance au bouche-à-oreille et aux plateformes de mise en relation qui revendent les contacts.
- La saisonnalité (chauffage l'hiver, toiture et extérieurs aux beaux jours).
- Peu de temps et peu de goût pour le numérique.

## Ce qui compte pour eux
Des demandes de devis dans leur zone, sur leurs travaux rentables, sans y passer leurs soirées.

## Signaux typiques
\`gbp_incomplete\`, \`few_reviews\`, \`mobile_score_low\`, \`no_google_ads_high_intent\` (dépannage, urgence), \`site_outdated\`.

## Offres qui marchent
- Le SEO local (fiche Google, avis) d'abord : peu cher, résultat visible.
- Google Ads sur l'urgence pour les métiers de dépannage.
- Un site vitrine ou une refonte qui montre les réalisations (avant / après) et la zone d'intervention.

## Vocabulaire
« devis », « chantier », « intervention », « secteur », « dépannage », « réalisations » ; éviter « leads », « funnel », « branding ».

## À éviter
Appeler en pleine journée (ils sont sur chantier) : préférer 7 h 30 – 8 h 30 ou après 17 h 30. Les longs emails.`,
  },
  {
    name: "playbook-restaurants",
    description: "À utiliser pour un restaurant, un bar, un traiteur ou un commerce de bouche : douleurs, vocabulaire, signaux, offres qui marchent et moments à éviter.",
    content: `# Playbook : restaurants et métiers de bouche

## Qui ils sont
Des établissements indépendants, souvent tenus par le chef ou les propriétaires ; marges serrées, personnel difficile à recruter.

## Douleurs fréquentes
- La dépendance aux plateformes de réservation et de livraison, et à leurs commissions.
- Les avis Google, qui font et défont la réputation, et peu de temps pour y répondre.
- Une fréquentation irrégulière en semaine et des creux saisonniers.
- Une carte, des horaires et des photos qui ne sont pas à jour en ligne.

## Signaux typiques
\`gbp_incomplete\` (horaires, carte, photos), \`low_rating\`, \`few_reviews\`, \`inactive_social\`, \`visual_sector\`, \`no_booking\`.

## Offres qui marchent
- Le SEO local avec la gestion des avis : premier levier.
- Les réseaux sociaux (Instagram) : plats, équipe, coulisses.
- Une landing avec réservation directe, pour réduire les commissions.
- Des campagnes Meta locales pour les soirées creuses ou les événements.

## Vocabulaire
« couverts », « service », « réservation », « carte », « clientèle de quartier », « avis ».

## À éviter
Appeler pendant le service (11 h 30 – 14 h 30 et 18 h 30 – 22 h 30) : préférer 15 h – 17 h. Promettre un nombre de couverts en plus.`,
  },
  {
    name: "playbook-sante",
    description: "À utiliser pour un professionnel de santé ou du bien-être (cabinet médical, dentiste, kinésithérapeute, ostéopathe, psychologue, pharmacie) : règles de communication du secteur, douleurs, offres.",
    content: `# Playbook : santé et bien-être

## Règles du secteur (prioritaires)
- Les professions de santé réglementées (médecins, chirurgiens-dentistes, masseurs-kinésithérapeutes, infirmiers, sages-femmes…) ont des règles déontologiques de communication : une information loyale, claire et sans caractère commercial ; pas de comparaison avec des confrères, pas de promesse de résultat, pas de témoignages de patients.
- Ne propose ni Google Ads ni Meta Ads à une profession réglementée sans écrire que c'est « à vérifier avec l'ordre professionnel ».
- Aucune donnée de santé dans un email, jamais.

## Douleurs fréquentes
- Un agenda saturé, ou des créneaux vides selon la spécialité ; la dépendance aux plateformes de prise de rendez-vous.
- Des informations pratiques introuvables (accès, horaires, actes, tarifs, conventionnement).
- Trop d'appels pour des questions simples.

## Signaux typiques
\`gbp_incomplete\`, \`nap_inconsistent\`, \`no_faq\`, \`unclear_entity\`, \`mobile_score_low\`.

## Offres qui marchent
- Un site d'information clair (accès, actes, tarifs, FAQ) : il réduit les appels.
- Le SEO local et le GEO : être trouvé et bien décrit, sans démarche commerciale.
- Pour le bien-être non réglementé (naturopathes, sophrologues, coachs) : réseaux sociaux et Meta Ads possibles.

## Vocabulaire
« patients », « cabinet », « consultations », « prise de rendez-vous », « informations pratiques » ; jamais « clients » pour une profession de santé.`,
  },
  {
    name: "playbook-architectes",
    description: "À utiliser pour un cabinet d'architecture, d'architecture d'intérieur ou de maîtrise d'œuvre : douleurs, vocabulaire, signaux et offres qui marchent.",
    content: `# Playbook : architectes et maîtres d'œuvre

## Qui ils sont
De petites agences (1 à 15 personnes), très attachées à l'image et à la qualité de leurs réalisations ; des clients particuliers (maisons, extensions, rénovations) et professionnels. Les architectes inscrits à l'Ordre suivent des règles déontologiques : une communication loyale, sans dénigrement.

## Douleurs fréquentes
- Des projets peu qualifiés (budgets irréalistes, demandes de conseil gratuit).
- Un portfolio en ligne daté, lourd ou mal référencé : de belles photos, mais un site lent.
- La dépendance au réseau et aux recommandations ; peu de visibilité locale sur la rénovation.

## Signaux typiques
\`site_outdated\`, \`mobile_score_low\` (images lourdes), \`no_service_pages\`, \`visual_sector\`, \`inactive_social\`, \`unclear_entity\`.

## Offres qui marchent
- La refonte du portfolio : des projets bien présentés et rapides à charger, un texte par projet (programme, surface, lieu, budget indicatif si le client l'accepte).
- Le SEO éditorial par type de projet et par ville (« extension de maison en bois à Nantes »).
- Instagram et Pinterest pour les réalisations.
- Une landing de qualification (type de projet, budget, calendrier) pour filtrer les demandes.

## Vocabulaire
« projet », « programme », « maîtrise d'œuvre », « permis de construire », « réalisations », « références » ; éviter « produit », « client cible ».`,
  },
]
