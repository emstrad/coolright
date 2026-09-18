-- CoolRight schema. Idempotent by construction: this file only ever adds
-- tables, columns and indexes, so CI can re-run it on every merge and a second
-- run is a no-op rather than a data loss event.
--
-- Apply a change here BEFORE merging the code that needs it. Vercel deploys on
-- the push and CI applies the schema a minute or two later; in between, new
-- code runs against the old table, and on the lead endpoint that means
-- enquiries answered with a 500.

CREATE TABLE IF NOT EXISTS leads (
  id            bigserial PRIMARY KEY,
  session_id    text NOT NULL,
  -- 'partial' is armed at step one and flushed only on genuine abandonment;
  -- 'complete' is a submitted form. One row per pair, so a visitor who
  -- abandons and then returns and submits is one enquiry, not two.
  stage         text NOT NULL CHECK (stage IN ('partial', 'complete')),
  name          text,
  email         text,
  phone         text,
  postcode      text,
  -- Address fields stay nullable: a partial never reaches step three.
  address_line  text,
  town          text,
  property_type text,
  job_types     text[] NOT NULL DEFAULT '{}',
  notes         text,
  files         text[] NOT NULL DEFAULT '{}',
  channel       text,
  referrer_host text,
  landing_path  text,
  device        text,
  utm           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Never the address itself: sha256(ip + IP_SALT), and nowhere else.
  ip_hash       text,
  user_agent    text,
  -- The email relay is posted from the browser, so the outcome has to be
  -- reported back rather than known server side.
  notified_at   timestamptz,
  notify_error  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_session_stage_key
  ON leads (session_id, stage);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON leads (stage, created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id          bigserial PRIMARY KEY,
  session_id  text NOT NULL,
  -- Constrained so an unknown event name cannot be stored and quietly rot the
  -- dashboard's counts.
  type        text NOT NULL CHECK (type IN (
                'page_view', 'form_start', 'step_complete', 'field_error',
                'call_click', 'submit', 'submit_error', 'upload',
                'staff_login', 'staff_login_failed'
              )),
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  path        text,
  channel     text,
  referrer_host text,
  device      text,
  utm         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Back-filled when a complete lead lands in the same session. That is how an
  -- enquiry gets credited to the channel that produced it.
  lead_id     bigint REFERENCES leads (id) ON DELETE SET NULL,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_session_idx ON events (session_id, created_at);
CREATE INDEX IF NOT EXISTS events_type_idx ON events (type, created_at DESC);
CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at DESC);

CREATE TABLE IF NOT EXISTS staff_users (
  id            bigserial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  -- argon2id. No seeded account and no default password: rows arrive only from
  -- the CLI script.
  password_hash text NOT NULL,
  display_name  text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS rate_hits (
  -- Counters live in the database, not in process memory: serverless instances
  -- do not share memory, so an in-process counter is bypassed by spreading
  -- requests across cold starts.
  bucket     text NOT NULL,
  key        text NOT NULL,
  window_start timestamptz NOT NULL,
  hits       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_hits_window_idx ON rate_hits (window_start);

-- ---------------------------------------------------------------------------
-- The back office. Added in one pass so the schema is applied before any of the
-- code that needs it, which is the order that keeps enquiries from meeting a
-- table that is not there yet.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS job_types (
  -- Labels with no price. There is no rate card, because every job is quoted.
  -- The type exists so the jobs list can be filtered and reported by it.
  key      text PRIMARY KEY,
  label    text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS job_settings (
  -- One row, id fixed at 1.
  id               integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tax_percent      numeric(5,2) NOT NULL DEFAULT 20,
  lead_fee_percent numeric(5,2) NOT NULL DEFAULT 15,
  lead_fee_to      text,
  worker_fee_to    text,
  partners         text[] NOT NULL DEFAULT '{}',
  deposit_percent  numeric(5,2),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO job_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS jobs (
  id             bigserial PRIMARY KEY,
  lead_id        bigint REFERENCES leads (id) ON DELETE SET NULL,
  -- One row per piece of work, from quote through to completion. Reusing one
  -- table rather than a separate quotes table keeps the client record, the
  -- photos and the address attached all the way through, and means no data
  -- moves when a quote is won.
  status         text NOT NULL DEFAULT 'quoted'
                 CHECK (status IN ('quoted', 'booked', 'completed', 'declined', 'cancelled')),
  customer_name  text NOT NULL,
  phone          text,
  email          text,
  address_line   text,
  town           text,
  postcode       text,
  job_type       text REFERENCES job_types (key),
  description    text,
  worker         text,
  -- Integer pence everywhere. Floating point cannot hold 0.15 exactly, and a
  -- chain of percentage steps in floats drifts away from what anyone was paid.
  price_pence    bigint NOT NULL DEFAULT 0,
  costs_pence    bigint,          -- null means not known yet, which is not zero
  quoted_on      date,
  quote_expires  date,
  job_date       date,
  completed_on   date,
  -- Why a quote was lost. The most valuable field in the database and the one
  -- most often omitted.
  declined_reason text CHECK (declined_reason IN
                    ('price', 'timing', 'went elsewhere', 'no longer needed', 'no reply')),
  -- A job stores the rates it was agreed at rather than deriving them from
  -- today's settings at read time. Raising a percentage next month must not
  -- silently rewrite what everyone earned last month.
  tax_percent      numeric(5,2) NOT NULL DEFAULT 20,
  lead_fee_percent numeric(5,2) NOT NULL DEFAULT 15,
  lead_fee_to      text,
  worker_fee_pence bigint NOT NULL DEFAULT 0,
  partners         text[] NOT NULL DEFAULT '{}',
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_quoted_idx ON jobs (quoted_on DESC);
CREATE INDEX IF NOT EXISTS jobs_date_idx ON jobs (job_date);
CREATE INDEX IF NOT EXISTS jobs_lead_idx ON jobs (lead_id);

CREATE TABLE IF NOT EXISTS job_payments (
  -- A list, not two tick boxes. A quoted trade takes a deposit, sometimes a
  -- stage payment or two, then a balance, and the amounts are whatever was
  -- agreed rather than half the price.
  id            bigserial PRIMARY KEY,
  job_id        bigint NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  amount_pence  bigint NOT NULL,
  paid_on       date NOT NULL,
  label         text NOT NULL DEFAULT 'stage'
                CHECK (label IN ('deposit', 'stage', 'balance', 'retention')),
  note          text,
  -- Set when the payment came from a matched bank line, so unmatching can
  -- remove exactly what matching created.
  bank_transaction_id bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_payments_job_idx ON job_payments (job_id, paid_on);

CREATE TABLE IF NOT EXISTS bank_statements (
  id          bigserial PRIMARY KEY,
  filename    text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  rows_total  integer NOT NULL DEFAULT 0,
  rows_new    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id            bigserial PRIMARY KEY,
  statement_id  bigint REFERENCES bank_statements (id) ON DELETE CASCADE,
  -- The bank's own id where the export has one, otherwise date, amount,
  -- description and running balance hashed together, so overlapping months
  -- never double up.
  fingerprint   text NOT NULL UNIQUE,
  happened_on   date NOT NULL,
  description   text NOT NULL,
  -- Signed, and any fee already folded in, so a line is the money that
  -- actually moved.
  amount_pence  bigint NOT NULL,
  category      text,
  category_kind text CHECK (category_kind IN ('guessed', 'learned', 'manual')),
  split         jsonb,
  split_kind    text CHECK (split_kind IN ('guessed', 'learned', 'manual')),
  job_id        bigint REFERENCES jobs (id) ON DELETE SET NULL,
  job_kind      text CHECK (job_kind IN ('suggested', 'learned', 'manual')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_tx_date_idx ON bank_transactions (happened_on DESC);
CREATE INDEX IF NOT EXISTS bank_tx_job_idx ON bank_transactions (job_id);

CREATE TABLE IF NOT EXISTS bank_rules (
  -- What the page learns. The key is the description with its numbers
  -- stripped, so "TRAVIS PERKINS 1234" and "... 5678" share one.
  key         text PRIMARY KEY,
  category    text,
  split       jsonb,
  job_id      bigint REFERENCES jobs (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
