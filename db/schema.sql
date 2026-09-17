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
