-- =============================================================================
-- e-MaintenanceManagementSystem (e-MMS) — ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์
-- File: database/seed/002_seed_master_data.sql
-- Purpose: ข้อมูลเริ่มต้น (Master Data Seed) สำหรับระบบ e-MMS
--          - ประเภทผู้แจ้งซ่อม (Zero PII ตาม ADR-002)
--          - หมวดหมู่งานซ่อมบำรุง
--          - ตัวอย่างโครงสร้างสถานที่ 3 ระดับ (อาคาร -> ชั้น -> ห้อง/บริเวณ)
--          - ตัวอย่างรายชื่อช่างปฏิบัติงาน
--          - บัญชีผู้ใช้งานหลังบ้านเริ่มต้น 3 บทบาท (admin, technician, reporter)
-- หมายเหตุ: ออกแบบให้รันซ้ำได้ปลอดภัย (Idempotent / ON CONFLICT)
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. ประเภทผู้แจ้งซ่อม (reporter_types) — ตามข้อตกลง ADR-002
-- =============================================================================
INSERT INTO reporter_types (code, name, sort_order, is_active)
VALUES
    ('STAFF',        'เจ้าหน้าที่', 1, true),
    ('STUDENT',      'นักศึกษา',   2, true),
    ('HOUSEKEEPING', 'แม่บ้าน',    3, true),
    ('SECURITY',     'รปภ.',      4, true),
    ('OTHER',        'อื่นๆ',      5, true)
ON CONFLICT (name) DO UPDATE SET
    code       = EXCLUDED.code,
    sort_order = EXCLUDED.sort_order;

-- =============================================================================
-- 2. หมวดหมู่งานซ่อมบำรุง (categories)
-- =============================================================================
INSERT INTO categories (code, name, description, sort_order, is_active)
VALUES
    ('ELEC',  'ระบบไฟฟ้าและแสงสว่าง',              'หลอดไฟดับ, โคมไฟกะพริบ, ปลั๊กไฟชำรุด, สวิตช์ไฟเสีย, เบรกเกอร์ทริป', 1, true),
    ('AIR',   'ระบบเครื่องปรับอากาศและระบายอากาศ', 'แอร์ไม่เย็น, แอร์น้ำหยด, แอร์มีเสียงดัง, รีโมทแอร์เสีย, พัดลมดูดอากาศไม่ทำงาน', 2, true),
    ('PLUMB', 'ระบบประปาและสุขภัณฑ์',              'ท่อน้ำรั่ว, ก๊อกน้ำหยด, ชักโครกกดไม่ลง, สายชำระรั่ว, อ่างล้างมือตัน, น้ำไม่ไหล', 3, true),
    ('CIVIL', 'โครงสร้างอาคาร ประตู หน้าต่าง',      'ลูกบิดประตูเสีย, กลอนประตูค้าง, บานพับหลุด, กระจกร้าว, ฝ้าเพดานชำรุด, พื้นกระเบื้องหลุด', 4, true),
    ('FURN',  'ครุภัณฑ์และเฟอร์นิเจอร์',           'โต๊ะชำรุด, เก้าอี้หัก, ตู้เก็บเอกสารเปิดไม่ได้, กระดานไวท์บอร์ดหลุด', 5, true),
    ('IT_AV', 'โสตทัศนูปกรณ์และเครือข่าย',         'โปรเจคเตอร์ไม่ติด, จอรับภาพค้าง, ไมโครโฟนไม่ดัง, ลำโพงห้องประชุมขัดข้อง', 6, true),
    ('OTHER', 'งานซ่อมบำรุงทั่วไป / อื่นๆ',         'งานซ่อมบำรุงอื่นๆ นอกเหนือจากหมวดหมู่ข้างต้น', 7, true)
ON CONFLICT (name) DO UPDATE SET
    code        = EXCLUDED.code,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order;

-- =============================================================================
-- 3. ตัวอย่างโครงสร้างสถานที่ 3 ระดับ (อาคาร -> ชั้น -> ห้อง/บริเวณ)
--    ผู้ดูแลระบบ (Admin) สามารถเพิ่ม/แก้ไข/ปิดใช้งานได้ภายหลังผ่านหน้าจัดการข้อมูลหลัก
-- =============================================================================

-- 3.1 อาคาร (buildings)
INSERT INTO buildings (code, name, sort_order, is_active)
VALUES
    ('BLD-01', 'อาคารอำนวยการและบริหาร',     1, true),
    ('BLD-02', 'อาคารปฏิบัติการและเรียนรวม', 2, true),
    ('BLD-03', 'อาคารบริการและพื้นที่ส่วนกลาง', 3, true)
ON CONFLICT (name) DO UPDATE SET
    code       = EXCLUDED.code,
    sort_order = EXCLUDED.sort_order;

-- 3.2 ชั้น (floors)
-- อาคาร 1: อาคารอำนวยการและบริหาร
INSERT INTO floors (building_id, name, sort_order, is_active)
SELECT b.id, v.floor_name, v.sort_order, true
FROM buildings b
CROSS JOIN (VALUES
    ('ชั้น 1', 1),
    ('ชั้น 2', 2)
) AS v(floor_name, sort_order)
WHERE b.code = 'BLD-01'
ON CONFLICT (building_id, name) DO UPDATE SET
    sort_order = EXCLUDED.sort_order;

-- อาคาร 2: อาคารปฏิบัติการและเรียนรวม
INSERT INTO floors (building_id, name, sort_order, is_active)
SELECT b.id, v.floor_name, v.sort_order, true
FROM buildings b
CROSS JOIN (VALUES
    ('ชั้น 1', 1),
    ('ชั้น 2', 2),
    ('ชั้น 3', 3)
) AS v(floor_name, sort_order)
WHERE b.code = 'BLD-02'
ON CONFLICT (building_id, name) DO UPDATE SET
    sort_order = EXCLUDED.sort_order;

-- อาคาร 3: อาคารบริการและพื้นที่ส่วนกลาง
INSERT INTO floors (building_id, name, sort_order, is_active)
SELECT b.id, v.floor_name, v.sort_order, true
FROM buildings b
CROSS JOIN (VALUES
    ('ชั้น 1', 1)
) AS v(floor_name, sort_order)
WHERE b.code = 'BLD-03'
ON CONFLICT (building_id, name) DO UPDATE SET
    sort_order = EXCLUDED.sort_order;

-- 3.3 ห้อง / บริเวณ (rooms)
-- ห้องใน อาคาร 1 ชั้น 1
INSERT INTO rooms (floor_id, code, name, sort_order, is_active)
SELECT f.id, v.room_code, v.room_name, v.sort_order, true
FROM floors f
JOIN buildings b ON b.id = f.building_id
CROSS JOIN (VALUES
    ('A100', 'โถงประชาสัมพันธ์กลาง ชั้น 1', 1),
    ('A101', 'ห้องสำนักงานบริหาร (101)',    2),
    ('A102', 'ห้องประชุมย่อย (102)',        3),
    ('A1-WC','ห้องน้ำส่วนกลาง ชั้น 1',       4)
) AS v(room_code, room_name, sort_order)
WHERE b.code = 'BLD-01' AND f.name = 'ชั้น 1'
ON CONFLICT (floor_id, name) DO UPDATE SET
    code       = EXCLUDED.code,
    sort_order = EXCLUDED.sort_order;

-- ห้องใน อาคาร 1 ชั้น 2
INSERT INTO rooms (floor_id, code, name, sort_order, is_active)
SELECT f.id, v.room_code, v.room_name, v.sort_order, true
FROM floors f
JOIN buildings b ON b.id = f.building_id
CROSS JOIN (VALUES
    ('A201', 'ห้องฝ่ายบุคคลและธุรการ (201)', 1),
    ('A202', 'ห้องประชุมใหญ่ (202)',         2),
    ('A2-WC','ห้องน้ำส่วนกลาง ชั้น 2',       3)
) AS v(room_code, room_name, sort_order)
WHERE b.code = 'BLD-01' AND f.name = 'ชั้น 2'
ON CONFLICT (floor_id, name) DO UPDATE SET
    code       = EXCLUDED.code,
    sort_order = EXCLUDED.sort_order;

-- ห้องใน อาคาร 2 ชั้น 1
INSERT INTO rooms (floor_id, code, name, sort_order, is_active)
SELECT f.id, v.room_code, v.room_name, v.sort_order, true
FROM floors f
JOIN buildings b ON b.id = f.building_id
CROSS JOIN (VALUES
    ('B100', 'โถงทางเดินและหน้าลิฟต์ ชั้น 1',     1),
    ('B101', 'ห้องบรรยายรวม 1 (1101)',           2),
    ('B102', 'ห้องปฏิบัติการคอมพิวเตอร์ 1 (1102)', 3),
    ('B1-WC','ห้องน้ำส่วนกลาง ชั้น 1',            4)
) AS v(room_code, room_name, sort_order)
WHERE b.code = 'BLD-02' AND f.name = 'ชั้น 1'
ON CONFLICT (floor_id, name) DO UPDATE SET
    code       = EXCLUDED.code,
    sort_order = EXCLUDED.sort_order;

-- ห้องใน อาคาร 2 ชั้น 2
INSERT INTO rooms (floor_id, code, name, sort_order, is_active)
SELECT f.id, v.room_code, v.room_name, v.sort_order, true
FROM floors f
JOIN buildings b ON b.id = f.building_id
CROSS JOIN (VALUES
    ('B200', 'โถงทางเดินและหน้าลิฟต์ ชั้น 2', 1),
    ('B201', 'ห้องบรรยายรวม 2 (1201)',       2),
    ('B202', 'ห้องพักเจ้าหน้าที่ (1202)',     3),
    ('B2-WC','ห้องน้ำส่วนกลาง ชั้น 2',        4)
) AS v(room_code, room_name, sort_order)
WHERE b.code = 'BLD-02' AND f.name = 'ชั้น 2'
ON CONFLICT (floor_id, name) DO UPDATE SET
    code       = EXCLUDED.code,
    sort_order = EXCLUDED.sort_order;

-- ห้องใน อาคาร 2 ชั้น 3
INSERT INTO rooms (floor_id, code, name, sort_order, is_active)
SELECT f.id, v.room_code, v.room_name, v.sort_order, true
FROM floors f
JOIN buildings b ON b.id = f.building_id
CROSS JOIN (VALUES
    ('B301', 'ห้องสัมมนา (1301)',           1),
    ('B302', 'ห้องควบคุมระบบโสตฯ (1302)',   2),
    ('B3-WC','ห้องน้ำส่วนกลาง ชั้น 3',      3)
) AS v(room_code, room_name, sort_order)
WHERE b.code = 'BLD-02' AND f.name = 'ชั้น 3'
ON CONFLICT (floor_id, name) DO UPDATE SET
    code       = EXCLUDED.code,
    sort_order = EXCLUDED.sort_order;

-- ห้องใน อาคาร 3 ชั้น 1
INSERT INTO rooms (floor_id, code, name, sort_order, is_active)
SELECT f.id, v.room_code, v.room_name, v.sort_order, true
FROM floors f
JOIN buildings b ON b.id = f.building_id
CROSS JOIN (VALUES
    ('C101', 'ศูนย์อาหารและพื้นที่พักผ่อน',  1),
    ('C102', 'ป้อมรักษาความปลอดภัย (รปภ.)', 2),
    ('C103', 'ลานจอดรถและทางเดินเชื่อม',    3),
    ('C1-WC','ห้องน้ำรวมอาคารบริการ',        4)
) AS v(room_code, room_name, sort_order)
WHERE b.code = 'BLD-03' AND f.name = 'ชั้น 1'
ON CONFLICT (floor_id, name) DO UPDATE SET
    code       = EXCLUDED.code,
    sort_order = EXCLUDED.sort_order;

-- =============================================================================
-- 4. ตัวอย่างรายชื่อช่างปฏิบัติงาน (technicians)
--    แยกอิสระจากบัญชีล็อกอิน เพื่อให้เลือกชื่อช่างที่ลงหน้างานได้หลายคนตอนปิดงาน
-- =============================================================================
INSERT INTO technicians (full_name, nickname, specialty, phone, sort_order, is_active)
VALUES
    ('นายสมชาย สายฟ้า',     'ช่างชาย',   'ระบบไฟฟ้าและเครื่องปรับอากาศ',                 '081-000-0001', 1, true),
    ('นายวิชัย น้ำใส',       'ช่างวิชัย', 'ระบบประปาและสุขภัณฑ์',                         '081-000-0002', 2, true),
    ('นายประเสริฐ การช่าง',  'ช่างเสริฐ', 'โครงสร้างอาคาร ประตู หน้าต่าง และเฟอร์นิเจอร์', '081-000-0003', 3, true),
    ('นายอนุชา เทคโน',      'ช่างนุ',    'โสตทัศนูปกรณ์และงานซ่อมบำรุงทั่วไป',            '081-000-0004', 4, true)
ON CONFLICT (full_name) DO UPDATE SET
    nickname   = EXCLUDED.nickname,
    specialty  = EXCLUDED.specialty,
    sort_order = EXCLUDED.sort_order;

-- =============================================================================
-- 5. บัญชีผู้ใช้งานหลังบ้านเริ่มต้น (users) ครบทั้ง 3 บทบาท
--    ใช้ pgcrypto สร้าง bcrypt hash (cost 10) ที่เข้ากันได้กับ Go bcrypt 100%
--    หมายเหตุสำคัญ: แนะนำให้ Admin เปลี่ยนรหัสผ่านทันทีหลังเข้าใช้งานครั้งแรก
--    - admin      / Admin@1234   (สิทธิ์ผู้ดูแลระบบสูงสุด)
--    - tech       / Tech@1234    (สิทธิ์ทีมช่างซ่อมบำรุง)
--    - reporter   / Report@1234  (สิทธิ์ผู้บริหาร/ผู้ดูรายงานสถิติ Read-only)
-- =============================================================================
INSERT INTO users (username, password_hash, display_name, role, is_active)
VALUES
    ('admin',    crypt('Admin@1234',  gen_salt('bf', 10)), 'ผู้ดูแลระบบหลัก (Admin)',        'admin',      true),
    ('tech',     crypt('Tech@1234',   gen_salt('bf', 10)), 'ทีมช่างซ่อมบำรุง (Technician)', 'technician', true),
    ('reporter', crypt('Report@1234', gen_salt('bf', 10)), 'ผู้ตรวจรายงานสถิติ (Reporter)',   'reporter',   true)
ON CONFLICT (username) DO NOTHING;

COMMIT;
