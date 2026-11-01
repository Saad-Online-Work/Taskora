# VYQORLUNE — Supabase setup (Phase 1: backend)

## 1. Create the project
1. https://supabase.com → New project. Choose a region near your users.
2. Save the database password somewhere safe. Do not put it in the website.

## 2. Run the schema
1. Dashboard → SQL Editor → New query.
2. Paste the full contents of `supabase/schema.sql` → Run.
3. Verify RLS is on:
   select tablename, rowsecurity from pg_tables where schemaname = 'public';
   All four tables (profiles, projects, tasks, user_preferences) must show `true`.

## 3. Auth settings
- Authentication → Providers → Email: enabled.
- Authentication → Sign In / Providers → Confirm email: keep ON (recommended).
- Authentication → URL Configuration:
  - Site URL: your deployed site, e.g. https://your-domain.com (or http://localhost:8080 while testing)
  - Redirect URLs: add the same site with /signin.html, /reset-password.html

## 4. Copy the public keys
Project Settings → API:
- Project URL → paste into js/supabase-config.js as `url`
- anon / publishable key → paste as `anonKey`
- NEVER copy the service_role / secret key into any project file.

## 5. Test locally
Serve the folder over HTTP (the auth module will not run from file://):
    npx serve .            # or: python3 -m http.server 8080
Then open http://localhost:8080/signup.html

Note: Supabase email links must point to a URL you have added to Redirect URLs.
