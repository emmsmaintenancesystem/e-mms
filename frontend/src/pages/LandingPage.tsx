import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  History,
  Megaphone,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  SavedLocalTicket,
  getSavedLocalTickets,
  removeLocalTicket,
} from '../lib/ticketHistory';
import { StatusBadge } from '../components/StatusBadge';
import { formatThaiDateTime } from '../types/api';

// ข่าวสารและประกาศประชาสัมพันธ์ (สามารถปรับแก้ข้อความหรือเพิ่มประกาศใหม่ได้ง่าย)
const SYSTEM_ANNOUNCEMENTS = [
  {
    id: 1,
    badge: 'ประชาสัมพันธ์',
    title: 'เปิดให้บริการระบบแจ้งซ่อมบำรุงออนไลน์ (e-MMS) รูปแบบใหม่',
    detail:
      'ผู้ใช้งานสามารถแจ้งซ่อมผ่านสมาร์ทโฟนได้ทันทีโดยไม่ต้องล็อกอิน พร้อมแนบรูปถ่ายจุดชำรุดเพื่อให้ทีมช่างเข้าตรวจสอบได้อย่างรวดเร็ว',
    dateLabel: 'ประกาศล่าสุด',
    isHighlight: true,
  },
  {
    id: 2,
    badge: 'คำแนะนำ',
    title: 'การติดตามสถานะงานซ่อมด้วยรหัสใบงาน MMS-YYYYMM-NNN',
    detail:
      'หลังกดส่งแจ้งซ่อม ระบบจะออกรหัสใบงานและบันทึกไว้ในมือถือเครื่องนั้นอัตโนมัติ สามารถกดดูความคืบหน้าและรูปหลังซ่อมได้ตลอด 24 ชั่วโมง',
    dateLabel: 'คู่มือผู้ใช้งาน',
    isHighlight: false,
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [quickTrackCode, setQuickTrackCode] = useState<string>('');
  const [savedTickets, setSavedTickets] = useState<SavedLocalTicket[]>(() =>
    getSavedLocalTickets()
  );

  const handleQuickTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickTrackCode.trim().toUpperCase();
    if (!clean) {
      navigate('/track');
      return;
    }
    navigate(`/track/${encodeURIComponent(clean)}`);
  };

  const handleRemoveSaved = (code: string) => {
    setSavedTickets(removeLocalTicket(code));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {/* =====================================================================
          1. Hero Welcome & Logo Showcase Section
         ===================================================================== */}
      <section className="emms-card p-6 sm:p-8 lg:p-10 relative overflow-hidden bg-gradient-to-br from-[#121420] via-[#121420] to-[#2F6BFF]/15 border-[#1E2235]">
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
          {/* Logo Container (รองรับการวางภาพโลโก้ระบบในอนาคต) */}
          <div className="shrink-0 flex flex-col items-center">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-[#090A10] border-2 border-[#2F6BFF]/50 shadow-xl shadow-[#2F6BFF]/20 flex flex-col items-center justify-center p-3 relative group">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#2F6BFF] flex items-center justify-center text-white shadow-md">
                <Wrench className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="mt-1.5 text-xs font-black tracking-wider text-[#F3F5FA]">
                e-MMS
              </span>
            </div>
          </div>

          {/* Welcome Message */}
          <div className="text-center md:text-left space-y-3 flex-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#2F6BFF]/15 text-[#5A8BFF] border border-[#2F6BFF]/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ยินดีต้อนรับสู่ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#F3F5FA] tracking-tight leading-tight">
              e-MaintenanceManagementSystem{' '}
              <span className="text-[#2F6BFF]">(e-MMS)</span>
            </h1>

            <p className="text-sm sm:text-base text-[#9BA3B8] leading-relaxed max-w-2xl">
              ช่องทางแจ้งซ่อมไฟฟ้า ประปา เครื่องปรับอากาศ โครงสร้างอาคาร และครุภัณฑ์ออนไลน์
              ออกแบบให้ใช้งานง่ายบนมือถือ ไม่ต้องล็อกอิน และคุ้มครองข้อมูลส่วนบุคคล (PDPA Zero PII)
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 pt-1 text-xs text-[#9BA3B8]">
              <span className="inline-flex items-center gap-1.5 bg-[#090A10]/80 border border-[#1E2235] px-3 py-1.5 rounded-xl">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                ไม่ต้องสมัครสมาชิก
              </span>
              <span className="inline-flex items-center gap-1.5 bg-[#090A10]/80 border border-[#1E2235] px-3 py-1.5 rounded-xl">
                <Camera className="w-4 h-4 text-[#5A8BFF]" />
                ถ่ายรูปส่งแจ้งซ่อมได้ทันที
              </span>
              <span className="inline-flex items-center gap-1.5 bg-[#090A10]/80 border border-[#1E2235] px-3 py-1.5 rounded-xl">
                <Bell className="w-4 h-4 text-[#FF984D]" />
                แจ้งเตือนทีมช่างแบบ Real-time
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          2. Primary Action Cards (2 Cards: แจ้งซ่อม & ติดตามสถานะ)
         ===================================================================== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Card 1: แจ้งซ่อมบำรุงออนไลน์ */}
        <Link
          to="/repair"
          className="group emms-card p-6 sm:p-7 border-2 border-[#2F6BFF]/60 hover:border-[#2F6BFF] bg-gradient-to-b from-[#121420] to-[#2F6BFF]/10 transition-all flex flex-col justify-between gap-6 shadow-xl hover:shadow-[#2F6BFF]/15"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-[#2F6BFF] text-white flex items-center justify-center shadow-lg shadow-[#2F6BFF]/30 group-hover:scale-105 transition-transform">
                <Wrench className="w-7 h-7" />
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#2F6BFF]/20 text-[#5A8BFF] border border-[#2F6BFF]/40">
                เมนูหลัก • แจ้งด่วน
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#F3F5FA] group-hover:text-[#5A8BFF] transition-colors">
                แจ้งซ่อมบำรุงออนไลน์
              </h2>
              <p className="text-xs sm:text-sm text-[#9BA3B8] leading-relaxed">
                พบอุปกรณ์ชำรุด ไฟดับ แอร์ไม่เย็น น้ำรั่ว หรือโครงสร้างเสียหาย
                กดที่นี่เพื่อเลือกสถานที่และถ่ายรูปแจ้งทีมช่างได้ทันที
              </p>
            </div>
          </div>

          <div className="pt-2">
            <div className="w-full emms-btn-primary py-3.5 text-sm sm:text-base justify-between px-5 group-hover:bg-[#2457DB]">
              <span>กดเพื่อไปหน้าแจ้งซ่อม</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>

        {/* Card 2: ติดตามสถานะงานซ่อม & กระดานสาธารณะ */}
        <div className="emms-card p-6 sm:p-7 border border-[#1E2235] hover:border-[#2F6BFF]/50 transition-all flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-[#171A29] border border-[#1E2235] text-[#5A8BFF] flex items-center justify-center">
                <Search className="w-7 h-7" />
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#171A29] text-[#9BA3B8] border border-[#1E2235]">
                ตรวจสอบความคืบหน้า
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#F3F5FA]">
                ติดตามสถานะงานซ่อม
              </h2>
              <p className="text-xs sm:text-sm text-[#9BA3B8] leading-relaxed">
                ค้นหาด้วยรหัสใบแจ้งซ่อม <code className="text-[#5A8BFF]">MMS-YYYYMM-NNN</code>{' '}
                เพื่อดูไทม์ไลน์และรูปหลังซ่อม หรือเปิดดูกระดานงานซ่อมทั้งหมด
              </p>
            </div>

            {/* Quick Search Input Inside Card 2 */}
            <form onSubmit={handleQuickTrackSubmit} className="flex gap-2 pt-1">
              <input
                type="text"
                value={quickTrackCode}
                onChange={(e) => setQuickTrackCode(e.target.value.toUpperCase())}
                placeholder="กรอกรหัส เช่น MMS-202611-001"
                className="emms-input text-xs sm:text-sm font-mono py-2.5 uppercase flex-1"
              />
              <button
                type="submit"
                className="emms-btn-secondary px-4 py-2.5 text-xs sm:text-sm shrink-0 border-[#2F6BFF]/40 text-[#5A8BFF] hover:bg-[#2F6BFF] hover:text-white"
              >
                <Search className="w-4 h-4" />
                <span>ค้นหา</span>
              </button>
            </form>
          </div>

          <div>
            <Link
              to="/track"
              className="w-full emms-btn-secondary py-3.5 text-sm sm:text-base justify-between px-5 hover:border-[#2F6BFF]"
            >
              <span>เปิดหน้าติดตามสถานะ & กระดานงานซ่อม</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. News & Announcements Section (ข่าวสารและประกาศแจ้งผู้ใช้งาน)
         ===================================================================== */}
      <section className="emms-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[#1E2235] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FF7A1A]/15 border border-[#FF7A1A]/40 text-[#FF7A1A] flex items-center justify-center">
              <Megaphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#F3F5FA]">
                ข่าวสารและประกาศจากฝ่ายซ่อมบำรุง
              </h2>
            </div>
          </div>
          <span className="text-xs text-[#9BA3B8] hidden sm:inline">
            ข้อมูลประชาสัมพันธ์
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {SYSTEM_ANNOUNCEMENTS.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl p-4 border space-y-2 ${
                item.isHighlight
                  ? 'bg-[#090A10] border-[#2F6BFF]/40'
                  : 'bg-[#090A10]/60 border-[#1E2235]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    item.isHighlight
                      ? 'bg-[#2F6BFF]/20 text-[#5A8BFF] border border-[#2F6BFF]/30'
                      : 'bg-[#171A29] text-[#9BA3B8] border border-[#1E2235]'
                  }`}
                >
                  {item.badge}
                </span>
                <span className="text-[11px] text-[#9BA3B8] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {item.dateLabel}
                </span>
              </div>
              <h3 className="text-sm font-bold text-[#F3F5FA]">{item.title}</h3>
              <p className="text-xs text-[#9BA3B8] leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* =====================================================================
          4. Saved Tickets on This Device (ถ้าผู้ใช้นี้เคยแจ้งซ่อมไว้บนมือถือเครื่องนี้)
         ===================================================================== */}
      {savedTickets.length > 0 && (
        <section className="emms-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-[#2F6BFF]" />
              <h2 className="text-base font-bold text-[#F3F5FA]">
                ใบแจ้งซ่อมล่าสุดของคุณบนอุปกรณ์นี้ ({savedTickets.length})
              </h2>
            </div>
            <Link
              to="/track"
              className="text-xs font-semibold text-[#5A8BFF] hover:underline"
            >
              ดูทั้งหมด →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {savedTickets.slice(0, 4).map((item) => (
              <div
                key={item.ticket_code}
                className="bg-[#090A10] border border-[#1E2235] hover:border-[#2F6BFF]/50 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors"
              >
                <Link
                  to={`/track/${item.ticket_code}`}
                  className="flex-1 min-w-0 space-y-1"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm text-[#5A8BFF]">
                      {item.ticket_code}
                    </span>
                    <StatusBadge status={item.status} short />
                  </div>
                  <p className="text-xs text-[#F3F5FA] truncate">
                    {item.location_summary}
                  </p>
                  <p className="text-[11px] text-[#9BA3B8]">
                    {item.category_name} • {formatThaiDateTime(item.created_at)}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemoveSaved(item.ticket_code)}
                  className="p-2 text-[#9BA3B8] hover:text-rose-400 rounded-lg hover:bg-[#171A29]"
                  title="ลบออกจากรายการที่จำไว้ในเครื่องนี้"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick 3-Step Guide Footer Card */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="emms-card p-4 flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-[#2F6BFF]/15 text-[#5A8BFF] font-bold flex items-center justify-center shrink-0">
            1
          </div>
          <div>
            <p className="font-bold text-[#F3F5FA]">เลือกสถานที่และหมวดหมู่</p>
            <p className="text-[#9BA3B8] mt-0.5">
              ระบุอาคาร ชั้น ห้อง และหมวดหมู่งานซ่อมจากรายการตัวเลือก
            </p>
          </div>
        </div>
        <div className="emms-card p-4 flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-[#2F6BFF]/15 text-[#5A8BFF] font-bold flex items-center justify-center shrink-0">
            2
          </div>
          <div>
            <p className="font-bold text-[#F3F5FA]">ถ่ายรูปจุดที่ชำรุด 1–3 รูป</p>
            <p className="text-[#9BA3B8] mt-0.5">
              ระบบย่อขนาดรูปเป็น WebP และล้างพิกัด GPS อัตโนมัติ
            </p>
          </div>
        </div>
        <div className="emms-card p-4 flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 font-bold flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-[#F3F5FA]">รับรหัสติดตามสถานะทันที</p>
            <p className="text-[#9BA3B8] mt-0.5">
              แจ้งเตือนถึงทีมช่างผ่าน Telegram และตรวจสอบผลซ่อมได้ตลอดเวลา
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
