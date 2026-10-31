# Cleads

Site vitrine (une seule page marketing) et back-office de prospection. Le CRM V1 est en construction : voir [docs/crm-v1/PLAN.md](docs/crm-v1/PLAN.md).

## Démarrer

```bash
cp .env.example .env      # puis renseigner les variables
npm install
npx prisma generate
npm run dev
```

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | `prisma generate`, migrations, puis build Next |
| `npm run lint` | ESLint |
| `npm run db:backfill-legacy` | copie les anciens clients, rendez-vous et disponibilités dans le CRM (simulation par défaut) |
| `npm run db:seed-demo` | données fictives pour le développement (refuse une base distante) |
| `npm test` | tests ; ceux qui touchent la base exigent `TEST_DATABASE_URL` |

## Accès et rôles

L'accès au CRM se donne par invitation (`/app/settings/team`) : la personne choisit son mot de passe via un lien à usage unique de 7 jours. Rôles : propriétaire, manager, SDR, closer, lecteur ; la matrice des droits est dans `lib/rbac.ts` et ses tests. Les droits sont vérifiés côté serveur (`lib/auth/guard.ts`), jamais seulement dans l'interface. Les connexions et changements d'accès sont dans le journal d'audit.

```bash
# Tests ; ceux qui touchent la base ne tournent qu'avec une base jetable (jamais celle de développement)
TEST_DATABASE_URL=postgresql://… npm test
```

## Emailing de prospection

Les emails de prospection partent de boîtes dédiées sur des domaines secondaires, jamais de SES ni de Resend : voir [docs/crm-v1/EMAILING.md](docs/crm-v1/EMAILING.md) (variable `MAILBOX_SECRET_KEY`, boîtes, plafonds, désinscription).

## Cleads Extractor

La recherche d'entreprises (`/app/search`) s'appuie sur Cleads Extractor : voir [docs/crm-v1/EXTRACTOR.md](docs/crm-v1/EXTRACTOR.md) pour les variables `EXTRACTOR_*` et le fonctionnement.

## Structure

- `app/` : routes (landing `/`, pages légales, `/auth`, `/dashboard`, API).
- `components/home-v2/` : landing (ne pas modifier sans nécessité).
- `components/ui/` : primitives shadcn/Radix.
- `docs/` : plans et notes de conception ; `DESIGN.md` : direction visuelle de la landing.

L'historique antérieur au CRM est conservé dans le tag Git `legacy-pre-crm` (pages publiques, blog IA, facturation, portail client).
