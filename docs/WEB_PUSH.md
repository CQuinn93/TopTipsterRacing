# Web Push (LMS deadline reminders)

Home Screen / PWA users can opt in to pick-deadline alerts. The payload includes the competition, gameweek, and the **auto-assign team** they would get if they skip (same A–Z unused pool team as `lms_auto_assign_missed_picks`).

## One-time setup

### 1. Apply the database migration

Run Supabase migration `071_lms_web_push_reminders.sql` (subscriptions table, reminder RPC, dedupe log).

### 2. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

You get a **public** and **private** key.

### 3. GitHub repository secrets

| Secret | Used by |
|--------|---------|
| `VAPID_PUBLIC_KEY` | Web build (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`) + reminder sender |
| `VAPID_PRIVATE_KEY` | Reminder sender only (never ship to the client) |
| `VAPID_SUBJECT` | Optional. `mailto:you@example.com` or `https://www.toptipster.ie` |
| `SUPABASE_URL` | Already used |
| `SUPABASE_SERVICE_KEY` | Already used |
| `SUPABASE_ANON_KEY` | Already used for deploy |

Redeploy the web app after adding `VAPID_PUBLIC_KEY` so the client can subscribe.

### 4. Schedule (cron-job.org)

Trigger workflow `lms-deadline-reminders.yml` every **15 minutes** via cron-job.org (same pattern as your other jobs). See [cron-job-org-setup.md](./cron-job-org-setup.md) — Job 5.

Manual / local test:

```bash
export SUPABASE_URL=...
export SUPABASE_SERVICE_KEY=...
export VAPID_PUBLIC_KEY=...
export VAPID_PRIVATE_KEY=...
npm run remind:lms-deadlines
```

## User flow (iOS)

1. Safari → Share → **Add to Home Screen**
2. Open the icon (standalone)
3. LMS → Competitions → **Enable notifications**
4. Allow the system permission prompt

Reminders fire about **2 hours** and **30 minutes** before `deadline_at` for active players with no pick and a stored subscription (once per window).

## Files

- Client: `lib/webPush*.ts`, `public/sw.js`, `components/lms/LmsPushNotificationsCard.tsx`
- Sender: `scripts/send-lms-deadline-reminders.ts`
- Workflow: `.github/workflows/lms-deadline-reminders.yml`
- SQL: `supabase/migrations/071_lms_web_push_reminders.sql`
