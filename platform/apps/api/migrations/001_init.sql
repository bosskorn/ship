-- 001_init: core marketplace schema
-- Conventions:
--   * UUID primary keys (gen_random_uuid)
--   * Money: NUMERIC(14,2) in THB. Application code works in integer satang.
--   * Geography: PostGIS geography(Point,4326) for points, geometry(MultiPolygon,4326) for zones.
--   * Timestamps: timestamptz.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- identity
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role            text NOT NULL CHECK (role IN ('CUSTOMER','DRIVER','OPS','ADMIN')),
  phone           text,
  email           text,
  password_hash   text,
  totp_secret_enc text,
  display_name    text,
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_phone_role_uq ON users(phone, role) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX users_email_uq ON users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE otp_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL,
  role         text NOT NULL,
  code_hash    text NOT NULL,
  attempts     int  NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_requests_phone_idx ON otp_requests(phone, role, created_at DESC);

CREATE TABLE device_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  device_id     text NOT NULL,
  device_name   text,
  push_token    text,
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  revoke_reason text
);
CREATE INDEX device_sessions_user_idx ON device_sessions(user_id) WHERE revoked_at IS NULL;

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES device_sessions(id),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- zones
CREATE TABLE service_zones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  name           text NOT NULL,
  name_en        text,
  area           geometry(MultiPolygon, 4326) NOT NULL,
  service_hours  jsonb,
  vehicle_types  text[] NOT NULL DEFAULT ARRAY['MOTORCYCLE','CAR','PICKUP','VAN'],
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_zones_area_gix ON service_zones USING gist(area);

-- ---------------------------------------------------------------- customers
CREATE TABLE customers (
  id          uuid PRIMARY KEY REFERENCES users(id),
  name        text,
  email       text,
  org_id      uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customers(id),
  label        text,
  address      text NOT NULL,
  building     text,
  floor        text,
  room         text,
  contact_name text,
  contact_phone text,
  note         text,
  location     geography(Point, 4326) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_customer_idx ON addresses(customer_id);

-- ---------------------------------------------------------------- drivers
CREATE TABLE drivers (
  id                     uuid PRIMARY KEY REFERENCES users(id),
  first_name             text,
  last_name              text,
  national_id_enc        text,
  national_id_hash       text UNIQUE,
  license_number_enc     text,
  license_expiry         date,
  emergency_contact_enc  text,
  bank_account_enc       text,
  photo_key              text,
  kyc_status             text NOT NULL DEFAULT 'DRAFT'
                         CHECK (kyc_status IN ('DRAFT','PENDING','REVIEW','APPROVED','REJECTED','SUSPENDED')),
  kyc_note               text,
  tier                   text NOT NULL DEFAULT 'NEW' CHECK (tier IN ('NEW','STANDARD','SILVER','GOLD','PRO')),
  home_zone_id           uuid REFERENCES service_zones(id),
  current_vehicle_id     uuid,
  presence               text NOT NULL DEFAULT 'OFFLINE' CHECK (presence IN ('OFFLINE','ONLINE','BUSY')),
  presence_changed_at    timestamptz NOT NULL DEFAULT now(),
  rating_sum             int NOT NULL DEFAULT 0,
  rating_count           int NOT NULL DEFAULT 0,
  offers_received        int NOT NULL DEFAULT 0,
  offers_accepted        int NOT NULL DEFAULT 0,
  offers_declined        int NOT NULL DEFAULT 0,
  offers_expired         int NOT NULL DEFAULT 0,
  trips_completed        int NOT NULL DEFAULT 0,
  trips_cancelled        int NOT NULL DEFAULT 0,
  risk_score             int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivers_presence_idx ON drivers(presence) WHERE presence <> 'OFFLINE';

CREATE TABLE vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES drivers(id),
  type            text NOT NULL CHECK (type IN ('MOTORCYCLE','CAR','PICKUP','VAN')),
  plate_number    text NOT NULL,
  plate_province  text NOT NULL,
  brand           text,
  model           text,
  color           text,
  year            int,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','INACTIVE')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vehicles_plate_uq ON vehicles(plate_number, plate_province) WHERE status <> 'INACTIVE';
ALTER TABLE drivers ADD CONSTRAINT drivers_vehicle_fk FOREIGN KEY (current_vehicle_id) REFERENCES vehicles(id);

CREATE TABLE driver_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    uuid NOT NULL REFERENCES drivers(id),
  kind         text NOT NULL,
  file_key     text NOT NULL,
  status       text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','SUPERSEDED')),
  reviewed_by  uuid REFERENCES users(id),
  reviewed_at  timestamptz,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driver_documents_driver_idx ON driver_documents(driver_id);

-- latest known position (one row per driver); history in driver_location_history
CREATE TABLE driver_locations (
  driver_id    uuid PRIMARY KEY REFERENCES drivers(id),
  location     geography(Point, 4326) NOT NULL,
  heading      real,
  speed        real,
  accuracy     real,
  recorded_at  timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driver_locations_gix ON driver_locations USING gist(location);

CREATE TABLE driver_location_history (
  id           bigserial PRIMARY KEY,
  driver_id    uuid NOT NULL,
  order_id     uuid,
  location     geography(Point, 4326) NOT NULL,
  heading      real,
  speed        real,
  accuracy     real,
  is_mocked    boolean NOT NULL DEFAULT false,
  recorded_at  timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driver_location_history_driver_idx ON driver_location_history(driver_id, recorded_at);
CREATE INDEX driver_location_history_order_idx ON driver_location_history(order_id, recorded_at) WHERE order_id IS NOT NULL;

CREATE TABLE driver_shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid NOT NULL REFERENCES drivers(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);
CREATE INDEX driver_shifts_driver_idx ON driver_shifts(driver_id, started_at DESC);

-- ---------------------------------------------------------------- configuration
CREATE TABLE platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pricing_rules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  vehicle_type           text NOT NULL CHECK (vehicle_type IN ('MOTORCYCLE','CAR','PICKUP','VAN')),
  zone_id                uuid REFERENCES service_zones(id),
  base_fare              numeric(14,2) NOT NULL,
  per_km                 numeric(14,2) NOT NULL,
  included_km            numeric(6,2)  NOT NULL DEFAULT 0,
  minimum_fare           numeric(14,2) NOT NULL,
  vehicle_fee            numeric(14,2) NOT NULL DEFAULT 0,
  additional_stop_fee    numeric(14,2) NOT NULL DEFAULT 0,
  waiting_fee_per_min    numeric(14,2) NOT NULL DEFAULT 0,
  free_waiting_min       int NOT NULL DEFAULT 15,
  traffic_fee_per_min    numeric(14,2) NOT NULL DEFAULT 0,
  special_service_fees   jsonb NOT NULL DEFAULT '{}'::jsonb,
  time_multipliers       jsonb NOT NULL DEFAULT '[]'::jsonb,
  allow_below_margin     boolean NOT NULL DEFAULT false,
  active                 boolean NOT NULL DEFAULT true,
  effective_from         timestamptz NOT NULL DEFAULT now(),
  effective_to           timestamptz,
  created_by             uuid REFERENCES users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pricing_rules_lookup_idx ON pricing_rules(vehicle_type, zone_id) WHERE active;

CREATE TABLE commission_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  driver_id     uuid REFERENCES drivers(id),
  tier          text CHECK (tier IN ('NEW','STANDARD','SILVER','GOLD','PRO')),
  vehicle_type  text CHECK (vehicle_type IN ('MOTORCYCLE','CAR','PICKUP','VAN')),
  zone_id       uuid REFERENCES service_zones(id),
  campaign      text,
  rate_bp       int NOT NULL CHECK (rate_bp BETWEEN 0 AND 5000),
  priority      int NOT NULL DEFAULT 0,
  valid_from    timestamptz,
  valid_to      timestamptz,
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE surge_states (
  zone_id        uuid NOT NULL REFERENCES service_zones(id),
  vehicle_type   text NOT NULL,
  milli          int NOT NULL DEFAULT 1000,
  demand         int NOT NULL DEFAULT 0,
  supply         int NOT NULL DEFAULT 0,
  manual         boolean NOT NULL DEFAULT false,
  manual_until   timestamptz,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, vehicle_type)
);

CREATE TABLE surge_history (
  id            bigserial PRIMARY KEY,
  zone_id       uuid NOT NULL,
  vehicle_type  text NOT NULL,
  from_milli    int NOT NULL,
  to_milli      int NOT NULL,
  demand        int NOT NULL,
  supply        int NOT NULL,
  source        text NOT NULL CHECK (source IN ('ENGINE','MANUAL')),
  actor_id      uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promotions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL UNIQUE,
  description       text,
  discount_type     text NOT NULL CHECK (discount_type IN ('FIXED','PERCENT')),
  discount_value    numeric(14,2) NOT NULL,
  max_discount      numeric(14,2),
  min_order         numeric(14,2) NOT NULL DEFAULT 0,
  budget            numeric(14,2),
  spent             numeric(14,2) NOT NULL DEFAULT 0,
  per_user_limit    int NOT NULL DEFAULT 1,
  zone_id           uuid REFERENCES service_zones(id),
  vehicle_types     text[],
  valid_from        timestamptz NOT NULL DEFAULT now(),
  valid_to          timestamptz,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- quotes & orders
CREATE TABLE quotes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid NOT NULL REFERENCES customers(id),
  zone_id            uuid REFERENCES service_zones(id),
  vehicle_type       text NOT NULL,
  pricing_rule_id    uuid REFERENCES pricing_rules(id),
  request            jsonb NOT NULL,
  stop_sequence      int[] NOT NULL,
  distance_m         int NOT NULL,
  duration_s         int NOT NULL,
  breakdown          jsonb NOT NULL,
  price              numeric(14,2) NOT NULL,
  driver_gross       numeric(14,2) NOT NULL,
  expected_commission_bp int NOT NULL,
  margin             jsonb NOT NULL,
  surge_milli        int NOT NULL DEFAULT 1000,
  promotion_id       uuid REFERENCES promotions(id),
  available          boolean NOT NULL DEFAULT true,
  unavailable_reason text,
  expires_at         timestamptz NOT NULL,
  used_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_customer_idx ON quotes(customer_id, created_at DESC);

CREATE SEQUENCE order_no_seq;

CREATE TABLE orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no              text NOT NULL UNIQUE,
  customer_id           uuid NOT NULL REFERENCES customers(id),
  quote_id              uuid NOT NULL UNIQUE REFERENCES quotes(id),
  idempotency_key       text NOT NULL,
  status                text NOT NULL,
  service_type          text NOT NULL DEFAULT 'INSTANT',
  vehicle_type          text NOT NULL,
  zone_id               uuid REFERENCES service_zones(id),
  scheduled_at          timestamptz,
  payment_method        text NOT NULL,
  cash_collect_at       text NOT NULL DEFAULT 'PICKUP',
  price                 numeric(14,2) NOT NULL,
  breakdown             jsonb NOT NULL,
  distance_m            int NOT NULL,
  duration_s            int NOT NULL,
  parcel                jsonb NOT NULL,
  driver_id             uuid REFERENCES drivers(id),
  vehicle_id            uuid REFERENCES vehicles(id),
  driver_gross          numeric(14,2) NOT NULL,
  commission_rate_bp    int,
  commission            numeric(14,2),
  driver_bonus          numeric(14,2) NOT NULL DEFAULT 0,
  driver_net            numeric(14,2),
  contribution_margin   numeric(14,2),
  margin                jsonb,
  dispatch_wave         int NOT NULL DEFAULT 0,
  dispatch_round        bigint NOT NULL DEFAULT 0,
  dispatch_started_at   timestamptz,
  assigned_at           timestamptz,
  picked_up_at          timestamptz,
  delivered_at          timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text,
  cancelled_by          text,
  pickup_eta_at         timestamptz,
  delivery_eta_at       timestamptz,
  version               int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);
CREATE INDEX orders_status_idx ON orders(status, created_at DESC);
CREATE INDEX orders_customer_idx ON orders(customer_id, created_at DESC);
CREATE INDEX orders_driver_idx ON orders(driver_id, created_at DESC);

CREATE TABLE order_stops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES orders(id),
  seq             int NOT NULL,
  type            text NOT NULL CHECK (type IN ('PICKUP','DROPOFF')),
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ARRIVED','COMPLETED','FAILED')),
  location        geography(Point, 4326) NOT NULL,
  address         text NOT NULL,
  district        text,
  building        text,
  floor           text,
  room            text,
  contact_name    text NOT NULL,
  contact_phone   text NOT NULL,
  note            text,
  locked          boolean NOT NULL DEFAULT false,
  otp_enc         text,
  arrived_at      timestamptz,
  completed_at    timestamptz,
  UNIQUE (order_id, seq)
);

CREATE TABLE order_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id),
  category              text NOT NULL,
  weight_kg             numeric(8,2) NOT NULL,
  length_cm             numeric(8,2),
  width_cm              numeric(8,2),
  height_cm             numeric(8,2),
  quantity              int NOT NULL DEFAULT 1,
  fragile               boolean NOT NULL DEFAULT false,
  temperature_sensitive boolean NOT NULL DEFAULT false,
  high_value            boolean NOT NULL DEFAULT false,
  declared_value        numeric(14,2),
  note                  text,
  photo_keys            text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE dispatch_offers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id),
  driver_id             uuid NOT NULL REFERENCES drivers(id),
  wave                  int NOT NULL,
  status                text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  score                 numeric(10,4) NOT NULL,
  score_breakdown       jsonb NOT NULL,
  distance_to_pickup_m  int NOT NULL,
  eta_to_pickup_s       int NOT NULL,
  gross                 numeric(14,2) NOT NULL,
  commission_rate_bp    int NOT NULL,
  commission            numeric(14,2) NOT NULL,
  bonus                 numeric(14,2) NOT NULL DEFAULT 0,
  net                   numeric(14,2) NOT NULL,
  decline_reason        text,
  expires_at            timestamptz NOT NULL,
  responded_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, driver_id)
);
CREATE INDEX dispatch_offers_driver_pending_idx ON dispatch_offers(driver_id) WHERE status = 'PENDING';
CREATE INDEX dispatch_offers_order_idx ON dispatch_offers(order_id, wave);

CREATE TABLE assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id),
  driver_id             uuid NOT NULL REFERENCES drivers(id),
  vehicle_id            uuid REFERENCES vehicles(id),
  offer_id              uuid REFERENCES dispatch_offers(id),
  method                text NOT NULL CHECK (method IN ('AUTO','MANUAL')),
  assigned_by           uuid REFERENCES users(id),
  reason                text,
  assigned_location     geography(Point, 4326),
  planned_dead_mileage_m int,
  actual_dead_mileage_m  int,
  loaded_mileage_m       int,
  assigned_at           timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,
  end_reason            text
);
CREATE INDEX assignments_order_idx ON assignments(order_id);
CREATE INDEX assignments_driver_idx ON assignments(driver_id, assigned_at DESC);
CREATE UNIQUE INDEX assignments_active_order_uq ON assignments(order_id) WHERE ended_at IS NULL;

-- tracking_events = order timeline (state transitions + operational events)
CREATE TABLE tracking_events (
  id           bigserial PRIMARY KEY,
  order_id     uuid NOT NULL REFERENCES orders(id),
  type         text NOT NULL,
  from_status  text,
  to_status    text,
  actor_type   text NOT NULL,
  actor_id     uuid,
  location     geography(Point, 4326),
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_events_order_idx ON tracking_events(order_id, id);

-- proof of pickup / delivery: append-only
CREATE TABLE pod (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id),
  stop_id               uuid NOT NULL REFERENCES order_stops(id),
  kind                  text NOT NULL CHECK (kind IN ('PICKUP','DROPOFF')),
  otp_verified          boolean NOT NULL DEFAULT false,
  qr_verified           boolean NOT NULL DEFAULT false,
  photo_keys            text[] NOT NULL DEFAULT '{}',
  signature_key         text,
  recipient_name        text,
  location              geography(Point, 4326) NOT NULL,
  distance_from_stop_m  int NOT NULL,
  override_reason       text,
  recorded_by           uuid NOT NULL REFERENCES users(id),
  recorded_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pod_order_idx ON pod(order_id);

CREATE TABLE pod_amendments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id       uuid NOT NULL REFERENCES pod(id),
  amended_by   uuid NOT NULL REFERENCES users(id),
  reason       text NOT NULL,
  changes      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- money
CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id),
  method        text NOT NULL,
  provider      text NOT NULL,
  provider_ref  text,
  status        text NOT NULL CHECK (status IN ('PENDING','AUTHORIZED','CAPTURED','FAILED','REFUNDED','CANCELLED')),
  amount        numeric(14,2) NOT NULL,
  fee           numeric(14,2) NOT NULL DEFAULT 0,
  client_data   jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments(order_id);
CREATE UNIQUE INDEX payments_provider_ref_uq ON payments(provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE settlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES drivers(id),
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  net_earnings    numeric(14,2) NOT NULL,
  cash_collected  numeric(14,2) NOT NULL,
  payable         numeric(14,2) NOT NULL,
  status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PAID','FAILED')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE driver_earnings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id            uuid NOT NULL REFERENCES drivers(id),
  order_id             uuid REFERENCES orders(id),
  type                 text NOT NULL CHECK (type IN ('TRIP','TIP','BONUS','ADJUSTMENT')),
  gross_fare           numeric(14,2) NOT NULL DEFAULT 0,
  commission           numeric(14,2) NOT NULL DEFAULT 0,
  commission_rate_bp   int,
  bonus                numeric(14,2) NOT NULL DEFAULT 0,
  tip                  numeric(14,2) NOT NULL DEFAULT 0,
  adjustment           numeric(14,2) NOT NULL DEFAULT 0,
  net                  numeric(14,2) NOT NULL,
  cash_collected       numeric(14,2) NOT NULL DEFAULT 0,
  dead_mileage_m       int,
  loaded_mileage_m     int,
  note                 text,
  settlement_id        uuid REFERENCES settlements(id),
  earned_at            timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES users(id)
);
CREATE INDEX driver_earnings_driver_idx ON driver_earnings(driver_id, earned_at DESC);
CREATE UNIQUE INDEX driver_earnings_trip_uq ON driver_earnings(order_id) WHERE type = 'TRIP';

CREATE TABLE ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id),
  rater_type  text NOT NULL CHECK (rater_type IN ('CUSTOMER','DRIVER')),
  rater_id    uuid NOT NULL REFERENCES users(id),
  ratee_id    uuid NOT NULL REFERENCES users(id),
  score       int NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, rater_type)
);

-- ---------------------------------------------------------------- operations
CREATE TABLE support_cases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid REFERENCES orders(id),
  opened_by    uuid NOT NULL REFERENCES users(id),
  category     text NOT NULL,
  status       text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  priority     text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  description  text NOT NULL,
  assigned_to  uuid REFERENCES users(id),
  resolution   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE risk_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL,
  user_id      uuid REFERENCES users(id),
  order_id     uuid REFERENCES orders(id),
  score        int NOT NULL,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','DISMISSED','ACTIONED')),
  reviewed_by  uuid REFERENCES users(id),
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX risk_events_user_idx ON risk_events(user_id, created_at DESC);
CREATE INDEX risk_events_open_idx ON risk_events(created_at DESC) WHERE status = 'OPEN';

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  channel     text NOT NULL CHECK (channel IN ('PUSH','SMS','LINE','EMAIL','INAPP')),
  event       text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED','SKIPPED')),
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE files (
  key           text PRIMARY KEY,
  owner_id      uuid NOT NULL REFERENCES users(id),
  purpose       text NOT NULL,
  content_type  text NOT NULL,
  size_bytes    int,
  uploaded_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id           bigserial PRIMARY KEY,
  actor_id     uuid,
  actor_role   text,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  reason       text,
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id, created_at DESC);

-- ---------------------------------------------------------------- immutability guards
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pod_append_only BEFORE UPDATE OR DELETE ON pod
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER tracking_events_append_only BEFORE UPDATE OR DELETE ON tracking_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
