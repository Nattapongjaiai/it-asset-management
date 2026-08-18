-- =========================================================
-- IT Asset Management — Supabase schema
-- วิธีใช้: เปิด Supabase Dashboard > SQL Editor > New query
-- วางโค้ดทั้งหมดนี้ แล้วกด Run
-- =========================================================

create table if not exists branches (
  id text primary key,
  name text not null,
  code text,
  province text
);

create table if not exists assets (
  id text primary key,
  asset_tag text not null,
  type text,
  brand text,
  model text,
  serial text,
  branch_id text references branches(id) on delete set null,
  assigned_to text,
  status text default 'ในสต็อก',
  purchase_date date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists tickets (
  id text primary key,
  ticket_no text,
  asset_id text references assets(id) on delete set null,
  branch_id text references branches(id) on delete set null,
  reporter text,
  issue_type text,
  description text,
  priority text default 'ปานกลาง',
  status text default 'แจ้งใหม่',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists ticket_photos (
  id uuid primary key default gen_random_uuid(),
  ticket_id text references tickets(id) on delete cascade,
  category text not null check (category in ('fault','shipping','afterRepair','shipBack')),
  url text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- Row Level Security
-- หมายเหตุ: ตั้งเป็น "allow all" เพื่อให้ทีมใช้งานได้ทันทีโดยไม่ต้อง login
-- (เหมาะกับใช้งานภายในทีมที่ไว้ใจกัน ไม่เหมาะกับเปิดสาธารณะ)
-- ถ้าต้องการเพิ่มระบบ login ทีหลัง ให้กลับมาแก้ policy เหล่านี้
-- ---------------------------------------------------------
alter table branches enable row level security;
alter table assets enable row level security;
alter table tickets enable row level security;
alter table ticket_photos enable row level security;

create policy "allow all - branches" on branches for all using (true) with check (true);
create policy "allow all - assets" on assets for all using (true) with check (true);
create policy "allow all - tickets" on tickets for all using (true) with check (true);
create policy "allow all - ticket_photos" on ticket_photos for all using (true) with check (true);
