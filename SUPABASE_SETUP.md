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

## 2. Get Database URL

بعد ما يجهز المشروع:

1. افتحي project.
2. روحي إلى `Project Settings`.
3. افتحي `Database`.
4. روحي لقسم `Connection string`.
5. اختاري connection string من نوع URI.

استخدمي connection pooling إذا متاح، خصوصًا لما التطبيق يكون مستضاف على Railway.

الشكل بيكون قريب من:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
```

استبدلي:

- `PASSWORD` بكلمة مرور قاعدة البيانات.
- أي placeholder يظهر من Supabase بالقيمة الفعلية.

## 3. Local Env

اعملي ملف:

```text
apps/api/.env
```

وحطي فيه:

```env
PORT=3000
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres"
DB_SSL=true
```

مهم: لا ترفعي `.env` على GitHub.

## 4. Test API Locally

من جذر المشروع:

```bash
npm run api
```

ثم افتحي:

```text
http://localhost:3000/health
```

إذا رجع JSON فيه `ok: true`، فالـ API شغال.

## 5. Drizzle Migrations

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

## 6. Railway Variables With Supabase

لما نرجع نكمل Railway، لا تضيفي Railway PostgreSQL.

بدلًا من ذلك، في خدمة API على Railway افتحي `Variables` وأضيفي:

```text
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
DB_SSL=true
NODE_ENV=production
```

لا تضيفي:

```text
PORT
```

Railway يضيف `PORT` تلقائيًا.

## 7. Supabase SQL Check

بعد تشغيل migrations، تقدري تتأكدي من الجدول من Supabase:

1. افتحي `Table Editor`.
2. تأكدي من وجود جدول `users`.

أو من `SQL Editor`:

```sql
select * from users;
```

## 8. Common Issues

### Password Has Special Characters

إذا كلمة المرور فيها رموز مثل `@` أو `#` أو `/`، استخدمي connection string الذي يعطيه Supabase مباشرة أو اعملي URL encoding للرموز.

### SSL Error

تأكدي أن:

```text
DB_SSL=true
```

### Migration Cannot Connect

تأكدي أن `DATABASE_URL` في `apps/api/.env` هو نفس رابط Supabase الصحيح، وأن كلمة المرور مستبدلة وليست placeholder.
