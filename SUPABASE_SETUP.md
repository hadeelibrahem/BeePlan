# Supabase Setup Guide

هذا الدليل لتجهيز Supabase كقاعدة PostgreSQL لمشروع BeePlan.

## 1. Create Supabase Project

1. افتحي Supabase.
2. اضغطي `New project`.
3. اختاري organization.
4. اكتبي اسم المشروع: `BeePlan`.
5. اكتبي Database Password واحفظيها بمكان آمن.
6. اختاري region قريب من Railway قدر الإمكان.
7. اضغطي `Create new project`.

## 2. Database URL

مشروع Supabase الحالي يعطي connection string بهذا الشكل:

```text
postgresql://postgres.bhbihmbnlnpzqfqhoenj:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres
```

استبدلي `[YOUR-PASSWORD]` بكلمة مرور قاعدة بيانات Supabase.

ملاحظة: هذا الرابط يستخدم shared transaction-mode pooler على port `6543`، وهو مناسب للاستضافة مثل Railway.

## 3. ORM Status

Drizzle ORM مركب وجاهز بالفعل داخل `apps/api`:

```bash
npm install drizzle-orm
npm install drizzle-kit --save-dev
```

لا تحتاجي تعيدي تشغيلهم إلا إذا حذفتي `node_modules`.

ملفات Drizzle عندنا:

```text
apps/api/drizzle.config.ts
apps/api/src/db/schema.ts
apps/api/src/db/database.service.ts
```

ملاحظة: Supabase docs تعرض `drizzle/schema.ts` كمثال، لكن في مشروع NestJS عندنا مكان الـ schema هو:

```text
apps/api/src/db/schema.ts
```

و `drizzle.config.ts` مضبوط عليه.

## 4. Local Env

اعملي ملف:

```text
apps/api/.env
```

وحطي فيه:

```env
PORT=3000
DATABASE_URL="postgresql://postgres.bhbihmbnlnpzqfqhoenj:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"
DB_SSL=true
```

مهم: لا ترفعي `.env` على GitHub.

أو انسخي الملف الجاهز:

```bash
copy apps\api\.env.supabase.example apps\api\.env
```

ثم بدلي `[YOUR-PASSWORD]` بكلمة المرور الحقيقية.

## 5. Test API Locally

من جذر المشروع:

```bash
npm run api
```

ثم افتحي:

```text
http://localhost:3000/health
```

إذا رجع JSON فيه `ok: true`، فالـ API شغال.

## 6. Drizzle Migrations

لإنشاء migration من schema الحالي:

```bash
npm run db:generate
```

لتطبيق migration على Supabase:

```bash
npm run db:migrate
```

الـ schema الحالي موجود هنا:

```text
apps/api/src/db/schema.ts
```

## 7. Railway Variables With Supabase

لما نرجع نكمل Railway، لا تضيفي Railway PostgreSQL.

بدلًا من ذلك، في خدمة API على Railway افتحي `Variables` وأضيفي:

```text
DATABASE_URL=postgresql://postgres.bhbihmbnlnpzqfqhoenj:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres
DB_SSL=true
NODE_ENV=production
```

لا تضيفي:

```text
PORT
```

Railway يضيف `PORT` تلقائيًا.

## 8. Supabase SQL Check

بعد تشغيل migrations، تقدري تتأكدي من الجدول من Supabase:

1. افتحي `Table Editor`.
2. تأكدي من وجود جدول `users`.

أو من `SQL Editor`:

```sql
select * from users;
```

## 9. Agent Skills Optional

Supabase يقترح:

```bash
npx skills add supabase/agent-skills
```

هذا اختياري ومخصص لبعض أدوات AI. المشروع لا يحتاجه حتى يشتغل.

## 10. Common Issues

### Password Has Special Characters

إذا كلمة المرور فيها رموز مثل `@` أو `#` أو `/`، استخدمي connection string الذي يعطيه Supabase مباشرة أو اعملي URL encoding للرموز.

### SSL Error

تأكدي أن:

```text
DB_SSL=true
```

### Migration Cannot Connect

تأكدي أن `DATABASE_URL` في `apps/api/.env` هو نفس رابط Supabase الصحيح، وأن كلمة المرور مستبدلة وليست placeholder.
