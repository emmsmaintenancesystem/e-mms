-- =============================================================================
-- e-MaintenanceManagementSystem (e-MMS) — ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์
-- File: database/migrations/004_subcategories.sql
-- Purpose: เพิ่มระบบหมวดหมู่ย่อย (2-Level Category: categories -> subcategories)
--          เช่น หมวดไฟฟ้า -> หลอดไฟ/โคมไฟ, ปลั๊กไฟ/เต้ารับ, สวิตช์ไฟ, เบรกเกอร์ ฯลฯ
--          พร้อมอัปเดตตาราง tickets, Indexes สำหรับตรวจงานซ้ำระดับหมวดย่อย, RLS
--          และลงข้อมูลเริ่มต้น (Seed Subcategories) ครบทั้ง 7 หมวดหลัก
-- หมายเหตุ: ออกแบบให้รันซ้ำได้ปลอดภัย (Idempotent) บน Supabase SQL Editor
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. เพิ่ม Constraint UNIQUE (id, id) หรือใช้ PRIMARY KEY ของ categories
--    และสร้างตาราง subcategories (หมวดหมู่ย่อย / รายการอุปกรณ์)
-- =============================================================================
CREATE TABLE IF NOT EXISTS subcategories (
    id          SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    code        VARCHAR(40) UNIQUE,
    name        VARCHAR(120) NOT NULL,
    description VARCHAR(255),
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_subcategories_category_name UNIQUE (category_id, name),
    CONSTRAINT uq_subcategories_id_category UNIQUE (id, category_id)
);

COMMENT ON TABLE subcategories IS 'ตารางข้อมูลหลัก: หมวดหมู่ย่อย/รายการอุปกรณ์ เชื่อมกับหมวดหมู่หลัก (categories)';

DROP TRIGGER IF EXISTS trg_subcategories_updated_at ON subcategories;
CREATE TRIGGER trg_subcategories_updated_at
    BEFORE UPDATE ON subcategories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2. เพิ่มคอลัมน์ subcategory_id ในตาราง tickets (รองรับใบงานเดิมให้เป็น NULL ได้)
--    พร้อม Composite Foreign Key บังคับให้หมวดย่อยต้องสังกัดหมวดหลักที่เลือกจริง
-- =============================================================================
ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS subcategory_id INT REFERENCES subcategories(id) ON DELETE RESTRICT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_tickets_subcategory_category'
    ) THEN
        ALTER TABLE tickets
            ADD CONSTRAINT fk_tickets_subcategory_category
            FOREIGN KEY (subcategory_id, category_id)
            REFERENCES subcategories(id, category_id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

-- =============================================================================
-- 3. สร้าง Indexes สำหรับดึงหมวดหมู่ย่อย และตรวจสอบการแจ้งซ้ำระดับหมวดหมู่ย่อย
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_subcategories_category_sort
    ON subcategories (category_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_tickets_open_duplicate_subcat_check
    ON tickets (room_id, category_id, subcategory_id)
    WHERE status IN ('pending', 'in_progress', 'waiting_parts');

-- เปิดใช้งาน RLS บนตาราง subcategories
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. ข้อมูลเริ่มต้น (Seed Data) สำหรับหมวดหมู่ย่อยครบทั้ง 7 หมวดหลัก
-- =============================================================================

-- 4.1 หมวด ELEC: ระบบไฟฟ้าและแสงสว่าง
INSERT INTO subcategories (category_id, code, name, description, sort_order, is_active)
SELECT c.id, v.sub_code, v.sub_name, v.sub_desc, v.sort_order, true
FROM categories c
CROSS JOIN (VALUES
    ('ELEC-BULB',    'หลอดไฟ / โคมไฟ',             'หลอดไฟดับ, หลอดไฟกะพริบ, โคมไฟชำรุด, ไฟฉุกเฉินไม่ติด', 1),
    ('ELEC-OUTLET',  'ปลั๊กไฟ / เต้ารับ',          'ปลั๊กไฟไม่มีไฟ, เต้ารับหลวม/แตก, ปลั๊กมีกลิ่นไหม้',     2),
    ('ELEC-SWITCH',  'สวิตช์ไฟ',                   'สวิตช์ไฟกดไม่ติด, สวิตช์ค้าง, แป้นสวิตช์หลุด',           3),
    ('ELEC-BREAKER', 'เบรกเกอร์ / ตู้ควบคุมไฟ',    'เบรกเกอร์ทริป/ตัดไฟ, ไฟดับทั้งห้อง/โซน',               4),
    ('ELEC-FAN',     'พัดลมเพดาน / พัดลมติดผนัง',  'พัดลมไม่หมุน, พัดลมมีเสียงดัง, สวิตช์พัดลมเสีย',        5),
    ('ELEC-OTHER',   'อื่นๆ (ระบบไฟฟ้า)',          'สายไฟชำรุด หรือปัญหาไฟฟ้าอื่นๆ',                       6)
) AS v(sub_code, sub_name, sub_desc, sort_order)
WHERE c.code = 'ELEC'
ON CONFLICT (category_id, name) DO UPDATE SET
    code        = EXCLUDED.code,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order;

-- 4.2 หมวด AIR: ระบบเครื่องปรับอากาศและระบายอากาศ
INSERT INTO subcategories (category_id, code, name, description, sort_order, is_active)
SELECT c.id, v.sub_code, v.sub_name, v.sub_desc, v.sort_order, true
FROM categories c
CROSS JOIN (VALUES
    ('AIR-COOL',    'แอร์ไม่เย็น / ลมไม่ออก',     'แอร์มีแต่ลมธรรมดา, แอร์เย็นช้า, บานสวิงค้าง',          1),
    ('AIR-LEAK',    'แอร์น้ำหยด / น้ำรั่ว',       'น้ำแอร์หยดลงพื้น/ฝ้า, ท่อน้ำทิ้งแอร์ตัน',              2),
    ('AIR-POWER',   'แอร์เปิดไม่ติด / ไฟกะพริบ',   'แอร์ไม่ทำงาน, ไฟหน้าเครื่องกะพริบแจ้ง Error',          3),
    ('AIR-NOISE',   'แอร์มีเสียงดัง / กลิ่นอับ',   'แอร์เสียงดังผิดปกติ, มีกลิ่นเหม็นอับ/กลิ่นไหม้',        4),
    ('AIR-REMOTE',  'รีโมทแอร์ / ปุ่มควบคุม',      'รีโมทแอร์กดไม่ติด, หน้าจอรีโมทดับ/ถ่านหมด',           5),
    ('AIR-EXHAUST', 'พัดลมดูดอากาศ / ระบายอากาศ', 'พัดลมดูดอากาศห้องน้ำหรือห้องปฏิบัติการไม่ทำงาน',       6)
) AS v(sub_code, sub_name, sub_desc, sort_order)
WHERE c.code = 'AIR'
ON CONFLICT (category_id, name) DO UPDATE SET
    code        = EXCLUDED.code,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order;

-- 4.3 หมวด PLUMB: ระบบประปาและสุขภัณฑ์
INSERT INTO subcategories (category_id, code, name, description, sort_order, is_active)
SELECT c.id, v.sub_code, v.sub_name, v.sub_desc, v.sort_order, true
FROM categories c
CROSS JOIN (VALUES
    ('PLUMB-FAUCET', 'ก๊อกน้ำ / อ่างล้างมือ',       'ก๊อกน้ำหยด/ปิดไม่สนิท, อ่างล้างมือตัน, ท่อใต้อ่างรั่ว', 1),
    ('PLUMB-TOILET', 'ชักโครก / โถปัสสาวะ',        'ชักโครกกดไม่ลง, น้ำไหลค้าง, ฟลัชวาล์วเสีย',            2),
    ('PLUMB-SPRAY',  'สายฉีดชำระ',                'หัวฉีดชำระรั่ว/แตก, สายฉีดน้ำซึม',                    3),
    ('PLUMB-PIPE',   'ท่อน้ำประปา / ท่อน้ำทิ้ง',    'ท่อน้ำแตกรั่ว, ท่อระบายน้ำพื้นห้องน้ำอุดตัน',           4),
    ('PLUMB-WATER',  'น้ำไม่ไหล / น้ำไหลเบา',       'น้ำประปาไม่ไหล, ปั๊มน้ำไม่ทำงาน',                      5),
    ('PLUMB-OTHER',  'อื่นๆ (ระบบประปา/สุขภัณฑ์)', 'อุปกรณ์ห้องน้ำอื่นๆ ชำรุด',                           6)
) AS v(sub_code, sub_name, sub_desc, sort_order)
WHERE c.code = 'PLUMB'
ON CONFLICT (category_id, name) DO UPDATE SET
    code        = EXCLUDED.code,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order;

-- 4.4 หมวด CIVIL: โครงสร้างอาคาร ประตู หน้าต่าง
INSERT INTO subcategories (category_id, code, name, description, sort_order, is_active)
SELECT c.id, v.sub_code, v.sub_name, v.sub_desc, v.sort_order, true
FROM categories c
CROSS JOIN (VALUES
    ('CIVIL-DOOR',    'ประตู / ลูกบิด / กลอนประตู', 'ลูกบิดเสีย, กลอนประตูค้าง, บานพับประตูตก, โช้คประตูเสีย', 1),
    ('CIVIL-WINDOW',  'หน้าต่าง / กระจก',          'หน้าต่างปิดไม่ได้, มือจับหลุด, กระจกร้าว/แตก',          2),
    ('CIVIL-CEILING', 'ฝ้าเพดาน / หลังคา',         'ฝ้าเพดานทะลุ/บวมน้ำ, น้ำรั่วซึมจากเพดาน',              3),
    ('CIVIL-FLOOR',   'พื้น / กระเบื้อง / ผนัง',    'กระเบื้องพื้นหลุดร่อน/แตก, ผนังแตกร้าว',                4),
    ('CIVIL-OTHER',   'อื่นๆ (โครงสร้างอาคาร)',     'ราวบันได, ทางเดิน, ป้ายอาคาร หรือโครงสร้างอื่นๆ',       5)
) AS v(sub_code, sub_name, sub_desc, sort_order)
WHERE c.code = 'CIVIL'
ON CONFLICT (category_id, name) DO UPDATE SET
    code        = EXCLUDED.code,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order;

-- 4.5 หมวด FURN: ครุภัณฑ์และเฟอร์นิเจอร์
INSERT INTO subcategories (category_id, code, name, description, sort_order, is_active)
SELECT c.id, v.sub_code, v.sub_name, v.sub_desc, v.sort_order, true
FROM categories c
CROSS JOIN (VALUES
    ('FURN-DESK',    'โต๊ะเรียน / โต๊ะทำงาน',       'ขาโต๊ะโยก/หัก, หน้าโต๊ะชำรุด',                        1),
    ('FURN-CHAIR',   'เก้าอี้ / ม้านั่ง',            'เก้าอี้ขาหัก, พนักพิงหลุด, ล้อเก้าอี้ชำรุด',             2),
    ('FURN-CABINET', 'ตู้เอกสาร / ชั้นวางของ',      'บานตู้หลุด, กุญแจตู้ค้าง, ชั้นวางชำรุด',                3),
    ('FURN-BOARD',   'กระดานไวท์บอร์ด / ป้ายประกาศ','กระดานไวท์บอร์ดหลุด, รางวางปากกาชำรุด',               4),
    ('FURN-CURTAIN', 'ผ้าม่าน / มูลี่',             'รางผ้าม่านหลุด, เชือกดึงมูลี่ขาด',                      5),
    ('FURN-OTHER',   'อื่นๆ (เฟอร์นิเจอร์)',        'ครุภัณฑ์หรือเฟอร์นิเจอร์อื่นๆ',                         6)
) AS v(sub_code, sub_name, sub_desc, sort_order)
WHERE c.code = 'FURN'
ON CONFLICT (category_id, name) DO UPDATE SET
    code        = EXCLUDED.code,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order;

-- 4.6 หมวด IT_AV: โสตทัศนูปกรณ์และเครือข่าย
INSERT INTO subcategories (category_id, code, name, description, sort_order, is_active)
SELECT c.id, v.sub_code, v.sub_name, v.sub_desc, v.sort_order, true
FROM categories c
CROSS JOIN (VALUES
    ('IT-PROJ',   'โปรเจคเตอร์ / จอรับภาพ / ทีวี', 'โปรเจคเตอร์ไม่ติด/ภาพไม่ขึ้น, จอโปรเจคเตอร์ไม่เลื่อน',   1),
    ('IT-SOUND',  'ไมโครโฟน / ลำโพง / เครื่องเสียง','ไมค์ไม่ดัง, ลำโพงมีเสียงหอน/ซ่า, เครื่องขยายเสียงไม่ติด', 2),
    ('IT-CABLE',  'สายสัญญาณ HDMI / VGA / ปลั๊กพ่วง','สายเชื่อมต่อภาพ/เสียงชำรุด, กล่องต่อสายที่โพเดียมเสีย',  3),
    ('IT-NET',    'อินเทอร์เน็ต / Wi-Fi / สาย LAN', 'เชื่อมต่อ Wi-Fi ไม่ได้, เต้ารับสาย LAN ชำรุด',          4),
    ('IT-OTHER',  'อื่นๆ (โสตฯ และเครือข่าย)',      'อุปกรณ์โสตทัศนูปกรณ์อื่นๆ ในห้องเรียน/ห้องประชุม',      5)
) AS v(sub_code, sub_name, sub_desc, sort_order)
WHERE c.code = 'IT_AV'
ON CONFLICT (category_id, name) DO UPDATE SET
    code        = EXCLUDED.code,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order;

-- 4.7 หมวด OTHER: งานซ่อมบำรุงทั่วไป / อื่นๆ
INSERT INTO subcategories (category_id, code, name, description, sort_order, is_active)
SELECT c.id, v.sub_code, v.sub_name, v.sub_desc, v.sort_order, true
FROM categories c
CROSS JOIN (VALUES
    ('OTHER-GEN',  'งานซ่อมบำรุงทั่วไป',            'งานซ่อมแซมจุดชำรุดทั่วไปภายในอาคาร',                  1),
    ('OTHER-OUT',  'พื้นที่ภายนอก / ลานจอดรถ / สวน', 'ไฟทางเดินภายนอก, พื้นทางเท้า, ท่อระบายน้ำภายนอก',     2),
    ('OTHER-MISC', 'อื่นๆ (ระบุในรายละเอียดอาการ)',   'รายการอื่นๆ ที่ไม่อยู่ในหมวดหมู่ข้างต้น',               3)
) AS v(sub_code, sub_name, sub_desc, sort_order)
WHERE c.code = 'OTHER'
ON CONFLICT (category_id, name) DO UPDATE SET
    code        = EXCLUDED.code,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order;

COMMIT;
