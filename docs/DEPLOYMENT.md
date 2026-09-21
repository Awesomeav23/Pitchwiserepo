# DEPLOYMENT.md

**Status:** **run, 21 September 2026.** Live at https://pitchwiserepo.vercel.app
on Vercel, Neon and Clerk. What follows is no longer reasoned from the code — it
is what happened, corrected where the reasoning had been wrong. §7 records the
three things that actually cost a deploy cycle, which is the part worth reading
first.

`REQUIREMENTS.md` §9 lists deployment as protected, never cut.

---

## 1. Shape

One Vercel project serves both halves:

```
  /            → client/dist        static React build
  /api/v1/*    → api/index.js       the Express app, as a serverless function
```

That second line needs a rewrite in `vercel.json` and does not work without one:

```json
"rewrites": [{ "source": "/api/(.*)", "destination": "/api" }]
```

Vercel's filesystem convention exposes `api/index.js` at exactly `/api`, while
the Express app inside mounts its router at `/api/v1`. Without the rewrite every
real request matches no function and no static file, and Vercel answers with its
own 404 **HTML** page, which the client then fails to parse as JSON. The symptom
names a character rather than a cause:

```
Unexpected token 'T', "The page c"... is not valid JSON
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

**Environment variables apply to new deployments, not to running ones.** Adding
or changing any of the above has no effect until something builds again — a
push, or Redeploy in the dashboard. This is easy to misread as the variable not
having been saved. `VITE_CLERK_PUBLISHABLE_KEY` is stricter still: Vite inlines
it into the bundle at build time, so it must exist *before* the build, and
changing it needs a rebuild rather than a restart.

**Clerk runs on a development instance here**, and that is the right choice
rather than a shortcut. A Clerk *production* instance requires DNS records on a
domain you own, which a `vercel.app` subdomain cannot provide. Development
instances work on any domain; `pk_test_…` is the key to use. Moving to a
production instance is a step for a custom domain, not for going live.

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

## 7. What actually went wrong

The first deployment took three cycles. All three were avoidable and are fixed;
they are recorded because each one presented as something other than its cause.

- **The `/api` rewrite was missing** (§1). Every API call returned Vercel's 404
  HTML. Fixed in `vercel.json`. This was the one genuine bug in the deployment
  configuration, and it had gone unnoticed precisely because this file had never
  been run.
- **A crash before the handler existed could only report itself as `500`.** The
  app reads configuration at import time and throws on anything missing —
  deliberately, per `lib/config.ts`. Under a serverless runtime that throw
  happens before any handler is registered, so the platform has nothing to
  report but `FUNCTION_INVOCATION_FAILED` and the reason is visible only in a
  dashboard. `api/index.js` now imports dynamically inside the handler and
  returns the cause as JSON:

  ```
  {"error":{"code":"server_misconfigured",
            "message":"Missing required environment variable DATABASE_URL"}}
  ```

  Every remaining step was then diagnosable with `curl`. Keep this property: a
  deployment that cannot say what is wrong with it costs more than the guard is
  worth.
- **Environment variables do not apply to running deployments** (§5). Twice this
  looked like a value had not saved when it simply had not been rebuilt.

**The risk that did not materialise.** `api/index.js` imports compiled output
from outside its own directory, and this file previously called that the step
most likely to need adjusting. Vercel's tracing includes `server/dist` without
help. The guarded import above reports `server_build_missing` if that ever stops
being true, so it will be recognisable rather than mysterious.

Still true, and still worth knowing:

- **Neon's pooled connection string** is the one to use — the hostname contains
  `-pooler`. The direct one exhausts connections quickly under serverless, where
  each invocation may open its own.
- **`npm ci` in the build command** requires both lockfiles to be current.
- **Migrations do not run automatically.** Step 3 is manual and must happen
  before the first request, or every endpoint returns a database error. Signing
  in counts as a request: `middleware/auth.ts` provisions a user row on the
  first authenticated call, so an unmigrated database fails at sign-in and looks
  like an authentication problem.
