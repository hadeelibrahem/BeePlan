# BeePlan Project Structure

هذا المشروع مقسوم كـ monorepo واضح بين الفرونت والباك:

- Frontend mobile: `apps/mobile`
- Frontend web: `apps/web`
- Backend API: `apps/api`

## Root

```text
BeePlan/
├── apps/
│   ├── mobile/
│   ├── web/
│   └── api/
├── package.json
├── README.md
└── PROJECT_STRUCTURE.md
```

## Frontend

الفرونت مقسوم إلى تطبيقين منفصلين:

- `apps/mobile`: تطبيق الموبايل باستخدام Expo + React Native.
- `apps/web`: تطبيق الويب باستخدام React + Vite.

### Mobile App

```text
apps/mobile/
├── App.tsx
├── index.ts
├── app.json
├── babel.config.js
├── metro.config.js
├── tailwind.config.js
├── global.css
├── package.json
└── src/
    ├── lib/
    │   └── api.ts
    ├── store/
    │   └── useAppStore.ts
    └── types/
        └── css.d.ts
```

وظيفة الملفات المهمة:

- `App.tsx`: الشاشة الرئيسية وربط React Query وواجهة البداية.
- `src/lib/api.ts`: كل طلبات API الخاصة بتطبيق الموبايل، مع Zod validation.
- `src/store/useAppStore.ts`: state محلي باستخدام Zustand.
- `global.css`: Tailwind/NativeWind styles.
- `tailwind.config.js`: إعداد NativeWind.
- `metro.config.js`: ربط NativeWind مع Metro bundler.
- `babel.config.js`: إعداد Babel الخاص بـ Expo وNativeWind.

### Web App

```text
apps/web/
├── index.html
├── vite.config.ts
├── package.json
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── App.css
    ├── lib/
    │   └── api.ts
    ├── store/
    │   └── useAppStore.ts
    └── assets/
```

وظيفة الملفات المهمة:

- `src/main.tsx`: entry point وربط React Query provider.
- `src/App.tsx`: واجهة الويب الرئيسية.
- `src/lib/api.ts`: طلبات API الخاصة بالويب، مع Zod validation.
- `src/store/useAppStore.ts`: state محلي باستخدام Zustand.
- `src/index.css`: Tailwind CSS entry.
- `vite.config.ts`: إعداد Vite وTailwind plugin.

## Backend

الباك موجود بالكامل داخل `apps/api` باستخدام NestJS + Drizzle ORM + PostgreSQL.

```text
apps/api/
├── drizzle.config.ts
├── package.json
├── .env.example
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── app.controller.ts
    ├── app.controller.spec.ts
    ├── app.service.ts
    ├── config/
    │   └── env.ts
    └── db/
        ├── database.module.ts
        ├── database.service.ts
        └── schema.ts
```

وظيفة الملفات المهمة:

- `src/main.ts`: تشغيل Nest app وتفعيل CORS.
- `src/app.module.ts`: ربط modules مثل Config وDatabase.
- `src/app.controller.ts`: تعريف routes الحالية مثل `/` و`/health`.
- `src/app.service.ts`: business logic البسيط الحالي.
- `src/config/env.ts`: validation للـ environment variables باستخدام Zod.
- `src/db/schema.ts`: تعريف جداول PostgreSQL باستخدام Drizzle.
- `src/db/database.service.ts`: إنشاء اتصال PostgreSQL وDrizzle client.
- `drizzle.config.ts`: إعداد migrations وDrizzle Kit.
- `.env.example`: مثال إعدادات البيئة.

## Where To Add New Files

### Mobile frontend

```text
apps/mobile/src/
├── screens/       # شاشات التطبيق
├── components/    # مكونات قابلة لإعادة الاستخدام
├── lib/           # API clients/helpers
├── store/         # Zustand stores
└── types/         # TypeScript declarations/types
```

### Web frontend

```text
apps/web/src/
├── pages/         # صفحات الويب
├── components/    # مكونات قابلة لإعادة الاستخدام
├── lib/           # API clients/helpers
├── store/         # Zustand stores
└── assets/        # صور وأيقونات وملفات static
```

### Backend

```text
apps/api/src/
├── modules/       # feature modules مثل auth, users, projects
├── db/            # schema/database connection
├── config/        # env/config validation
└── common/        # guards, pipes, filters, shared utils
```

## Run Commands

من جذر المشروع:

```bash
npm run mobile
npm run mobile -- --port 8082 --clear
npm run web
npm run api
```

أوامر قاعدة البيانات:

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

## Boundary Rules

- أي كود خاص بالموبايل يبقى داخل `apps/mobile`.
- أي كود خاص بالويب يبقى داخل `apps/web`.
- أي كود API أو Database يبقى داخل `apps/api`.
- لا تضع business logic للباك داخل الفرونت.
- لا تضع UI components داخل `apps/api`.
- أي schema للتحقق من رد API يمكن تكراره مؤقتًا داخل `apps/mobile/src/lib` و`apps/web/src/lib`، وبعد أن يكبر المشروع يمكن نقل الأنواع المشتركة إلى package مستقل مثل `packages/shared`.
