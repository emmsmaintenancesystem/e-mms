-- =============================================================================
-- e-MaintenanceManagementSystem (e-MMS) — ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์
-- File: database/migrations/003_storage_setup.sql
-- Purpose: ตั้งค่า Supabase Storage Bucket 'ticket-photos' สำหรับเก็บรูปก่อน/หลังซ่อม
--          - จำกัดขนาดไฟล์สูงสุดไม่เกิน 2MB ต่อรูป (ฝั่ง Frontend บีบอัด WebP <= 150KB)
--          - อนุญาตเฉพาะไฟล์รูปภาพ image/webp, image/jpeg, image/png
--          - ปิดกั้นการอัปโหลด/แก้ไข/ลบจากบุคคลภายนอก (Anon) 100%
--          - อนุญาตให้เฉพาะ Go Backend (ใช้ SUPABASE_SERVICE_ROLE_KEY) อัปโหลดไฟล์ได้เท่านั้น
-- =============================================================================

BEGIN;

-- 1. สร้างหรืออัปเดต Bucket 'ticket-photos' ใน Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ticket-photos',
    'ticket-photos',
    true,
    2097152, -- จำกัดขนาดสูงสุด 2 MB (2 * 1024 * 1024 bytes)
    ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. ล้าง Policy เดิม (กรณีรันซ้ำ) และเปิดเฉพาะสิทธิ์อ่านรูปผ่าน URL ของไฟล์เท่านั้น
--    (ห้ามเปิดสิทธิ์ INSERT / UPDATE / DELETE ให้ anon เด็ดขาด!)
DROP POLICY IF EXISTS "emms_public_read_ticket_photos" ON storage.objects;

CREATE POLICY "emms_public_read_ticket_photos"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'ticket-photos');

COMMIT;
