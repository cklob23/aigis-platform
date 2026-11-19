# Daily notifications cron on Render

AIGIS is hosted on Render (`srv-dbuhh2hsrm7s73et2mn0`, https://aigis-platform.onrender.com). `vercel.json` still lists the same 07:00 UTC schedule so a Vercel deploy would keep working, but Vercel Cron does not run on Render. The live scheduler is a Render cron job.

## What Caleb sets

### 1. `CRON_SECRET` on the web service

1. Open the AIGIS web service in the Render Dashboard.
2. Environment.
3. Add `CRON_SECRET` as a secret. Use a long random value (for example `openssl rand -hex 32`).
4. Save. The web service must have this variable so `/api/cron/notifications` can authenticate callers.

If `CRON_SECRET` is missing, the route returns 503 and does not run the sweep.

### 2. Cron job

Create a Cron Job service (New + Cron Job) on the same repo and branch as the web service:

- **Name:** `aigis-notifications`
- **Schedule:** `0 7 * * *` (07:00 UTC daily; same as `vercel.json`)
- **Build command:** `true`
- **Start command:** `bash scripts/run-notifications-cron.sh`
- **Env vars on the cron job:**
  - `CRON_SECRET`: the same value as the web service (use an environment group, or paste it)
  - `AIGIS_CRON_URL` (optional): defaults to `https://aigis-platform.onrender.com/api/cron/notifications`

The script sends `Authorization: Bearer ${CRON_SECRET}`. A wrong secret returns 401. The route is not gated by a user session; the secret is the only gate (`proxy.ts` lets `/api/cron` through).

After the first deploy, open the cron job's Runs page and click Trigger Run to confirm a 200 JSON body with `ok: true`.

## `vercel.json`

Kept. It documents the intended 07:00 UTC schedule and would fire on Vercel (which already sends `Authorization: Bearer ${CRON_SECRET}`). It does nothing on Render. Removing it would drop that fallback for no benefit. There is only one live host, so the two definitions do not double-fire.
