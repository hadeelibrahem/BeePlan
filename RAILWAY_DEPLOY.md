# Railway Deploy Guide

هذا الدليل لنشر Backend API فقط على Railway.

## 1. Railway Service Settings

في Railway service المرتبط مع GitHub repo:

- Source repo: `hadeelibrahem/BeePlan`
- Branch connected to production: `hadeel`
- Root Directory: `apps/api`

ملاحظة: إذا Railway قبلها بالشكل `/apps/api` عادي، لكن الأفضل تكون `apps/api` بدون `/`.

## 2. Database

نستخدم Supabase كقاعدة PostgreSQL بدل Railway PostgreSQL.

جهزي Supabase أولًا من:

```text
SUPABASE_SETUP.md
```

بعدها افتحي خدمة الـ API في Railway وروحي على `Variables` وأضيفي:

```text
DATABASE_URL=postgresql://postgres.bhbihmbnlnpzqfqhoenj:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres
DB_SSL=true
NODE_ENV=production
```

لا تضيفي `PORT` يدويًا. Railway يعطيه تلقائيًا، والـ API جاهز يقرأه من `process.env.PORT`.

## 3. Build And Start

المشروع مجهز بـ Dockerfile داخل:

```text
apps/api/Dockerfile
```

Railway سيستخدمه تلقائيًا طالما `Root Directory` هو:

```text
apps/api
```

الـ Dockerfile يعمل:

```bash
npm ci
npm run build
npm prune --omit=dev
npm run railway:start
```

## 4. Deploy

بعد تعديل الإعدادات:

1. اضغطي `Apply changes`.
2. اضغطي `Deploy`.
3. افتحي تبويب `Deployments` وتابعي logs.

إذا نجح النشر، اختبري الرابط:

```text
https://YOUR-RAILWAY-DOMAIN/health
```

المفروض يرجع:

```json
{
  "ok": true,
  "service": "BeePlan API",
  "timestamp": "..."
}
```

## 5. Drizzle Migrations

عند إضافة جداول جديدة:

```bash
npm run db:generate
```

ثم ارفعي ملفات migration الناتجة إلى GitHub.

لتشغيل migrations على Railway، افتحي service console أو job مؤقت وشغلي:

```bash
npm run db:migrate
```

حاليًا يوجد schema أولي في:

```text
apps/api/src/db/schema.ts
```

## 6. Common Errors

### Missing DATABASE_URL

إذا ظهر خطأ من Zod أو Config يقول إن `DATABASE_URL` ناقص:

- تأكدي أن PostgreSQL مضاف في Railway.
- تأكدي أن variable موجود في خدمة الـ API نفسها.

### Wrong Root Directory

إذا Railway حاول يبني المشروع من الجذر وفشل:

- افتحي service settings.
- Source.
- Root Directory.
- اكتبي `apps/api`.

### App Starts But Endpoint Fails

افتحي:

```text
/health
```

إذا `/health` يعمل، فالباك شغال.
