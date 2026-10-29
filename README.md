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
| `npm run seed` | données initiales |

## Structure

- `app/` : routes (landing `/`, pages légales, `/auth`, `/dashboard`, API).
- `components/home-v2/` : landing (ne pas modifier sans nécessité).
- `components/ui/` : primitives shadcn/Radix.
- `docs/` : plans et notes de conception ; `DESIGN.md` : direction visuelle de la landing.

L'historique antérieur au CRM est conservé dans le tag Git `legacy-pre-crm` (pages publiques, blog IA, facturation, portail client).
