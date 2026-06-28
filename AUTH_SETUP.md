# BeePlan Supabase Auth Setup

Add these redirect URLs in Supabase:

Supabase Dashboard -> Authentication -> URL Configuration

- Site URL for local web: `http://localhost:5173`
- Redirect URL for local web reset: `http://localhost:5173/reset-password`
- Redirect URL for mobile reset: `beeplan://reset-password`
- Production web reset later: `https://your-domain.com/reset-password`

For the reset-password link flow, update the Reset Password email template:

Supabase Dashboard -> Authentication -> Email Templates -> Reset Password

Make sure the email includes the reset link, for example:

```html
<a href="{{ .ConfirmationURL }}">Reset password</a>
```

The link opens BeePlan on `/reset-password`, where the user can create a new password.

Use only the Supabase anon/public publishable key in frontend `.env` files.
Never use the `service_role` key in web or mobile apps.

Web env:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Mobile env:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```
