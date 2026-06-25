# BeePlan

Monorepo starter for:

- `apps/mobile`: Expo + React Native + TypeScript + NativeWind + React Query + Zod + Zustand
- `apps/web`: React + Vite + TypeScript + Tailwind + React Query + Zod + Zustand
- `apps/api`: NestJS + TypeScript + Drizzle ORM + PostgreSQL + Zod

## Run

```bash
npm run mobile
npm run web
npm run api
```

Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL` before running migrations.

## Structure

See `PROJECT_STRUCTURE.md` for the frontend/backend folder split and where to add new files.

## Deploy

See `RAILWAY_DEPLOY.md` for Railway backend deployment steps.

## Database

See `SUPABASE_SETUP.md` for Supabase PostgreSQL setup steps.
