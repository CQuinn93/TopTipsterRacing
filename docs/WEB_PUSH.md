# Web Push (LMS deadline + join-request reminders)

Home Screen / PWA users can opt in to alerts. Deadline reminders include the auto-assign team. Join-request alerts are **per manager** (creator vs Owner prefs are independent).

## One-time setup

### 1. Apply migrations

- `071_lms_web_push_reminders.sql` — subscriptions + deadline reminder RPCs  
- `072_lms_join_notify_prefs.sql` — per-user join notify prefs + recipient RPC  

### 2. Generate VAPID keys (once)

```bash
npx web-push generate-vapid-keys
```

### 3. GitHub repository secrets

| Secret | Used by |
|--------|---------|
| `VAPID_PUBLIC_KEY` | Web build + deadline sender + Edge Function |
| `VAPID_PRIVATE_KEY` | Deadline sender + Edge Function (never in the client) |
| `VAPID_SUBJECT` | Optional (`mailto:…` or `https://www.toptipster.ie`) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY` | Existing |

Redeploy the web app after adding `VAPID_PUBLIC_KEY`.

### 4. Deadline reminders (cron-job.org)

Every **15 minutes** → workflow `lms-deadline-reminders.yml`  
See [cron-job-org-setup.md](./cron-job-org-setup.md) Job 5.

### 5. Instant join-request alerts (Edge Function)

After a successful join code submit, the **web app** calls `notify-lms-join-request` with the new `join_request_id` (same auth pattern as the test push). A Database Webhook is optional backup.

#### Deploy

```bash
# Apply migration 074 (returns join_request_id), then:
supabase functions deploy notify-lms-join-request
```

Notification copy:
> **New join request**  
> `<username> has requested to join <competition>. Please visit the admin panel within the app to accept or reject them.`

Managers still need Home Screen + **Deadline Alerts** on (shared subscription). Creators default to join-notify on; Owners default off until they toggle it.

#### Manual test

```bash
curl -X POST "$SUPABASE_URL/functions/v1/notify-lms-join-request" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"join_request_id\":\"YOUR_PENDING_REQUEST_UUID\"}"
```

## Preference behaviour

| Role | Default (no saved pref) | Toggle |
|------|-------------------------|--------|
| Competition **creator** | **On** | Admin → Join requests → “Notify me on join requests” |
| **Owner** (not creator) | **Off** | Same toggle — only changes **their** alerts |

Turning the switch off for yourself does **not** mute the other party.

Recipients still need Home Screen + LMS home **Enable notifications**.

## Test notification (debug shared delivery)

Deploy:

```bash
supabase functions deploy notify-web-push-test
```

(Uses the same `VAPID_*` secrets as join notify.)

On the Home Screen app → LMS home → turn **Deadline Alerts** on → tap **Send test notification**.

- Success → PWA + subscription + VAPID + service worker are fine; debug join webhook / deadline cron next.
- Failure → fix shared delivery before join/deadline logic.

## User flows

**Deadline (player)**  
Enable notifications → miss a pick → push ~2h and ~30m before deadline.

**Join (manager)**  
Creator enables notify (default on) → player requests join → Edge Function pushes within seconds.

## Files

- Client: `lib/webPush*.ts`, `public/sw.js`, `LmsPushNotificationsCard`, Admin toggle in `[competitionId].tsx`
- Deadline sender: `scripts/send-lms-deadline-reminders.ts` + GitHub Action  
- Join sender: `supabase/functions/notify-lms-join-request`  
- SQL: `071_…`, `072_…`
