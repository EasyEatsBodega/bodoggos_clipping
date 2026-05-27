# bodoggos_clipping

Clipper campaign desk. X-only. Clippers submit tweets, we track impressions for 7 days, pay $4 CPM (capped) in USDC. See `CLIPPER_APP_SPEC.md` for the full build spec.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Supabase (Postgres + Auth) · twitterapi.io · Resend · Vercel Cron.

## Local setup

```bash
npm install
cp .env.example .env.local         # fill in keys (see below)
npm run dev
```

### Required env vars

| Var | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API |
| `TWITTERAPI_IO_KEY` | twitterapi.io dashboard |
| `X_OAUTH_CLIENT_ID` / `X_OAUTH_CLIENT_SECRET` / `X_OAUTH_REDIRECT_URI` | X Developer Portal → OAuth 2.0 |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Resend (used by Supabase Auth for magic-link delivery) |
| `CRON_SECRET` | any random string; set the same value on Vercel |
| `NEXT_PUBLIC_APP_URL` | your deployed origin (e.g. `https://yourdomain.com`) |

### Supabase migrations

Run in order (Supabase SQL editor or CLI):

1. `supabase/migrations/0001_init.sql` — schema
2. `supabase/migrations/0002_rls.sql` — row-level security
3. `supabase/seed.sql` — seeds the active campaign
4. `supabase/seed_admin.sql` — *after* an admin signs in once via magic link, edit the email and run to grant admin

## Scripts

```bash
npm run dev         # local dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm test            # vitest (URL parser, payout calc, poll cadence)
```

## Routes

- `/` landing
- `/auth/magic` magic-link sign-in
- `/api/auth/x/start` → X OAuth (PKCE)
- `/onboarding` first-time clipper handle entry
- `/dashboard` clipper KPI + submit + clips
- `/dashboard/clips/[id]` clip detail + impressions chart
- `/dashboard/settings`
- `/admin`, `/admin/clippers`, `/admin/clippers/[id]`, `/admin/clips`, `/admin/payouts`, `/admin/config`
- `/api/cron/poll-clips` (Vercel Cron, hourly)
- `/api/cron/finalize-clips` (Vercel Cron, daily at 01:00 UTC)
- `/api/admin/clips` (machine-to-machine read API — see below)

## Clips tracking API

Read-only endpoint for external tools (e.g. the deliverable tracker) to pull
clips for a partner. Auth is a static bearer secret — set `CLIPS_API_KEY` in
the environment and send it as `Authorization: Bearer <CLIPS_API_KEY>` (the
header `x-api-key: <CLIPS_API_KEY>` is also accepted).

```bash
# Filter by partner (slug or label, case-insensitive)
curl "https://<your-domain>/api/admin/clips?partner=acme" \
  -H "Authorization: Bearer $CLIPS_API_KEY"

# Or pass the partner in a JSON body
curl "https://<your-domain>/api/admin/clips" \
  -H "Authorization: Bearer $CLIPS_API_KEY" \
  -H "content-type: application/json" \
  -d '{"partner":"acme"}'
```

Omit `partner` to return all clips. Response:

```json
{
  "partner": "Acme",
  "count": 2,
  "clips": [
    {
      "handle": "someclipper",
      "submission_date": "2026-05-20T18:03:11.000Z",
      "tweet_link": "https://x.com/someclipper/status/123",
      "creator": "Jane Doe",
      "partner": "Acme"
    }
  ]
}
```

An unknown partner returns `404` with the list of `available_partners`.

## Deploying

- Push to GitHub.
- Import the repo in Vercel. Set every var from `.env.example`.
- Vercel Cron is wired via `vercel.json`. Provide `CRON_SECRET` and Vercel will send it as `Authorization: Bearer <secret>` to the cron routes.
- Ensure your X OAuth app's Redirect URI matches `X_OAUTH_REDIRECT_URI` in Vercel env.
