# Intégration de Cleads Extractor

Le CRM lance des recherches d'entreprises (activité + zone) sur Cleads Extractor, suit leur avancement, montre un échantillon des résultats, puis importe ce que la personne a validé dans les prospects. Écrans : `/app/search` et `/app/search/<id>`.

## Configuration

| Variable | Rôle |
|---|---|
| `EXTRACTOR_URL` | adresse de l'Extractor (ex. `https://vps-xxxx.vps.ovh.net`) |
| `EXTRACTOR_API_KEY` | clé **`crm`** de l'Extractor (jamais la clé `admin`) |
| `EXTRACTOR_WEBHOOK_SECRET` | facultatif : même valeur que `WEBHOOK_SECRET` côté Extractor, pour être prévenu quand une recherche se termine |
| `EXTRACTOR_WEBHOOK_BASE_URL` | facultatif : adresse publique du CRM si elle diffère de `NEXT_PUBLIC_APP_URL` |

La clé reste côté serveur : le navigateur parle au CRM, le CRM parle à l'Extractor (aucune réponse du CRM ne la contient, vérifié). Sans configuration, la page de recherche le dit au lieu d'échouer.

**Le webhook est un confort, pas une nécessité** : l'écran suit la recherche par interrogation (toutes les 2,5 s, puis 8 s, en pause quand l'onglet est caché). Le webhook n'est proposé à l'Extractor que si l'adresse du CRM est publique en `https` (l'Extractor refuse les adresses privées) et si le secret est défini ; en développement local il est simplement omis.

## Parcours

1. **Lancer** : activité, zone, nombre maximum de résultats (50 à 1 000), recherche d'emails sur les sites (plus lente, seul moyen d'en obtenir). Trois recherches en cours au plus par personne. Un état de santé est affiché avant : « les sources répondent » ou « source limitée ou bloquée ».
2. **Suivre** : compteurs séparés (entreprises trouvées, joignables, fiches complètes, avec email), avancement indicatif, possibilité d'annuler, durée, erreurs regroupées par cause si des étapes échouent. Aucune promesse de délai.
3. **Vérifier** : un échantillon des résultats avec filtres (joignables, avec email, complétude), puis une vérification de l'import : à créer, déjà présents, ignorés, avertissements. Rien n'est écrit.
4. **Importer** : le même moteur que l'import CSV. Une recherche en cours peut être importée ; importer la suite plus tard n'ajoute aucun doublon.

## Identité d'une entreprise, et rejeu

Chaque résultat porte une identité stable fournie par l'Extractor (`dedup_key`, par exemple celle de la fiche Google). Elle devient `externalId` (`ext:pid:…`) : une entreprise trouvée par deux recherches ne donne qu'une fiche, et rejouer un import n'ajoute rien (vérifié sur une vraie recherche : 29 créées, puis 29 déjà présentes). Les entreprises **fermées définitivement** ne sont jamais importées. Les autres champs (note, avis, complétude, réseaux, SIREN, NAF…) sont conservés sur la fiche ; l'adresse email retenue est de préférence nominative, les autres sont gardées à part.

## Ce qui est vérifié

- **Tests de contrat** (`tests/extractor.integration.test.ts`) contre un vrai Extractor local (source de test) : formes des réponses, pagination par curseur, rejeu d'une création par clé d'idempotence, mauvaise clé, tâche inconnue, spécification invalide.
- **Tests de bout en bout** : lancement, suivi, aperçu, import, rejeu, filtres, limite de recherches simultanées, échec visible.
- **Webhook** : signature `sha256=HMAC(secret, horodatage + "." + corps)`, fenêtre de 5 minutes contre le rejeu, livraison en double sans double notification, jobs d'un autre CRM acquittés sans effet.
- **Essai réel** : une recherche « plombier, Lyon » (50 résultats, sans emails) sur l'Extractor de production, clé `crm`, depuis un CRM de test.

Les tests de contrat cherchent le binaire dans `../cleads-extractor/bin/cleads-extractor` (ou `EXTRACTOR_BIN`) et se sautent s'il est absent.

## Mise en route côté serveur (VPS)

La clé `crm` et `WEBHOOK_SECRET` sont dans `/opt/cleads/.env` du VPS. Pour activer les notifications : copier `WEBHOOK_SECRET` dans `EXTRACTOR_WEBHOOK_SECRET` du CRM, et vérifier que le CRM est joignable en `https` depuis Internet.
