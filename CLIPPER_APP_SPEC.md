# Clipper Campaign App — Build Spec

A web app for managing an X-only clipper campaign. Clippers submit tweet URLs, we track impressions for 7 days, and pay $4 CPM (capped per clip) in USDC. Admins manage clippers, view metrics, and process payouts.

This document is the complete build spec. Read it end-to-end before writing code. Every section matters.

---

## 1. Product Summary

**Who uses it:**
- **Clippers** — content creators who post short-form video clips on X. They sign up, submit links to their posts, and get paid based on impressions.
- **Admins** — internal team. They monitor the campaign, ban bad actors, and process payouts.

**Core loop:**
1. Clipper signs up (X OAuth or magic-link email) and links their X handle
2. Clipper posts a clip on X, then submits the post URL in our app
3. Our backend validates the post belongs to their handle, isn't a duplicate, and starts tracking
4. A scheduled worker polls X impressions for that post for 7 days
5. After 7 days the impression count locks; payout is calculated as `(impressions / 1000) * cpmRate`, capped at the per-clip max
6. Admin reviews outstanding balances, sends USDC manually, marks paid in app

**Economics (configurable per campaign):**
- $4.00 CPM default
- $50–$100 max payout per clip (admin-adjustable, default $75)
- 7-day tracking window
- USDC payouts on Base (default) or any EVM/Solana chain — sent manually, recorded in app

---

## 2. Tech Stack

Use this stack unless there's a strong reason not to.

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router, TypeScript) | SSR, API routes, easy Vercel deploy |
| Database | Supabase (Postgres) | Built-in auth, RLS, easy schema migrations |
| Auth | Supabase Auth (magic link) + X OAuth 2.0 (custom) | Magic link is built-in; X OAuth we wire ourselves |
| Styling | Tailwind CSS | Fast, matches the prototype |
| Icons | `lucide-react` | Already used in prototype |
| Fonts | JetBrains Mono + Instrument Serif + Inter (Google Fonts) | Match prototype aesthetic |
| Scheduled jobs | Vercel Cron (or Supabase pg_cron / Inngest) | Polls X for impression updates |
| X data | **twitterapi.io** (primary) with adapter to swap for official X API later | ~$0.05 / 1k tweet lookups, no $200 floor, no approval delay |
| Email | Resend | Magic-link delivery, future notifications |
| Hosting | Vercel | Standard |
| Logging | Vercel logs + Sentry (optional) | |

**Don't add other services without checking first.** Especially: no Redis, no separate queue server, no analytics SDK in v1.

---

## 3. Data Model

Postgres schema. All timestamps `timestamptz`. All money stored as `numeric(12,2)` (never floats).

### `clippers`
```
id              uuid PK default gen_random_uuid()
email           text unique not null
x_handle        text unique not null         -- lowercase, no @ prefix
x_user_id       text unique                  -- X's numeric user id, set if OAuth was used
auth_method     text not null                -- 'magic_link' | 'x_oauth'
joined_at       timestamptz not null default now()
banned          boolean not null default false
banned_at       timestamptz
banned_reason   text
```

### `clips`
```
id                uuid PK default gen_random_uuid()
clipper_id        uuid not null references clippers(id) on delete cascade
campaign_id       uuid not null references campaigns(id)
url               text not null                          -- canonicalized: always https://x.com/...
tweet_id          text not null unique                   -- extracted numeric id from URL, hard uniqueness
submitted_at      timestamptz not null default now()
tracking_until    timestamptz not null                   -- submitted_at + campaign.tracking_days
status            text not null default 'tracking'       -- 'tracking' | 'completed' | 'rejected'
rejected_reason   text
last_polled_at    timestamptz
poll_count        int not null default 0
impressions       int not null default 0                 -- latest known
final_impressions int                                    -- locked at tracking_until
payout_amount     numeric(12,2)                          -- locked at tracking_until
admin_override_impressions int                           -- if admin manually overrode
admin_override_reason text
```

Index on `(status, tracking_until)` so the cron can efficiently find clips needing polling.

### `clip_impression_snapshots`
```
id           uuid PK default gen_random_uuid()
clip_id      uuid not null references clips(id) on delete cascade
impressions  int not null
captured_at  timestamptz not null default now()
source       text not null                  -- 'twitterapi_io' | 'x_official' | 'admin_manual'
```

We store every poll result so we can show a growth chart and audit anomalies.

### `payouts`
```
id          uuid PK default gen_random_uuid()
clipper_id  uuid not null references clippers(id)
amount      numeric(12,2) not null
chain       text not null                   -- 'Base' | 'Ethereum' | 'Solana' | 'Polygon' | etc
tx_hash     text                            -- nullable: admin can mark paid before pasting hash
paid_at     timestamptz not null default now()
note        text
created_by  uuid                            -- admin user id
```

### `campaigns`
```
id                  uuid PK default gen_random_uuid()
name                text not null
cpm_rate            numeric(8,2) not null default 4.00
max_payout_per_clip numeric(8,2) not null default 75.00
tracking_days       int not null default 7
active              boolean not null default true
created_at          timestamptz not null default now()
```

There's only one active campaign at a time per the requirements. Enforce this with a partial unique index:
```sql
create unique index one_active_campaign on campaigns (active) where active = true;
```

### `admin_users`
```
id        uuid PK references auth.users(id)
email     text not null
created_at timestamptz default now()
```

Admins are seeded manually — no self-signup flow. Provide a `seed_admin.sql` migration that inserts by email.

### Row-Level Security

Enable RLS on every table. Policies:

- **clippers**: a clipper can `select` and `update` their own row (where `id = auth.uid()`). Admins can do everything.
- **clips**: a clipper can `select` and `insert` their own; updates and deletes are admin-only. Admins can do everything.
- **clip_impression_snapshots**: clippers can `select` rows where the parent clip is theirs. Inserts only via service role. Admins can `select` all.
- **payouts**: clippers can `select` their own. All writes admin-only.
- **campaigns**: read for everyone authenticated; write admin-only.
- **admin_users**: admin-only.

The cron worker uses the Supabase service-role key and bypasses RLS.

---

## 4. Authentication

Two paths — **magic link** and **X OAuth**. Both result in a `clippers` row plus a Supabase `auth.users` row.

### Magic link flow

Standard Supabase Auth flow. After the user clicks the link and lands back in-app:

1. If no `clippers` row exists for `auth.user.email`, send the user to `/onboarding` to enter their X handle
2. On submit, validate handle is unique (case-insensitive), create the `clippers` row with `auth_method = 'magic_link'`, redirect to `/dashboard`
3. If a `clippers` row exists, go straight to `/dashboard`. If `banned = true`, sign them out and show a "this account is suspended" message

### X OAuth 2.0 flow

X OAuth is *not* native to Supabase Auth, so we wire it ourselves:

1. App redirects to `https://twitter.com/i/oauth2/authorize` with PKCE, scopes `users.read tweet.read offline.access`
2. Callback at `/api/auth/x/callback` exchanges the code for tokens
3. We call `GET /2/users/me` to get `id` and `username`
4. We then sign the user into Supabase via `supabase.auth.admin.generateLink({ type: 'magiclink', email: synthEmail })` — but for X-only users we use a real email if we can collect one, otherwise generate `${x_user_id}@x-clipper.local` and ask them to add a real email later in Settings (this is fine — we don't email them in v1)
5. Create or update the `clippers` row with `x_user_id`, `x_handle`, `auth_method = 'x_oauth'`
6. Redirect to `/dashboard`

Store X tokens? No — we don't need them after signup. We use our own bearer token (twitterapi.io key) for impression polling. The X OAuth is just to *prove handle ownership*.

### Admin auth

Admins sign in via the same magic-link flow. After auth, we check `admin_users` for their `auth.uid()`. If present, route to `/admin`. If not, route to `/dashboard` like a normal clipper. If they have no `clippers` row yet, dead-end at `/admin` only — they don't need a clipper profile.

---

## 5. X Data Integration

### Provider

**Primary: twitterapi.io.** Pay-as-you-go, ~$0.05 per 1,000 tweet lookups, no monthly minimum, no approval needed. Single endpoint we care about:

```
GET https://api.twitterapi.io/twitter/tweets?ids=<tweet_id>
Authorization: Bearer <KEY>
```

Returns the tweet object including `public_metrics.impression_count`, `author_id`, `author.username`.

### Adapter pattern

Wrap all X calls in `lib/x-provider.ts`:

```ts
export interface XProvider {
  getTweet(tweetId: string): Promise<{
    tweetId: string;
    authorUsername: string;
    authorId: string;
    impressionCount: number | null; // null if not visible (very old tweet, deleted, etc)
    createdAt: string;
    deleted: boolean;
  }>;
}
```

Two implementations: `TwitterApiIoProvider` and `XOfficialProvider` (stub for later). Pick via env var `X_PROVIDER`.

### Validation on submit

When a clipper submits a URL:

1. Parse the URL — accept `x.com`, `twitter.com`, `mobile.twitter.com`. Extract `username` and `tweet_id` via regex: `^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)`. Reject if it doesn't match.
2. Canonicalize the URL: always `https://x.com/<username>/status/<tweet_id>` for storage.
3. Check `clips.tweet_id` uniqueness — reject duplicate immediately.
4. Call `xProvider.getTweet(tweet_id)`.
5. Verify `authorUsername.toLowerCase() === clipper.x_handle.toLowerCase()`. If not, reject with "post must be from your linked handle."
6. If the tweet is deleted or unavailable, reject.
7. Insert the clip with `impressions = response.impressionCount ?? 0`, `tracking_until = now() + interval '<tracking_days> days'`. Insert a snapshot row with the same.

### Polling schedule

A Vercel Cron job runs every hour:

```
0 * * * * → /api/cron/poll-clips
```

The endpoint:

1. Verifies the cron secret in headers
2. Selects clips where `status = 'tracking'` AND `tracking_until > now()`
3. For each, decides whether to poll based on age:
   - Hour 0–6: poll every hour
   - Hour 6–24: poll every 3 hours
   - Day 2–7: poll every 6 hours
   - Skip if `last_polled_at` is too recent
4. Calls `xProvider.getTweet`. Handles errors (rate limit, 404 deleted tweet) gracefully — log, increment a failure counter, don't crash the batch.
5. Updates `clips.impressions`, `last_polled_at`, `poll_count`. Inserts a new `clip_impression_snapshots` row.
6. If the tweet is now deleted, set `status = 'rejected'`, `rejected_reason = 'tweet_deleted'`. We do not pay for deleted clips.

A separate cron at `0 1 * * *` runs `/api/cron/finalize-clips`:

1. Selects clips where `status = 'tracking'` AND `tracking_until <= now()`
2. Does one final poll
3. Sets `final_impressions = impressions`, computes `payout_amount = min((impressions/1000) * campaign.cpm_rate, campaign.max_payout_per_clip)`, sets `status = 'completed'`

### Cost guard

Track API call count per day in a simple table or in env-monitored counter. Soft-cap at $50/day spend (= 1M calls); alert admin email if exceeded. We won't hit this with reasonable clipper volume but worth having.

---

## 6. Pages & Routes

### Public

- `/` — landing page. Two CTAs: "Continue with X" → starts X OAuth. "Magic link via email" → email-input page.
- `/auth/magic` — email input → triggers Supabase magic link send → confirmation screen
- `/auth/callback` — Supabase auth callback handler
- `/api/auth/x/start` — kicks off X OAuth (PKCE)
- `/api/auth/x/callback` — handles X OAuth callback
- `/onboarding` — first-time magic-link users land here to enter their X handle

### Clipper (auth required, banned users blocked at middleware)

- `/dashboard` — KPI tiles + submit form + clips table + payout history
- `/dashboard/clips/[id]` — detail view of one clip with the impressions-over-time chart from snapshots
- `/dashboard/settings` — change email, view linked X handle (handle not editable after signup — that's a fraud vector)

### Admin (auth + `admin_users` membership required)

- `/admin` — overview: total impressions, total spend, total paid, outstanding, active clippers, leaderboard
- `/admin/clippers` — table of all clippers with ban/unban, mark-paid actions, CSV export
- `/admin/clippers/[id]` — single clipper detail: their clips, payout history, manual adjustments
- `/admin/clips` — table of all clips with filter/search; admin can override impressions or reject a clip
- `/admin/payouts` — log of all payouts with tx hashes and chain
- `/admin/payouts/new?clipper=...` — modal/page to record a payout (amount, chain, tx hash, note)
- `/admin/config` — campaign config editor (CPM, max payout, tracking days, name)

### API routes

- `POST /api/clips` — submit a clip. Body: `{ url }`. Auth: clipper. Returns clip or error.
- `GET /api/clips` — list current user's clips. Pagination via `?cursor=`.
- `GET /api/clips/[id]` — detail with snapshots.
- `POST /api/admin/clippers/[id]/ban` — body `{ banned: bool, reason?: string }`. Admin only.
- `POST /api/admin/clips/[id]/override` — body `{ impressions, reason }`. Admin only.
- `POST /api/admin/payouts` — body `{ clipper_id, amount, chain, tx_hash?, note? }`. Admin only.
- `GET /api/admin/export.csv` — accounting export. Admin only.
- `POST /api/cron/poll-clips` — header `x-cron-secret`. Internal.
- `POST /api/cron/finalize-clips` — header `x-cron-secret`. Internal.

All API routes use Zod schemas to validate request bodies.

---

## 7. UI / Design Direction

**Aesthetic:** terminal-influenced trading-desk dark theme. Dense data, monospace accents, sharp signal colors. Not generic SaaS.

**Color tokens:**
```
--bg:       #0a0a0b   (near-black)
--surface:  #0f0f12
--border:   #1f1f24
--border-2: #2a2a30
--text:     #e8e8ea
--text-2:   #9a9aa5
--text-3:   #5a5a65
--accent:   #b2ff59   (electric green — clipper / "go" / earnings)
--admin:    #ff9d59   (amber — admin context / spend)
--danger:   #ff5959
```

**Type:**
- Display headings: Instrument Serif (italic for emphasis)
- UI / labels / numbers / code: JetBrains Mono
- Body: Inter

**Layout patterns:**
- Top header bar: pulsing status dot + path-style breadcrumb in mono uppercase: `CLIPPER.OPS / @username`
- Stat tiles: 4-up grid, mono numbers, 10px uppercase labels, 1px gridline borders (use `bg-border` + `gap-px` trick)
- Data tables: 12-column grid, no zebra striping, mono numerics, hover bg `rgba(250,250,250,.02)`
- Forms: borderless inputs with bottom-border-on-focus in accent color
- Buttons: primary is accent-on-black, secondary is bordered ghost, destructive is danger-tinted ghost
- Progress bars: 1px tall, accent fill on border-color track
- All small labels are `mono text-[10px] tracking-widest text-[--text-3]` uppercase, often prefixed with `//`

**Use the React prototype as the source of truth for visuals.** The prototype is shipped as `clipper_app.jsx` — port its components into the Next.js app structure.

---

## 8. Business Rules — exhaustive list

These are non-negotiable. Encode each as a test.

1. **Handle match required.** `extractHandle(url) === clipper.x_handle` (case-insensitive). Reject otherwise.
2. **No duplicates.** `tweet_id` is globally unique across all clips. No clipper, including the original poster, can resubmit a tweet anyone has already submitted.
3. **No banned-clipper submissions.** Middleware blocks all routes except `/auth/*` and a "you are suspended" page.
4. **No edits to `x_handle` after signup.** Handle is locked. Admin can edit via direct DB if needed.
5. **No edits to a clip's URL after submit.** If wrong, reject and resubmit.
6. **Tracking window is `submitted_at + tracking_days`.** Computed at submit time and stored. Changing campaign config later does NOT change tracking windows of already-submitted clips.
7. **CPM rate and max-payout snapshot to the clip.** When a clip finalizes, payout is computed from the campaign config *as it stands at finalize time*. (Alt: snapshot at submit. Pick one and document it. Recommend: snapshot the rate and cap onto the clip row at submit time as `cpm_rate_snapshot` and `max_payout_snapshot` numeric columns. This protects clippers from mid-flight rate cuts. Add these columns to the schema in section 3.)
8. **Deleted tweets get rejected, not paid.** If a poll returns "not found," set status `rejected`, no payout.
9. **Outstanding balance = sum(completed payouts) − sum(payouts paid).** Always compute, never store.
10. **Admin override is logged.** Any impression override creates a snapshot with `source = 'admin_manual'` and writes `admin_override_reason`.
11. **No self-banning.** Admin cannot ban themselves.
12. **CSV export columns:** `email, x_handle, joined_at, total_clips, total_impressions, total_earned, total_paid, outstanding`.

---

## 9. Edge Cases & Error Handling

- **X API down or rate-limited.** Cron logs the failure, retries on next tick. Clipper-facing submit endpoint shows "X is temporarily unreachable, try again in a minute" rather than rejecting the clip.
- **Tweet has 0 impressions for the entire 7 days.** Payout is $0. Clip still finalizes and shows `completed`.
- **Clipper changes their X handle on X.com.** Their new posts will fail handle-match and be rejected. Show a clear error: "this post is from @newhandle but your linked handle is @oldhandle. Contact support to update." Don't auto-update — that's an account-takeover vector.
- **Tweet author username changes mid-tracking.** The author *id* is stable on X. Store `x_user_id` on submit and validate against that on subsequent polls instead of username.
- **Clipper submits a tweet from many days ago.** Allowed by default — the 7-day window starts from submission, not from tweet age. Document this. Add an admin config flag `max_tweet_age_days` if you want to restrict it later.
- **Two clippers claim ownership of the same handle.** Handle is unique at signup, so impossible after we have one of them. If someone signs up with a handle then a different person tries to OAuth into the same handle, the OAuth flow wins (because it proves ownership) — kick the magic-link signup, mark the new OAuth as canonical.
- **Magic link in spam.** Standard problem. Use a verified domain on Resend.
- **Impressions go down between polls.** X sometimes corrects metrics. Always store the latest poll, but if it's lower than a previous snapshot, log a warning. Use the *final* poll value (at tracking end) as the payout basis, not the max.

---

## 10. Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# X data
X_PROVIDER=twitterapi_io
TWITTERAPI_IO_KEY=

# X OAuth (for clipper sign-in)
X_OAUTH_CLIENT_ID=
X_OAUTH_CLIENT_SECRET=
X_OAUTH_REDIRECT_URI=https://yourdomain.com/api/auth/x/callback

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=auth@yourdomain.com

# Cron
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

---

## 11. Project Structure

```
/app
  /(public)/page.tsx                  -- landing
  /(auth)/auth/magic/page.tsx
  /(auth)/auth/callback/route.ts
  /(auth)/onboarding/page.tsx
  /(clipper)/dashboard/page.tsx
  /(clipper)/dashboard/clips/[id]/page.tsx
  /(clipper)/dashboard/settings/page.tsx
  /(admin)/admin/page.tsx
  /(admin)/admin/clippers/page.tsx
  /(admin)/admin/clippers/[id]/page.tsx
  /(admin)/admin/clips/page.tsx
  /(admin)/admin/payouts/page.tsx
  /(admin)/admin/config/page.tsx
  /api/auth/x/start/route.ts
  /api/auth/x/callback/route.ts
  /api/clips/route.ts
  /api/clips/[id]/route.ts
  /api/admin/clippers/[id]/ban/route.ts
  /api/admin/clips/[id]/override/route.ts
  /api/admin/payouts/route.ts
  /api/admin/export.csv/route.ts
  /api/cron/poll-clips/route.ts
  /api/cron/finalize-clips/route.ts
/components
  /ui/*                  -- StatCell, Button, Input, Table, Toast
  /clipper/*             -- SubmitClipForm, ClipsTable, KpiTiles
  /admin/*               -- ClippersTable, ClipsAdminTable, PayoutModal, ConfigForm
  Header.tsx
  AuthGate.tsx
/lib
  supabase/client.ts
  supabase/server.ts
  supabase/admin.ts
  x-provider/index.ts
  x-provider/twitterapi-io.ts
  x-provider/x-official.ts
  url-canonicalizer.ts
  payout-calc.ts
  validators.ts          -- Zod schemas
  csv.ts
/middleware.ts           -- ban check + admin route gating
/supabase
  /migrations/*.sql
  seed.sql
/vercel.json             -- cron config
```

---

## 12. Build Order

Do this in order. Each step should be runnable before moving to the next.

1. **Scaffold.** `npx create-next-app`, install deps, set up Tailwind, fonts, base layout. Drop in the design tokens from section 7. Build a `Header`, `StatCell`, `Button` in the prototype's style.
2. **Supabase.** Create project, run migrations for the schema in section 3 including RLS. Seed one campaign row.
3. **Magic-link auth + onboarding.** Get a clipper to the dashboard via email-only flow.
4. **Clipper dashboard skeleton.** Show empty state, wired to real DB. KPI tiles compute from queries.
5. **X provider + URL validator.** Build the adapter, hardcode `twitterapi.io`. Unit test the URL parser against a list of valid/invalid URLs.
6. **Submit clip flow.** End-to-end: form → API route → handle check → X API call → DB insert → snapshot insert. Show all 4 reject paths in the UI (invalid URL, duplicate, wrong handle, deleted tweet).
7. **Polling cron.** Implement `/api/cron/poll-clips` with the staggered schedule. Test by manually invoking with a real submitted clip. Verify snapshots accumulate.
8. **Finalize cron.** Build the daily finalizer. Backdate a test clip to verify it finalizes correctly.
9. **Clip detail page.** Render the snapshot history as a chart (recharts area chart, accent green fill).
10. **X OAuth.** Add the second auth path. Reuse the existing clipper-row creation logic.
11. **Admin scaffolding.** Middleware check, admin layout, overview page with the same totals queries.
12. **Admin clippers + ban.** Table, ban toggle, mark-paid action, CSV export.
13. **Admin clips + override.** Table, override modal that writes a manual snapshot and updates `clips.impressions`.
14. **Admin payouts log + new payout flow.** Modal to record a payout. Outstanding recomputes automatically.
15. **Admin config.** Editor for the active campaign's config.
16. **Hardening.** Rate-limit the submit endpoint (max 5/hour per clipper). Add Sentry. Add a basic dead-tweet detector test. Verify all RLS policies with a hostile-clipper test (try to read another clipper's clips, etc).
17. **Deploy.** Vercel + Supabase prod. Configure crons in `vercel.json`. Smoke-test all flows on prod.

---

## 13. What's Out of Scope for v1

Don't build these unless explicitly asked:

- Email notifications (clipper said no)
- Multi-campaign support (clipper said one forever)
- Automated payouts via Stripe / on-chain
- Content rules (hashtags, mentions) — any post counts
- Per-clipper monthly payout caps — only per-clip cap exists
- Clip-quality scoring or ML
- Public leaderboards visible to clippers
- Mobile native app
- Webhooks for clip status changes
- Self-serve admin signup

---

## 14. Definition of Done

The app is shippable when:

- [ ] A new clipper can sign up via X OAuth, link their handle, submit a clip, and see it tracking
- [ ] A new clipper can sign up via magic link, add their handle, submit a clip, and see it tracking
- [ ] A clip from the wrong handle is rejected with a clear error
- [ ] A duplicate `tweet_id` submission is rejected with a clear error
- [ ] An invalid URL is rejected with a clear error
- [ ] The hourly cron polls active clips and writes snapshots
- [ ] The daily cron finalizes clips at the 7-day mark and computes payout
- [ ] An admin can view total spend, total impressions, leaderboard
- [ ] An admin can ban a clipper, who is then blocked from submitting
- [ ] An admin can override a clip's impressions with a logged reason
- [ ] An admin can record a USDC payout with chain + tx hash
- [ ] An admin can export an accounting CSV
- [ ] All queries pass RLS (a hostile clipper cannot see another's data)
- [ ] All money arithmetic uses `numeric`, never JS floats
- [ ] Crons require the secret header
- [ ] Production is deployed on Vercel + Supabase with environment variables set

---

## 15. References for the Coding Agent

- The visual prototype lives at `clipper_app.jsx` (single React file using `window.storage`). Port its layout and components — but the data layer in the prototype is fake; replace with real Supabase queries.
- twitterapi.io docs: https://docs.twitterapi.io
- X OAuth 2.0 docs: https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/overview
- Supabase Auth (magic link): https://supabase.com/docs/guides/auth/auth-email-passwordless
- Vercel Cron: https://vercel.com/docs/cron-jobs

If anything in this spec is ambiguous or contradictory, stop and ask before guessing.
