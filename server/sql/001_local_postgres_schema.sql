-- CertiStock local PostgreSQL schema.
-- This is the cloud-portable version of the Supabase schema:
-- - no auth.users dependency
-- - no Supabase Storage dependency
-- - no RLS/auth.uid() dependency
-- Company isolation is enforced by the local API using JWT user.companyId.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('owner', 'admin', 'manager', 'operator', 'viewer');
  end if;
end $$;

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  address text,
  gst_number text,
  te_id text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references public.app_users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  role public.app_role not null default 'operator',
  created_at timestamptz not null default now(),
  unique(user_id, company_id, role)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_name text not null,
  legal_name text,
  address text,
  city text,
  state text,
  country text,
  postal_code text,
  sc_number text,
  te_id text,
  license_no text,
  client_no text,
  contact_person text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_name text not null,
  legal_name text,
  address text,
  city text,
  state text,
  country text,
  postal_code text,
  te_id text,
  license_no text,
  contact_person text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certification_bodies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  licensing_code text,
  country text,
  created_at timestamptz not null default now()
);

insert into public.certification_bodies(name, licensing_code, country) values
  ('IDFL Laboratory and Institute', 'CB-IDF', 'USA'),
  ('CU Inspections & Certifications India Pvt. Ltd.', 'CUI', 'India'),
  ('Intertek Testing Services NA, Inc.', 'CB-ITS', 'USA')
on conflict (name) do nothing;

create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_by uuid references public.profiles(id),
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text not null,
  public_url text,
  source_type text not null default 'transaction_certificate_pdf',
  parsing_status text not null default 'pending',
  parser_error text,
  extracted_json jsonb,
  embedded_text text,
  ocr_text text,
  final_extracted_text text,
  ocr_engine_used text,
  ocr_average_confidence numeric(5,2),
  ai_model_used text,
  ai_structuring_confidence numeric(5,2),
  extraction_pipeline_version text default 'v2',
  extraction_started_at timestamptz,
  extraction_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid not null references public.uploaded_files(id) on delete cascade,
  job_type text not null check (job_type in (
    'embedded_text_extraction', 'paddleocr', 'openrouter_structuring',
    'gemini_fallback', 'validation', 'normalization', 'full_pipeline'
  )),
  status text default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  input_payload jsonb,
  output_payload jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.extraction_model_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid not null references public.uploaded_files(id) on delete cascade,
  extraction_job_id uuid references public.extraction_jobs(id) on delete set null,
  provider text not null,
  model_name text,
  prompt_tokens integer,
  completion_tokens integer,
  cost_usd numeric(10,6),
  response_json jsonb,
  success boolean default false,
  error_message text,
  created_at timestamptz default now()
);

create table if not exists public.transaction_certificates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  certification_body_id uuid references public.certification_bodies(id),
  supplier_id uuid references public.suppliers(id),
  buyer_company_id uuid references public.companies(id),
  tc_number text not null,
  version text,
  standard text not null default 'GRS',
  status text default 'unknown',
  place_of_issue text,
  issue_date date,
  last_updated_date date,
  seller_license_no text,
  seller_te_id text,
  buyer_name text,
  buyer_te_id text,
  gross_shipping_weight_kg numeric(14,3),
  net_shipping_weight_kg numeric(14,3),
  certified_weight_kg numeric(14,3),
  input_tcs text,
  raw_text text,
  extraction_confidence numeric(5,2),
  review_status text not null default 'needs_review',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, tc_number)
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transaction_certificate_id uuid not null references public.transaction_certificates(id) on delete cascade,
  shipment_no text not null,
  shipment_date date,
  shipment_doc_no text,
  invoice_reference text,
  gross_shipping_weight_kg numeric(14,3),
  consignee_name text,
  consignee_address text,
  consignee_te_id text,
  raw_block_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_master (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  normalized_key text not null,
  display_name text not null,
  product_family text,
  material text default 'Recycled Polyester',
  default_unit text default 'kg',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, normalized_key)
);

create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_master_id uuid not null references public.product_master(id) on delete cascade,
  alias_text text not null,
  alias_type text default 'manual_alias',
  confidence numeric(5,2) default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.product_lots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transaction_certificate_id uuid not null references public.transaction_certificates(id) on delete cascade,
  shipment_id uuid references public.shipments(id) on delete set null,
  product_master_id uuid references public.product_master(id),
  product_no text,
  shipment_product_no text,
  order_no text,
  article_no text,
  number_of_units numeric(14,3),
  unit_type text,
  net_shipping_weight_kg numeric(14,3) not null,
  supplementary_weight_kg numeric(14,3) default 0,
  certified_weight_kg numeric(14,3) not null,
  production_date date,
  product_category text,
  product_detail text,
  material_composition text,
  standard_label_grade text,
  additional_info_raw text,
  yarn_count_raw text,
  normalized_yarn_key text,
  last_processor text,
  last_processor_te_id text,
  origin_country text,
  opening_stock_kg numeric(14,3) not null,
  remaining_stock_kg numeric(14,3) not null,
  reserved_stock_kg numeric(14,3) default 0,
  consumed_stock_kg numeric(14,3) default 0,
  status text not null default 'active',
  extraction_confidence numeric(5,2),
  needs_manual_review boolean default false,
  raw_block_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outward_sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id),
  outward_invoice_no text,
  outward_invoice_date date,
  outward_tc_no text,
  customer_name_snapshot text,
  product_name text,
  normalized_yarn_key text,
  outward_net_weight_kg numeric(14,3),
  outward_gross_weight_kg numeric(14,3),
  outward_certified_weight_kg numeric(14,3),
  transport_doc_no text,
  vehicle_no text,
  destination text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.incoming_stock (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_no text not null,
  yarn_count text not null,
  normalized_yarn_key text,
  net_weight_kg numeric(14,3) not null check (net_weight_kg > 0),
  shipment_date date not null,
  matched_tc_id uuid references public.transaction_certificates(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consumption_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_lot_id uuid not null references public.product_lots(id),
  outward_sale_id uuid references public.outward_sales(id) on delete cascade,
  transaction_certificate_id uuid references public.transaction_certificates(id),
  consumed_weight_kg numeric(14,3) not null check (consumed_weight_kg > 0),
  opening_balance_before_kg numeric(14,3) not null,
  closing_balance_after_kg numeric(14,3) not null,
  outward_certified_weight_kg numeric(14,3),
  loss_weight_kg numeric(14,3),
  loss_percent numeric(8,3),
  consumption_date date default current_date,
  remarks text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_lot_id uuid not null references public.product_lots(id),
  transaction_type text not null,
  reference_type text,
  reference_id uuid,
  qty_in_kg numeric(14,3) default 0,
  qty_out_kg numeric(14,3) default 0,
  balance_before_kg numeric(14,3),
  balance_after_kg numeric(14,3),
  remarks text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.mass_balance_workbooks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transaction_certificate_id uuid not null references public.transaction_certificates(id) on delete cascade,
  product_lot_id uuid not null references public.product_lots(id) on delete cascade,
  storage_path text,
  file_name text,
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'stale', 'failed')),
  row_count integer,
  error_message text,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_lot_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create or replace function public.normalize_product_key(raw_text text, article_no text default null)
returns text language plpgsql immutable as $$
declare
  s text := upper(coalesce(raw_text, '') || ' ' || coalesce(article_no, ''));
begin
  if s ~ '\m0*50[[:space:]]*/[[:space:]]*0*48\M' or s ~ '\m50[[:space:]]*/[[:space:]]*48\M' then return '50/48'; end if;
  if s ~ '\m50[[:space:]]*/[[:space:]]*45\M' then return '50/45'; end if;
  if s ~ '\m75[[:space:]]*/[[:space:]]*72\M' or s ~ 'SD7572ROTO' then return '75/72'; end if;
  if s ~ '\m150[[:space:]]*/[[:space:]]*48\M' or s ~ 'LBSRSD0138' then return '150/48'; end if;
  if s ~ '\m20[[:space:]]*/[[:space:]]*1\M' then return '20/1'; end if;
  if s ~ '\m50[[:space:]]*DENIER\M' or s ~ '\m50D\M' or s ~ 'SD5048FDY' or s ~ 'SD5048' or s ~ 'AFL99906' then return '50D'; end if;
  if s ~ '\m70[[:space:]]*DENIER\M' or s ~ '\m70D\M' or s ~ 'SD7072FDY' or s ~ 'SD7072' or s ~ '\m70[[:space:]]*/[[:space:]]*72\M' or s ~ 'LBSRSD0141' then return '70D'; end if;
  if s ~ '\m75[[:space:]]*DENIER\M' or s ~ '\m75D\M' then return '75D'; end if;
  if s ~ '\m150[[:space:]]*DENIER\M' or s ~ '\m150D\M' or s ~ 'SD15048FDY' or s ~ 'SD15048' or s ~ 'AFL99916' then return '150D'; end if;
  if s ~ '\m30[[:space:]]*DENIER\M' or s ~ '\m30D\M' or s ~ '3000SD' then return '30D'; end if;
  return null;
end $$;

create or replace function public.consume_stock_local(
  _company_id uuid,
  _user_id uuid,
  _product_lot_id uuid,
  _outward_sale_id uuid,
  _consumed_weight_kg numeric,
  _outward_certified_weight_kg numeric,
  _remarks text default null
) returns public.consumption_entries language plpgsql as $$
declare
  lot public.product_lots%rowtype;
  opening numeric;
  closing numeric;
  loss_kg numeric;
  loss_pct numeric;
  entry public.consumption_entries%rowtype;
begin
  select * into lot
  from public.product_lots
  where id = _product_lot_id
  for update;

  if not found then raise exception 'Lot not found'; end if;
  if lot.company_id <> _company_id then raise exception 'Unauthorized'; end if;
  if _consumed_weight_kg <= 0 then raise exception 'Consumed weight must be > 0'; end if;
  if _consumed_weight_kg > lot.remaining_stock_kg then
    raise exception 'Consumed % exceeds remaining %', _consumed_weight_kg, lot.remaining_stock_kg;
  end if;

  opening := lot.remaining_stock_kg;
  closing := opening - _consumed_weight_kg;
  loss_kg := _consumed_weight_kg - coalesce(_outward_certified_weight_kg, 0);
  loss_pct := case when _consumed_weight_kg > 0 then (loss_kg / _consumed_weight_kg) * 100 else 0 end;

  insert into public.consumption_entries(
    company_id, product_lot_id, outward_sale_id, transaction_certificate_id,
    consumed_weight_kg, opening_balance_before_kg, closing_balance_after_kg,
    outward_certified_weight_kg, loss_weight_kg, loss_percent, remarks, created_by
  ) values (
    _company_id, lot.id, _outward_sale_id, lot.transaction_certificate_id,
    _consumed_weight_kg, opening, closing, _outward_certified_weight_kg,
    loss_kg, loss_pct, _remarks, _user_id
  ) returning * into entry;

  update public.product_lots
  set remaining_stock_kg = closing,
      consumed_stock_kg = coalesce(consumed_stock_kg, 0) + _consumed_weight_kg,
      status = case when closing <= 0 then 'exhausted' else 'active' end,
      updated_at = now()
  where id = lot.id;

  insert into public.stock_ledger(
    company_id, product_lot_id, transaction_type, reference_type, reference_id,
    qty_in_kg, qty_out_kg, balance_before_kg, balance_after_kg, remarks, created_by
  ) values (
    _company_id, lot.id, 'consumption', 'consumption_entry', entry.id,
    0, _consumed_weight_kg, opening, closing, _remarks, _user_id
  );

  return entry;
end $$;

create or replace function public.reverse_consumption_local(
  _company_id uuid,
  _user_id uuid,
  _consumption_entry_id uuid,
  _reason text default null
) returns jsonb language plpgsql as $$
declare
  entry_to_delete public.consumption_entries%rowtype;
  lot public.product_lots%rowtype;
  remaining_entry public.consumption_entries%rowtype;
  running_balance numeric;
  final_consumed numeric := 0;
  final_remaining numeric;
  sale_id uuid;
  sale_usage_count integer;
begin
  select * into entry_to_delete
  from public.consumption_entries
  where id = _consumption_entry_id;

  if not found then raise exception 'Consumption entry not found'; end if;
  if entry_to_delete.company_id <> _company_id then raise exception 'Unauthorized'; end if;

  select * into lot
  from public.product_lots
  where id = entry_to_delete.product_lot_id
  for update;

  if not found then raise exception 'Product lot not found'; end if;
  if lot.company_id <> _company_id then raise exception 'Unauthorized'; end if;

  sale_id := entry_to_delete.outward_sale_id;

  delete from public.consumption_entries where id = entry_to_delete.id;

  if sale_id is not null then
    select count(*) into sale_usage_count from public.consumption_entries where outward_sale_id = sale_id;
    if sale_usage_count = 0 then
      delete from public.outward_sales where id = sale_id and company_id = _company_id;
    end if;
  end if;

  running_balance := coalesce(lot.opening_stock_kg, lot.certified_weight_kg, 0);

  for remaining_entry in
    select *
    from public.consumption_entries
    where product_lot_id = lot.id and company_id = _company_id
    order by consumption_date asc nulls last, created_at asc, id asc
  loop
    update public.consumption_entries
    set opening_balance_before_kg = running_balance,
        closing_balance_after_kg = running_balance - remaining_entry.consumed_weight_kg,
        loss_weight_kg = remaining_entry.consumed_weight_kg - coalesce(remaining_entry.outward_certified_weight_kg, 0),
        loss_percent = case
          when remaining_entry.consumed_weight_kg > 0
          then ((remaining_entry.consumed_weight_kg - coalesce(remaining_entry.outward_certified_weight_kg, 0)) / remaining_entry.consumed_weight_kg) * 100
          else 0
        end
    where id = remaining_entry.id;

    running_balance := running_balance - remaining_entry.consumed_weight_kg;
    final_consumed := final_consumed + remaining_entry.consumed_weight_kg;
  end loop;

  final_remaining := running_balance;

  update public.product_lots
  set consumed_stock_kg = final_consumed,
      remaining_stock_kg = final_remaining,
      status = case when final_remaining <= 0 then 'exhausted' else 'active' end,
      updated_at = now()
  where id = lot.id;

  insert into public.stock_ledger(
    company_id, product_lot_id, transaction_type, reference_type, reference_id,
    qty_in_kg, qty_out_kg, balance_before_kg, balance_after_kg, remarks, created_by
  ) values (
    _company_id, lot.id, 'consumption_reversal', 'consumption_entry', entry_to_delete.id,
    entry_to_delete.consumed_weight_kg, 0, lot.remaining_stock_kg, final_remaining,
    coalesce(_reason, 'Deleted consumption and restored stock'), _user_id
  );

  return jsonb_build_object(
    'product_lot_id', lot.id,
    'transaction_certificate_id', lot.transaction_certificate_id,
    'restored_weight_kg', entry_to_delete.consumed_weight_kg,
    'remaining_stock_kg', final_remaining,
    'consumed_stock_kg', final_consumed
  );
end $$;

create index if not exists idx_app_users_email on public.app_users(lower(email));
create index if not exists idx_profiles_company on public.profiles(company_id);
create index if not exists idx_suppliers_company on public.suppliers(company_id);
create unique index if not exists idx_suppliers_company_name_unique
  on public.suppliers(company_id, lower(btrim(supplier_name)));
create index if not exists idx_customers_company on public.customers(company_id);
create unique index if not exists idx_customers_company_name_unique
  on public.customers(company_id, lower(btrim(customer_name)));
create index if not exists idx_uploaded_files_company on public.uploaded_files(company_id);
create index if not exists idx_extraction_jobs_uploaded_file on public.extraction_jobs(uploaded_file_id);
create index if not exists idx_extraction_jobs_company on public.extraction_jobs(company_id);
create index if not exists idx_extraction_model_runs_uploaded_file on public.extraction_model_runs(uploaded_file_id);
create index if not exists idx_extraction_model_runs_company on public.extraction_model_runs(company_id);
create index if not exists idx_tc_company on public.transaction_certificates(company_id);
create index if not exists idx_tc_issue_date on public.transaction_certificates(issue_date);
create index if not exists idx_ship_company_date on public.shipments(company_id, shipment_date);
create index if not exists idx_ship_tc on public.shipments(transaction_certificate_id);
create index if not exists idx_pm_company on public.product_master(company_id);
create index if not exists idx_pa_company on public.product_aliases(company_id);
create index if not exists idx_lots_company_yarn_remaining on public.product_lots(company_id, normalized_yarn_key, remaining_stock_kg);
create index if not exists idx_lots_tc on public.product_lots(transaction_certificate_id);
create index if not exists idx_lots_shipment on public.product_lots(shipment_id);
create index if not exists idx_incoming_stock_invoice on public.incoming_stock(company_id, lower(btrim(invoice_no)));
create index if not exists idx_incoming_stock_shipment_date on public.incoming_stock(company_id, shipment_date);
create index if not exists idx_incoming_stock_yarn on public.incoming_stock(company_id, normalized_yarn_key);
create index if not exists idx_ce_company_date on public.consumption_entries(company_id, consumption_date);
create index if not exists idx_ce_lot on public.consumption_entries(product_lot_id);
create index if not exists idx_sl_company on public.stock_ledger(company_id);
create index if not exists idx_sl_lot on public.stock_ledger(product_lot_id);
create index if not exists idx_mass_balance_lot on public.mass_balance_workbooks(product_lot_id);

do $$
declare
  t text;
  tables text[] := array[
    'app_users','companies','profiles','suppliers','customers','uploaded_files',
    'extraction_jobs','transaction_certificates','shipments','product_master',
    'product_lots','outward_sales','incoming_stock','mass_balance_workbooks'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'set_updated_at_' || t
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.tg_set_updated_at()',
        'set_updated_at_' || t,
        t
      );
    end if;
  end loop;
end $$;
