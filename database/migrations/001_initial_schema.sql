-- =============================================================================
-- e-MaintenanceManagementSystem (e-MMS) — ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์
-- File: database/migrations/001_initial_schema.sql
-- Purpose: สร้างโครงสร้างฐานข้อมูลหลักครบ 12 ตาราง, ฟังก์ชันรหัสใบแจ้งซ่อม Atomic,
--          Triggers อัปเดตเวลา, Indexes สำหรับตรวจแจ้งซ้ำและรายงานสถิติ, และ RLS
-- Database: Supabase PostgreSQL (Free Tier Compatible)
-- =============================================================================

BEGIN;

-- เปิดใช้งาน pgcrypto สำหรับสร้าง bcrypt password hash ใน Seed Data
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. ฟังก์ชัน Trigger มาตรฐานสำหรับอัปเดตคอลัมน์ updated_at อัตโนมัติ
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. ตารางตัวนับรหัสใบแจ้งซ่อมรายเดือน (Table 1/12: ticket_counters)
--    และฟังก์ชันสร้างรหัส MMS-YYYYMM-NNN แบบ Atomic (รีเซ็ตเริ่ม 001 ทุกเดือน)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ticket_counters (
    year_month CHAR(6) PRIMARY KEY CHECK (year_month ~ '^[0-9]{6}$'),
    last_seq   INT NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ticket_counters IS 'เก็บลำดับรหัสใบแจ้งซ่อมรายเดือน (YYYYMM) เพื่อสร้างรหัส MMS-YYYYMM-NNN แบบ Atomic';

CREATE OR REPLACE FUNCTION next_ticket_code()
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ym  CHAR(6);
    v_seq INT;
BEGIN
    -- ใช้วันเวลาตามเขตเวลาประเทศไทย (Asia/Bangkok)
    v_ym := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYYMM');

    INSERT INTO ticket_counters (year_month, last_seq, updated_at)
    VALUES (v_ym, 1, now())
    ON CONFLICT (year_month)
    DO UPDATE SET
        last_seq   = ticket_counters.last_seq + 1,
        updated_at = now()
    RETURNING last_seq INTO v_seq;

    RETURN 'MMS-' || v_ym || '-' || lpad(v_seq::text, 3, '0');
END;
$$;

COMMENT ON FUNCTION next_ticket_code() IS 'สร้างรหัสใบแจ้งซ่อมรูปแบบ MMS-YYYYMM-NNN แบบ Atomic ป้องกันรหัสชนกันเมื่อแจ้งพร้อมกัน';

-- =============================================================================
-- 3. โครงสร้างสถานที่ 3 ระดับ: อาคาร -> ชั้น -> ห้อง/บริเวณ
-- =============================================================================

-- Table 2/12: buildings (อาคาร)
CREATE TABLE IF NOT EXISTS buildings (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(30) UNIQUE,
    name       VARCHAR(150) NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE buildings IS 'ตารางข้อมูลหลัก: อาคาร (ระดับที่ 1)';

DROP TRIGGER IF EXISTS trg_buildings_updated_at ON buildings;
CREATE TRIGGER trg_buildings_updated_at
    BEFORE UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 3/12: floors (ชั้น)
CREATE TABLE IF NOT EXISTS floors (
    id          SERIAL PRIMARY KEY,
    building_id INT NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
    name        VARCHAR(100) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_floors_building_name UNIQUE (building_id, name),
    CONSTRAINT uq_floors_id_building UNIQUE (id, building_id)
);

COMMENT ON TABLE floors IS 'ตารางข้อมูลหลัก: ชั้น (ระดับที่ 2 เชื่อมกับอาคาร)';

DROP TRIGGER IF EXISTS trg_floors_updated_at ON floors;
CREATE TRIGGER trg_floors_updated_at
    BEFORE UPDATE ON floors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 4/12: rooms (ห้อง / บริเวณ)
CREATE TABLE IF NOT EXISTS rooms (
    id         SERIAL PRIMARY KEY,
    floor_id   INT NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
    code       VARCHAR(50),
    name       VARCHAR(150) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_rooms_floor_name UNIQUE (floor_id, name),
    CONSTRAINT uq_rooms_id_floor UNIQUE (id, floor_id)
);

COMMENT ON TABLE rooms IS 'ตารางข้อมูลหลัก: ห้องหรือบริเวณ (ระดับที่ 3 เชื่อมกับชั้น)';

DROP TRIGGER IF EXISTS trg_rooms_updated_at ON rooms;
CREATE TRIGGER trg_rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 4. ข้อมูลหลัก: หมวดหมู่งานซ่อม และ ประเภทผู้แจ้งซ่อม (Zero PII)
-- =============================================================================

-- Table 5/12: categories (หมวดหมู่งานซ่อม)
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(30) UNIQUE,
    name        VARCHAR(120) NOT NULL UNIQUE,
    description VARCHAR(255),
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE categories IS 'ตารางข้อมูลหลัก: หมวดหมู่งานซ่อมบำรุง';

DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 6/12: reporter_types (ประเภทผู้แจ้งซ่อม — ไม่เก็บข้อมูลส่วนบุคคลตามหลัก PDPA)
CREATE TABLE IF NOT EXISTS reporter_types (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(30) UNIQUE,
    name       VARCHAR(100) NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reporter_types IS 'ตารางข้อมูลหลัก: ประเภทผู้แจ้งซ่อม (เช่น เจ้าหน้าที่, นักศึกษา, แม่บ้าน, รปภ., อื่นๆ)';

DROP TRIGGER IF EXISTS trg_reporter_types_updated_at ON reporter_types;
CREATE TRIGGER trg_reporter_types_updated_at
    BEFORE UPDATE ON reporter_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 5. บัญชีผู้ใช้งานระบบหลังบ้าน และ รายชื่อช่างปฏิบัติงาน
-- =============================================================================

-- Table 7/12: users (บัญชีล็อกอินหลังบ้าน: technician, reporter, admin)
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(60) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(120) NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('technician', 'reporter', 'admin')),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'ตารางบัญชีผู้ใช้งานระบบหลังบ้าน (Login ด้วย Username + Password, แยกอิสระจากรายชื่อช่างหน้างาน)';

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 8/12: technicians (รายชื่อช่างปฏิบัติงาน — Master Data สำหรับเลือกตอนปิดงาน)
CREATE TABLE IF NOT EXISTS technicians (
    id         SERIAL PRIMARY KEY,
    full_name  VARCHAR(150) NOT NULL UNIQUE,
    nickname   VARCHAR(60),
    specialty  VARCHAR(120),
    phone      VARCHAR(30),
    sort_order INT NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE technicians IS 'ตารางรายชื่อช่างปฏิบัติงานจริง (เลือกได้หลายคนเมื่อปิดงานซ่อม แยกอิสระจากบัญชีล็อกอิน)';

DROP TRIGGER IF EXISTS trg_technicians_updated_at ON technicians;
CREATE TRIGGER trg_technicians_updated_at
    BEFORE UPDATE ON technicians
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 6. ตารางใบแจ้งซ่อมหลัก และตารางลูก (รูปภาพ, ช่างผู้รับผิดชอบ, ประวัติสถานะ)
-- =============================================================================

-- Table 9/12: tickets (ใบแจ้งซ่อมหลัก — Zero PII 100%)
-- หมายเหตุ: ห้ามเพิ่มคอลัมน์ชื่อ-สกุล เบอร์โทร อีเมล หรือรหัสนักศึกษาของผู้แจ้งโดยเด็ดขาด (ADR-002)
CREATE TABLE IF NOT EXISTS tickets (
    id                      SERIAL PRIMARY KEY,
    ticket_code             VARCHAR(20) NOT NULL UNIQUE DEFAULT next_ticket_code(),
    building_id             INT NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
    floor_id                INT NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
    room_id                 INT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
    location_detail         VARCHAR(200),
    category_id             INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    reporter_type_id        INT NOT NULL REFERENCES reporter_types(id) ON DELETE RESTRICT,
    description             TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                                'pending',
                                'in_progress',
                                'waiting_parts',
                                'completed',
                                'unrepairable',
                                'cancelled'
                            )),
    status_note             TEXT,
    acknowledged_by_user_id INT REFERENCES users(id) ON DELETE RESTRICT,
    acknowledged_at         TIMESTAMPTZ,
    closed_by_user_id       INT REFERENCES users(id) ON DELETE RESTRICT,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- บังคับความสอดคล้องของลำดับชั้นสถานที่ (ชั้นต้องอยู่ในอาคาร และห้องต้องอยู่ในชั้นนั้นจริง)
    CONSTRAINT fk_tickets_floor_building
        FOREIGN KEY (floor_id, building_id) REFERENCES floors(id, building_id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_room_floor
        FOREIGN KEY (room_id, floor_id) REFERENCES rooms(id, floor_id) ON DELETE RESTRICT,

    -- บังคับกรอกเหตุผลเสมอเมื่อสถานะเป็น unrepairable (ซ่อมไม่ได้) หรือ cancelled (ยกเลิก)
    CONSTRAINT chk_tickets_reason_required
        CHECK (
            status NOT IN ('unrepairable', 'cancelled')
            OR (status_note IS NOT NULL AND length(btrim(status_note)) > 0)
        )
);

COMMENT ON TABLE tickets IS 'ตารางใบแจ้งซ่อมหลัก (Zero PII ไม่เก็บข้อมูลส่วนบุคคลผู้แจ้งซ่อม)';

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 10/12: ticket_photos (รูปภาพก่อนซ่อม 1-3 รูป และหลังซ่อม 1-3 รูป)
CREATE TABLE IF NOT EXISTS ticket_photos (
    id                  SERIAL PRIMARY KEY,
    ticket_id           INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    photo_type          VARCHAR(10) NOT NULL CHECK (photo_type IN ('before', 'after')),
    storage_path        VARCHAR(500) NOT NULL,
    public_url          VARCHAR(1000) NOT NULL,
    mime_type           VARCHAR(50) NOT NULL DEFAULT 'image/webp'
                        CHECK (mime_type IN ('image/webp', 'image/jpeg', 'image/png')),
    file_size_bytes     INT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 5242880),
    display_order       SMALLINT NOT NULL DEFAULT 1 CHECK (display_order BETWEEN 1 AND 3),
    uploaded_by_user_id INT REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ticket_photos_slot UNIQUE (ticket_id, photo_type, display_order)
);

COMMENT ON TABLE ticket_photos IS 'ตารางเก็บรูปภาพประกอบใบแจ้งซ่อม แยกเป็น before (ก่อนซ่อม 1-3 รูป) และ after (หลังซ่อม 1-3 รูป)';

-- Table 11/12: ticket_technicians (ตารางเชื่อมช่างที่เข้าปฏิบัติงานหน้างาน Many-to-Many)
CREATE TABLE IF NOT EXISTS ticket_technicians (
    ticket_id     INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    technician_id INT NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ticket_id, technician_id)
);

COMMENT ON TABLE ticket_technicians IS 'ตารางเชื่อมรายชื่อช่างที่ร่วมปฏิบัติงานในแต่ละใบแจ้งซ่อม (เลือกได้ตั้งแต่ 1 คนขึ้นไปตอนปิดงาน)';

-- Table 12/12: ticket_status_logs (ประวัติการเปลี่ยนสถานะทุกขั้นตอน / Audit Trail)
CREATE TABLE IF NOT EXISTS ticket_status_logs (
    id                 SERIAL PRIMARY KEY,
    ticket_id          INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    from_status        VARCHAR(20)
                       CHECK (from_status IS NULL OR from_status IN (
                           'pending',
                           'in_progress',
                           'waiting_parts',
                           'completed',
                           'unrepairable',
                           'cancelled'
                       )),
    to_status          VARCHAR(20) NOT NULL
                       CHECK (to_status IN (
                           'pending',
                           'in_progress',
                           'waiting_parts',
                           'completed',
                           'unrepairable',
                           'cancelled'
                       )),
    note               TEXT,
    changed_by_user_id INT REFERENCES users(id) ON DELETE RESTRICT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ticket_status_logs IS 'ตารางบันทึกประวัติการเปลี่ยนสถานะใบแจ้งซ่อมทุกขั้นตอน (Timeline)';

-- =============================================================================
-- 7. Indexes สำหรับเพิ่มความเร็วในการตรวจแจ้งซ้ำ, ค้นหารหัส และดึงรายงานสถิติ
-- =============================================================================

-- Index 1: ค้นหาและติดตามสถานะใบแจ้งซ่อมด้วยรหัส MMS-YYYYMM-NNN
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_code
    ON tickets (ticket_code);

-- Index 2: ตรวจสอบการแจ้งซ้ำแบบ Real-time (ห้องเดียวกัน + หมวดหมู่เดียวกัน ที่ยังเปิดค้างอยู่)
CREATE INDEX IF NOT EXISTS idx_tickets_open_duplicate_check
    ON tickets (room_id, category_id)
    WHERE status IN ('pending', 'in_progress', 'waiting_parts');

-- Index 3: รายงานสถิติรายเดือน/รายปี และตาราง Cross-tab (อาคาร x เดือน x หมวดหมู่ x สถานะ)
CREATE INDEX IF NOT EXISTS idx_tickets_reporting_composite
    ON tickets (created_at DESC, building_id, category_id, status);

-- Index 3: คิวงานช่างและการกรองตามสถานะล่าสุด
CREATE INDEX IF NOT EXISTS idx_tickets_status_created
    ON tickets (status, created_at DESC);

-- Index 4: ดึงชั้นตามอาคาร และดึงห้องตามชั้น
CREATE INDEX IF NOT EXISTS idx_floors_building_sort
    ON floors (building_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_rooms_floor_sort
    ON rooms (floor_id, sort_order, id);

-- Index 5: ดึงรูปภาพ ช่างผู้รับผิดชอบ และ Timeline ของใบแจ้งซ่อม
CREATE INDEX IF NOT EXISTS idx_ticket_photos_ticket_type
    ON ticket_photos (ticket_id, photo_type, display_order);

CREATE INDEX IF NOT EXISTS idx_ticket_technicians_tech_id
    ON ticket_technicians (technician_id, ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_status_logs_ticket_created
    ON ticket_status_logs (ticket_id, created_at ASC);

-- =============================================================================
-- 8. เปิดใช้งาน Row Level Security (RLS) บนทุกตารางใน public schema
--    เพื่อปิดกั้นการเข้าถึงผ่าน Supabase Anon Key โดยตรงจากภายนอก
--    (Go Backend ที่เชื่อมต่อผ่าน DATABASE_URL / service_role จะทำงานได้เต็มสิทธิ์)
-- =============================================================================
ALTER TABLE ticket_counters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms               ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporter_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_photos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_technicians  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_status_logs  ENABLE ROW LEVEL SECURITY;

COMMIT;
