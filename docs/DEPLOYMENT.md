# DEPLOYMENT.md

**Status:** written, **never run**. Everything below is reasoned from the code and
verified as far as it can be without an account; the deployment itself has not
happened. Expect the first attempt to need corrections.

`REQUIREMENTS.md` §9 lists deployment as protected, never cut.

---

## 1. Shape

One Vercel project serves both halves:

```
  /            → client/dist        static React build
  /api/v1/*    → api/index.js       the Express app, as a serverless function
```

One origin, so **CORS never applies in production**. The CORS middleware in the
app exists for development, where the client is on `:5173` and the API on
`:8787`.

The API is the same Express application either way. `server/src/app.ts` exports
it; `serve.ts` listens with it locally, and `api/index.js` hands it to Vercel.
Nothing about the routes, validation or database access differs.

**Why serverless rather than a Node service.** Free-tier containers sleep, and a
cold start of thirty to fifty seconds on the first request of the day is the
failure `API_SPEC.md` §14 was already worried about. Serverless cold starts are
under a second.

## 2. Accounts needed

Three, all free.

| Service | For | What to copy out |
|---|---|---|
| **Neon** | Postgres | The connection string |
| **Vercel** | Hosting | Nothing — connect the GitHub repo |
| **Clerk** | Authentication | Publishable key, and the JWKS URL |

**Clerk is not optional in production.** The local account system produces a
development token that the server refuses unless `NODE_ENV=development`, so
without Clerk nobody can sign in to the deployed app — including you.

## 3. Database

1. Create a Neon project. Copy the pooled connection string.
2. Run the migrations and seed against it from your machine, once:

```sh
cd server
DATABASE_URL="<neon connection string>" npm run migrate
DATABASE_URL="<neon connection string>" npm run seed
```

The seed is idempotent, so re-running it after a content change updates in
place. It does **not** overwrite `gate_threshold` or `is_measured`, so measured
values survive a reseed (`DATA_MODEL.md` §3.2).

One thing to know before there are real users: the seed deletes and recreates
each course's modules, and lessons cascade from modules while progress cascades
from lessons. **Reseeding wipes learner progress.** Harmless now; not harmless
later, and the fix is to diff the outline rather than replace it.

## 4. Clerk

1. Create an application.
2. Copy the publishable key (`pk_live_…`).
3. Under **Configure → Sessions**, edit the session token and add an email claim:
   ```
   "email": "{{user.primary_email_address}}"
   ```
   Clerk does not send one by default, and `API_SPEC.md` §3.1 provisions the user
   row from it. Without this every request fails authentication — the server's
   401 names this specific fix, so the symptom is legible.
4. Note the Frontend API URL. The JWKS URL is that plus
   `/.well-known/jwks.json`, and the issuer is the URL itself.

## 5. Vercel

Import the GitHub repository. The build is configured in `vercel.json`; no
framework preset is needed.

Environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | The Neon connection string |
| `AUTH_JWKS_URL` | `https://<frontend-api>/.well-known/jwks.json` |
| `AUTH_ISSUER` | `https://<frontend-api>` |
| `AUTH_AUDIENCE` | *leave empty* — Clerk sets no audience by default |
| `NODE_ENV` | `production` |
| `COVERAGE_THRESHOLD` | `0.5` |
| `VITE_CLERK_PUBLISHABLE_KEY` | The publishable key |

`AUTH_DEV_MODE` must be **absent or false**. The server refuses to start with it
enabled outside development, which is deliberate — it is the one guard stopping
an unauthenticated build from shipping.

`VITE_API_BASE` is not set. The client resolves its API base from the origin:
localhost in development, same-origin otherwise.

## 6. Checking it worked

```sh
curl https://<your-deployment>/api/v1/healthz
# {"status":"ok","db":"ok"}
```

`db: "unreachable"` means the process is alive and Postgres is not — almost
always a wrong or unpooled `DATABASE_URL`.

Then open the site: it should show Clerk's sign-in rather than the local form. If
you get the local form, `VITE_CLERK_PUBLISHABLE_KEY` did not reach the build —
Vite inlines it at build time, so it must exist *before* the build, and changing
it needs a redeploy rather than a restart.

## 7. Known risks on the first attempt

Listed so a failure is recognisable rather than mysterious.

- **The function may not find `server/dist`.** `api/index.js` imports compiled
  output from outside its own directory. Vercel traces imports and should include
  it, but this is the step most likely to need adjusting — possibly by bundling
  the server into `api/` instead.
- **Neon's pooled connection string** is the one to use. The direct one exhausts
  connections quickly under serverless, where each invocation may open its own.
- **`npm ci` in the build command** requires both lockfiles to be current. They
  are committed and were regenerated when Clerk and VexFlow were added.
- **Migrations do not run automatically.** Step 3 is manual and must happen
  before the first request, or every endpoint returns a database error.
