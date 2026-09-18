# CoolRight

Air conditioning, heating and ventilation across London and the whole of the
South East.

One public website that turns a visitor into a quote request, and a staff area
behind a login that runs the business from that point on: leads, quotes, which
quotes converted, jobs, what each person earned, client records, staged
payments and monthly bank reconciliation.

No framework, no bundler, no build step at deploy time. Vercel serves `public/`
exactly as it sits on disk, and every generated page is committed to the repo.

This file is the reasoning, not just the instructions. In six months it is the
only thing stopping somebody undoing a decision that took a while to get right.

## Business facts, and what is still outstanding

`content/business.js` is the single source of truth. Anything not yet confirmed
is `null` there, and nothing is written into a page from a guess.

| Fact | State |
| --- | --- |
| Email | `team@coolright.co.uk` |
| Region | London and the whole of the South East |
| Accreditation | F-Gas registered |
| Phone number | to be confirmed |
| Google Business Profile | to be confirmed |

**Before launch, in this order:**

1. **The Google Business Profile.** Verified, complete, categories right,
   service areas listed, collecting reviews. For a local trade the profile
   outranks the website for "near me" intent, and the map pack is what wins it.
   If time is short, spend it here first. Then set `googleBusinessProfile` so
   the business schema can carry `sameAs`, which is the signal tying the site to
   the listing.
2. **The phone number.** Until it exists there is no `tel:` link anywhere, no
   call link in the header and no call button in the mobile bar. A test fails if
   one appears. Set `phone` and `phoneDisplay` and they all come back.
3. **Activate the email relay.** FormSubmit sends a one-off confirmation to
   `team@coolright.co.uk` on the first submission. Until somebody clicks it, no
   enquiry email is delivered. The enquiry is still stored either way.
4. **Real reviews**, copied by hand into `content/reviews.js`. Below five the
   section ships empty and hidden.
5. **The cost guide ranges** (see below), and the money settings in the staff
   area: partners, who takes the lead fee, the tax percentage, and the deposit
   practice if there is one.

## The cost guides, and why one is deliberately unpublished

The highest-intent searches in this trade are cost questions, and almost no
competitor answers them. `content/guides/air-conditioning-installation-cost.js`
is written except for the numbers, and the build **refuses to publish it** while
its `ranges` are null, saying so on every run.

Fill in, in whole pounds, ranges the business will actually honour:

- one wall-mounted split, straightforward room
- one split, awkward pipe route or difficult access
- two indoor units on a multi-split
- whole house, four to five indoor units

Never publish a range you would not honour. These pages are worth more than any
other page on the site, and worth exactly nothing the first time a reader finds
the real quote is double the page.

## Running it

```
npm install
npm run migrate        # applies db/schema.sql, safe to re-run
npm run build          # generates pages, injects the blocks, stamps assets
npm run check:emdash   # house rule, enforced
npm test               # unit tests, plus integration tests against Postgres
node db/create-user.js someone@example.com
```

`npm run build` is an authoring tool, not a deploy step. Run it after editing
anything in `content/`, `scripts/book-form.js` or `public/assets/`, and commit
what it writes. CI fails if a committed page is stale.

Integration tests need `TEST_DATABASE_URL` pointing at a real Postgres. Without
it those files skip rather than fail; CI supplies one.

## Layout

```
public/    the site, served as it sits, generated HTML committed
  staff/   login, then four tabs behind it
api/       serverless functions, ten of them
lib/       db, http, validation, throttles, attribution, session, money,
           metrics, pipeline, bank, and the route handlers
content/   the words: business facts, services, guides, FAQs, hubs, reviews
db/        schema.sql, the migration runner, the create-user script
scripts/   the build and its generators
test/      node:test, run one file at a time against real Postgres
```

## Decisions worth not undoing

### The site

- **Clean URLs and nothing else.** `vercel.json` sets `cleanUrls` and
  `trailingSlash: false`. That is the whole routing layer. A rewrite would not
  fire anyway, because rewrites are evaluated after the filesystem.
- **Every word is in the markup.** Sections are generated into committed HTML,
  never assembled from an array in the browser. Google renders JavaScript; most
  AI crawlers do not. The services tab strip hides eight pre-rendered panels
  rather than writing one.
- **The directory is the list.** `content/services/` and `content/guides/` read
  their own folders, so there is no register to update and no way to write a
  page and leave it unpublished.
- **The build refuses a thin page.** Every service page carries at least 250
  words true only of itself. A thin page drags the whole site down, not just
  itself, so nothing is written if any file fails.
- **No area pages.** They work where the building stock genuinely differs. A
  split unit in Croydon behaves like one in Bromley, so pages that differed only
  by the town name would be the doorway page pattern, which Google demotes and
  which takes the rest of the site with it.
- **One header, one action bar.** Both are generated from `scripts/chrome.js`
  into the home page and every generated page, so the two cannot drift. The
  header is one row at every width: brand and tagline, then the hamburger
  labelled "Menu", then the way to contact the business. The primary call to
  action is deliberately not in the mobile header; it lives in the fixed bar at
  the bottom, where a thumb already is. Putting it in the header is what pushed
  this site onto two rows and made it look unlike its siblings.
- **One self-hosted variable font**, Manrope, 25KB, preloaded, licence
  committed beside it. Not Google Fonts: that puts a DNS lookup, a TLS
  handshake and two round trips to somebody else's server in front of first
  paint. If the other sites in this family use a specific licensed typeface,
  swap the file and the `font-family` and everything follows.
- **Immutable assets need content hashes.** `/assets` is served for a year, so
  every js, css and font reference is stamped by the build and a test fails when
  a stamp is stale. Stylesheets are stamped before the hashes are taken, so a
  changed font changes the css, which changes every page.
- **No aggregateRating, ever**, and no star average or review count in the
  visible copy. Ratings aggregated from another site are not eligible for
  Google's review snippets and marking one up risks a manual action.
- **One group in robots.txt.** Adding a named group for a crawler makes that
  crawler ignore the wildcard group entirely, so the disallows stop applying to
  it. AI crawlers are allowed on purpose.

### The enquiry

- **One implementation of the quote form.** Generated into every page between
  markers. Two hand-written copies drift, and you find out when a field added to
  one is missing from the other.
- **The held partial.** Passing step one arms a partial, held and sent only on
  genuine abandonment: 45 seconds hidden, or 3 minutes idle with the form open.
  Submitting cancels it, and the server drops a partial that lands after a
  completion. One visitor is one enquiry. This is where a large share of the
  value of the build sits: most trade sites lose the visitor who fills in half a
  form.
- **The email relay is posted from the browser.** FormSubmit and most relays sit
  behind Cloudflare, which answers a server-to-server request with a bot
  challenge and a 403 rather than sending anything. A blocked browser costs the
  email and never the enquiry, and `/api/notified` records which happened.
- **A file never costs somebody an enquiry.** Uploads run on submit, one at a
  time, direct to blob storage where possible and proxied under 4MB where not.
  Photos are re-encoded to 2000px, PDFs are sent untouched, and a failure is a
  note on the confirmation rather than an error to fix.
- **Never a raw IP.** `sha256(ip + IP_SALT)`, nowhere else, ever. Without the
  salt a sha256 of an IPv4 is brute-forced in seconds, so `ipHash` returns null
  rather than pretending.
- **Throttles live in the database.** Serverless instances do not share memory,
  so an in-process counter is bypassed across cold starts. Leads and events fail
  open, because a database blip must not stop the phone ringing. Logins fail
  closed, per address and globally, because a per-address limit alone still lets
  a pool of addresses walk a small keyspace.
- **Attribution is derived on the server.** A field the browser can set is a
  field a bot can set. Referrer hosts match on label boundaries, and webmail is
  tested before search because `mail.google.com` contains "google".
- **Ten serverless functions.** A Hobby deployment takes twelve, and going over
  fails at the deploy step rather than the build, with a log that ends cleanly.
  Related routes group behind `api/admin/[action].js` and `api/auth/[action].js`
  with handlers in `lib/routes/`.

### The money

- **Integer pence everywhere.** Pounds are a display format converted at the
  edge of the browser. Floating point cannot hold 0.15 exactly and a chain of
  percentage steps drifts away from what anyone was paid. Rounding takes halves
  away from zero, and the odd penny goes to the first partner in whichever
  direction the amount points, so payouts always add back to exactly what the
  job distributes. Tested across a couple of hundred combinations, including
  jobs that lost money, which split negative and are shown that way.
- **The lead fee comes after tax and after materials.** On a £4,000 job with
  £1,500 of materials it is 15% of (£4,000 less tax less £1,500), not of £4,000.
  A split that ignores materials pays people out of money that has already gone
  to a merchant.
- **Materials not known is not zero.** The card says so rather than distributing
  money that has already been spent.
- **A job stores the rates it was agreed at.** Raising a percentage next month
  must not silently rewrite what everyone earned last month. Editing a job keeps
  its original rates; only a new job takes today's.
- **Payments are a list, not two tick boxes**, and paid in full is computed from
  them rather than being a flag somebody remembers to set. A deposit is never
  derived from the price: that is a fixed-price convention and it does not
  survive contact with quoted work.
- **The pipeline is one table.** quoted, booked, completed, declined, cancelled.
  Reusing one table keeps the client record, the photos and the address attached
  all the way through, and means no data moves when a quote is won. A declined
  quote must record why, from a short list. It is the most valuable field in the
  database and the one most often omitted.
- **Conversion is measured against decided quotes**, not against every quote
  sent, so yesterday's undecided quote does not read as a loss.

### The bank

- **Read the CSV by column name, never by position**, trying each field's known
  aliases, because banks rename and reorder columns. Fees are folded into the
  amount so a line is the money that actually moved. Pending, declined and
  foreign-currency lines are skipped: a pending line can still change and would
  import again, differently, next month. Every line is fingerprinted, so
  overlapping months never double up.
- **A line is matched or split, never both.** Money in scores against the
  *outstanding* amount on open jobs, so a £1,200 line matches the deposit on a
  £4,800 job. Automatic only when one candidate clearly wins and beats the
  runner-up outright; anything closer is a suggestion for a person to confirm,
  because a wrong match marks the wrong customer as paid.
- **Spend can be assigned to a job as a materials cost**, which is what makes
  that job's margin real rather than notional.
- **It learns.** A decision is stored against the description with its numbers
  stripped, and applied to untouched lines with that key. A choice made by hand
  is never overwritten by a rule learned elsewhere, which is what
  `category_kind` and `split_kind` are for.
- **The balance identity holds or it does not.** The route tests assert the two
  sides agree after every operation they perform. The only line that can be
  nonzero once everything is allocated is the difference, which is where a
  cash-paid job or an overpayment shows up rather than vanishing.

### The staff area

- **One shared access code**, leaning on the throttles rather than on the code's
  strength. Unknown and wrong do the same work and return the same message. The
  cookie is signed rather than encrypted: it holds nothing secret, and the
  signature stops it being edited. It is verified in constant time.
- **Know the trade-off:** one code means no per-person audit trail, and every
  log line says "somebody who knew the code". `staff_users` and
  `db/create-user.js` exist so moving to per-person accounts is a route change
  and not a migration.
- **Every cell is built with textContent.** Lead notes, referrers and campaign
  names are visitor-supplied, so rendering them as markup would make the
  dashboard a stored XSS sink. CSV export prefixes any cell starting with `=`,
  `+`, `-` or `@` so a note cannot become a spreadsheet formula.
- **Every count is aggregated in SQL.** Nothing pulls a table into JavaScript to
  count it.
- **Staff sign-ins are excluded from every visitor metric**, or each one
  registers as a phantom session and dilutes the conversion rates.
- **A client card is a view, not a table.** It is the job joined to the lead it
  came from, so the address, phone and photographs are on it without anyone
  typing them twice. Archiving is a view too: a date that has passed may have
  been rescheduled rather than worked. A completed card with money outstanding
  stays visible whatever its date.

### Operational

- **Apply a schema change before merging the code that needs it.** Vercel
  deploys on the push and CI applies the schema a minute or two later. In
  between, new code runs against the old table, and on the lead endpoint that
  means enquiries answered with a 500.
- **No third-party analytics, no advertising cookies, no cross-site tracking.**
  The only cookie the site sets is the staff session. A test fails if anything
  loads from a third party.
- **`actions/checkout` leaves its credentials in the clone**, so
  `persist-credentials: false` is set where CI pushes.
- **A monthly cron sweeps blobs** uploaded but never attached to a lead, so an
  abandoned form does not leave a file paying rent for ever.

## Environment

```
DATABASE_URL          Neon pooled connection string (its host contains -pooler)
IP_SALT               required before any address hashing is meaningful
STAFF_ACCESS_CODE     the code typed at /staff
SESSION_SECRET        signs the staff cookie; rotating it signs everyone out
ADDRESS_API_KEY       optional, postcode lookup
BLOB_READ_WRITE_TOKEN optional, attachments
CRON_SECRET           optional, the monthly blob sweep
GOOGLE_MAPS_API_KEY   optional, live reviews
GOOGLE_PLACE_ID       optional, this business's listing
```

Five runtime dependencies and no more: the Neon driver, argon2, `@vercel/blob`
and `dotenv`. `pg` is a dev dependency used only by the tests and the scripts.
