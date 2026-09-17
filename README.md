# CoolRight

Air conditioning, heating and ventilation across London and the South East.
One public site that turns a visitor into a quote request, and a staff area
behind a login that runs the business from that point on.

No framework, no bundler, no build step at deploy time. Vercel serves `public/`
exactly as it sits on disk, and generated HTML is committed to the repo.

## Where the build has got to

| Stage | State |
| --- | --- |
| 1. Routing, headers, stub home page | done |
| 2. Schema, lib, lead / event / health API | done |
| 3. The three step quote form and client scripts | next |
| 4. Full home page content | not started |
| 5 to 12. Staff area, pipeline, money, content, bank, SEO | not started |

## Layout

```
public/    the site, served as it sits
api/       serverless functions
lib/       db, http, validation, throttles, attribution
db/        schema.sql and the migration runner
scripts/   build and check tooling
test/      node:test, run one file at a time against real Postgres
```

## Running it

```
npm install
npm run migrate        # applies db/schema.sql, safe to re-run
npm run check:emdash   # house rule, enforced
npm test               # unit tests always, integration tests when a database is set
```

Integration tests need `TEST_DATABASE_URL` pointing at a local Postgres. Without
it those files skip rather than fail, and CI supplies one.

## Decisions worth not undoing

- **Clean URLs and nothing else.** `vercel.json` sets `cleanUrls` and
  `trailingSlash: false`. That is the whole routing layer: no middleware, no
  rewrites, one URL per page. A rewrite would not fire anyway, because rewrites
  are evaluated after the filesystem.
- **Functions are rationed.** Vercel counts one serverless function per file
  under `api/`, and a Hobby deployment takes twelve. Going over fails at the
  deploy step, not the build, and the log ends cleanly. Related routes group
  behind a bracketed dynamic segment with handlers in `lib/routes/`.
- **Immutable assets are only safe with content hashes.** `/assets` is served
  for a year, so every js and css reference gets stamped by the build and a test
  fails when a stamp is stale.
- **Never a raw IP.** `sha256(ip + IP_SALT)`, nowhere else, ever. Without the
  salt a sha256 of an IPv4 is brute-forced in seconds, so `ipHash` returns null
  rather than pretending.
- **Throttles live in the database.** Serverless instances do not share memory,
  so an in-process counter is bypassed by spreading requests across cold starts.
  Leads and events fail open, because a database blip must not stop the phone
  ringing. Logins fail closed.
- **Attribution is derived on the server.** A field the browser can set is a
  field a bot can set. Referrer hosts match on label boundaries, and webmail is
  tested before search because `mail.google.com` contains "google".
- **One enquiry per visitor.** Leads are unique on `(session_id, stage)`, a
  partial that lands after a completion is dropped, and a completed lead
  back-fills its id onto that visit's events so the work is credited to the
  channel that produced it.
- **No third party analytics, no advertising cookies.** The only cookie the site
  sets is the staff session.
- **Apply a schema change before merging the code that needs it.** Vercel deploys
  on the push and CI applies the schema a minute or two later. In between, new
  code runs against the old table.

## Environment

```
DATABASE_URL          Neon pooled connection string (its host contains -pooler)
IP_SALT               required before any address hashing is meaningful
STAFF_ACCESS_CODE     the code typed at /staff            (stage 5)
SESSION_SECRET        signs the staff cookie               (stage 5)
ADDRESS_API_KEY       optional, postcode lookup
BLOB_READ_WRITE_TOKEN optional, attachments
CRON_SECRET           optional, the monthly blob sweep
GOOGLE_MAPS_API_KEY   optional, live reviews
GOOGLE_PLACE_ID       optional, this business's listing
```
