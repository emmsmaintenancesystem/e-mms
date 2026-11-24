import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  History,
  Info,
  Loader2,
  MapPin,
  Send,
  ShieldCheck,
  Tag,
  Trash2,
  UserCheck,
} from 'lucide-react';
import {
  checkDuplicateTicket,
  createPublicTicket,
  fetchPublicMasterData,
} from '../lib/apiClient';
import {
  CompressedPhotoItem,
  revokePhotoPreviews,
} from '../lib/imageCompressor';
import {
  SavedLocalTicket,
  getSavedLocalTickets,
  removeLocalTicket,
  saveLocalTicket,
} from '../lib/ticketHistory';
import { PhotoUploader } from '../components/PhotoUploader';
import { StatusBadge } from '../components/StatusBadge';
import {
  DuplicateTicketSummary,
  PublicMasterDataResponse,
  Ticket,
  formatThaiDateTime,
} from '../types/api';

export const PublicRepairPage: React.FC = () => {
  const navigate = useNavigate();

  // Master Data State
  const [masterData, setMasterData] = useState<PublicMasterDataResponse | null>(null);
  const [isLoadingMaster, setIsLoadingMaster] = useState<boolean>(true);
  const [masterError, setMasterError] = useState<string | null>(null);

  // Form State (Zero PII)
  const [buildingId, setBuildingId] = useState<number>(0);
  const [floorId, setFloorId] = useState<number>(0);
  const [roomId, setRoomId] = useState<number>(0);
  const [locationDetail, setLocationDetail] = useState<string>('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [reporterTypeId, setReporterTypeId] = useState<number>(0);
  const [description, setDescription] = useState<string>('');
  const [photos, setPhotos] = useState<CompressedPhotoItem[]>([]);
  const [honeypotWebsite, setHoneypotWebsite] = useState<string>(''); // Hidden anti-bot honeypot

  // Real-Time Duplicate Check State (ADR-005)
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState<boolean>(false);
  const [duplicates, setDuplicates] = useState<DuplicateTicketSummary[]>([]);
  const [confirmDuplicateProceed, setConfirmDuplicateProceed] = useState<boolean>(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);

  // Local Saved Tickets on this device
  const [savedTickets, setSavedTickets] = useState<SavedLocalTicket[]>(() =>
    getSavedLocalTickets()
  );

  const loadMaster = () => {
    setIsLoadingMaster(true);
    setMasterError(null);
    fetchPublicMasterData()
      .then((data) => {
        setMasterData(data);
        if (data.reporter_types && data.reporter_types.length > 0 && reporterTypeId === 0) {
          setReporterTypeId(data.reporter_types[0].id);
        }
      })
      .catch((err) => {
        setMasterError(
          err instanceof Error
            ? err.message
            : 'ไม่สามารถโหลดข้อมูลสถานที่และหมวดหมู่งานซ่อมได้'
        );
      })
      .finally(() => {
        setIsLoadingMaster(false);
      });
  };

  useEffect(() => {
    loadMaster();
    return () => {
      revokePhotoPreviews(photos);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cascading location lists
  const availableFloors = useMemo(() => {
    if (!masterData || buildingId <= 0) return [];
    return masterData.floors.filter((f) => f.building_id === buildingId);
  }, [masterData, buildingId]);

  const availableRooms = useMemo(() => {
    if (!masterData || floorId <= 0) return [];
    return masterData.rooms.filter((r) => r.floor_id === floorId);
  }, [masterData, floorId]);

  const selectedCategory = useMemo(() => {
    if (!masterData || categoryId <= 0) return null;
    return masterData.categories.find((c) => c.id === categoryId) || null;
  }, [masterData, categoryId]);

  const handleBuildingChange = (newBuildingId: number) => {
    setBuildingId(newBuildingId);
    setFloorId(0);
    setRoomId(0);
    setDuplicates([]);
    setConfirmDuplicateProceed(false);
  };

  const handleFloorChange = (newFloorId: number) => {
    setFloorId(newFloorId);
    setRoomId(0);
    setDuplicates([]);
    setConfirmDuplicateProceed(false);
  };

  // Real-time Duplicate Check whenever roomId AND categoryId are selected (ADR-005)
  useEffect(() => {
    if (roomId <= 0 || categoryId <= 0) {
      setDuplicates([]);
      setConfirmDuplicateProceed(false);
      return;
    }

    let active = true;
    setIsCheckingDuplicate(true);

    checkDuplicateTicket(roomId, categoryId)
      .then((res) => {
        if (!active) return;
        setDuplicates(res.open_tickets || []);
        setConfirmDuplicateProceed(false);
      })
      .catch(() => {
        if (!active) return;
        setDuplicates([]);
      })
      .finally(() => {
        if (active) setIsCheckingDuplicate(false);
      });

    return () => {
      active = false;
    };
  }, [roomId, categoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (buildingId <= 0 || floorId <= 0 || roomId <= 0) {
      setSubmitError('กรุณาเลือกสถานที่ (อาคาร → ชั้น → ห้อง/บริเวณ) ให้ครบทั้ง 3 ระดับ');
      return;
    }
    if (categoryId <= 0) {
      setSubmitError('กรุณาเลือกหมวดหมู่งานซ่อม');
      return;
    }
    if (reporterTypeId <= 0) {
      setSubmitError('กรุณาเลือกประเภทผู้แจ้งซ่อม');
      return;
    }
    if (!description.trim()) {
      setSubmitError('กรุณาระบุอาการหรือรายละเอียดความเสียหาย');
      return;
    }
    if (photos.length < 1 || photos.length > 3) {
      setSubmitError('กรุณาแนบรูปภาพจุดที่ชำรุดอย่างน้อย 1 รูป (ไม่เกิน 3 รูป)');
      return;
    }
    if (duplicates.length > 0 && !confirmDuplicateProceed) {
      setSubmitError(
        'พบรายการแจ้งซ่อมที่ยังเปิดค้างอยู่ในห้องและหมวดหมู่เดียวกัน กรุณาติ๊กยืนยันด้านล่างแถบสีส้มหากต้องการแจ้งเป็นรายการใหม่'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const ticket = await createPublicTicket({
        building_id: buildingId,
        floor_id: floorId,
        room_id: roomId,
        location_detail: locationDetail.trim() || undefined,
        category_id: categoryId,
        reporter_type_id: reporterTypeId,
        description: description.trim(),
        website_honeypot: honeypotWebsite,
        photos: photos.map((p) => p.file),
      });

      const updatedLocal = saveLocalTicket({
        ticket_code: ticket.ticket_code,
        location_summary: `${ticket.building_name} • ${ticket.floor_name} • ${ticket.room_name}`,
        category_name: ticket.category_name,
        status: ticket.status,
        created_at: ticket.created_at,
      });
      setSavedTickets(updatedLocal);
      setCreatedTicket(ticket);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'ไม่สามารถส่งใบแจ้งซ่อมได้ กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForNewTicket = () => {
    revokePhotoPreviews(photos);
    setPhotos([]);
    setRoomId(0);
    setLocationDetail('');
    setCategoryId(0);
    setDescription('');
    setDuplicates([]);
    setConfirmDuplicateProceed(false);
    setCreatedTicket(null);
    setSubmitError(null);
  };

  const handleCopyText = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      // Fallback
    }
  };

  const handleRemoveSaved = (code: string) => {
    setSavedTickets(removeLocalTicket(code));
  };

  // ===========================================================================
  // Render Success View after ticket creation
  // ===========================================================================
  if (createdTicket) {
    const trackUrl = `${window.location.origin}${window.location.pathname}#/track/${createdTicket.ticket_code}`;
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <div className="emms-card p-5 sm:p-8 space-y-6 border-[#2F6BFF]/40">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
              บันทึกและส่งแจ้งเตือนทีมช่างเรียบร้อยแล้ว
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#F3F5FA]">
              แจ้งซ่อมสำเร็จ!
            </h1>
            <p className="text-xs sm:text-sm text-[#9BA3B8] max-w-md">
              ระบบได้ส่งข้อมูลและรูปภาพความเสียหายเข้ากลุ่ม Telegram ของทีมช่างทันที
              พร้อมบันทึกรหัสใบงานไว้ในอุปกรณ์นี้แล้ว
            </p>
          </div>

          {/* Ticket Code Display Card */}
          <div className="bg-[#090A10] border border-[#2F6BFF]/40 rounded-2xl p-4 sm:p-5 text-center space-y-3">
            <p className="text-xs font-medium text-[#9BA3B8]">
              รหัสใบแจ้งซ่อมของคุณ (ใช้สำหรับติดตามสถานะ)
            </p>
            <div className="text-2xl sm:text-4xl font-black tracking-wider text-[#2F6BFF] font-mono break-all">
              {createdTicket.ticket_code}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCopyText(createdTicket.ticket_code, 'code')}
                className="emms-btn-primary text-xs py-2.5"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedType === 'code' ? 'คัดลอกรหัสแล้ว!' : 'คัดลอกรหัสใบงาน'}
              </button>
              <button
                type="button"
                onClick={() => handleCopyText(trackUrl, 'link')}
                className="emms-btn-secondary text-xs py-2.5"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedType === 'link' ? 'คัดลอกลิงก์แล้ว!' : 'คัดลอกลิงก์ติดตามงาน'}
              </button>
            </div>
          </div>

          {/* Summary Details */}
          <div className="bg-[#090A10]/60 border border-[#1E2235] rounded-xl p-4 space-y-2.5 text-xs sm:text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#9BA3B8]">สถานะปัจจุบัน:</span>
              <StatusBadge status={createdTicket.status} />
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[#9BA3B8] shrink-0">สถานที่:</span>
              <span className="text-[#F3F5FA] font-medium text-right">
                {createdTicket.building_name} → {createdTicket.floor_name} →{' '}
                {createdTicket.room_name}
                {createdTicket.location_detail
                  ? ` (${createdTicket.location_detail})`
                  : ''}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#9BA3B8]">หมวดหมู่งานซ่อม:</span>
              <span className="text-[#F3F5FA] font-semibold text-right">
                {createdTicket.category_name}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#9BA3B8]">ประเภทผู้แจ้ง:</span>
              <span className="text-[#F3F5FA]">{createdTicket.reporter_type_name}</span>
            </div>
            <div className="pt-2 border-t border-[#1E2235]">
              <span className="text-xs text-[#9BA3B8] block mb-1">อาการที่แจ้ง:</span>
              <p className="text-[#F3F5FA] bg-[#121420] p-3 rounded-lg border border-[#1E2235]">
                {createdTicket.description}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(`/track/${createdTicket.ticket_code}`)}
              className="emms-btn-primary w-full sm:flex-1 py-3"
            >
              <ExternalLink className="w-4 h-4" />
              ดูหน้าติดตามสถานะใบงานนี้
            </button>
            <button
              type="button"
              onClick={handleResetForNewTicket}
              className="emms-btn-secondary w-full sm:w-auto py-3"
            >
              แจ้งซ่อมรายการอื่นเพิ่ม
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // Main Guest Repair Form View
  // ===========================================================================
  return (
    <div className="max-w-3xl mx-auto px-3.5 sm:px-4 py-5 sm:py-8 space-y-6">
      {/* Top Bar Back to Landing Page */}
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#9BA3B8] hover:text-[#F3F5FA] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[#2F6BFF]" />
          <span>กลับหน้าแรก</span>
        </Link>

        <Link
          to="/track"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#5A8BFF] hover:underline"
        >
          <Clock className="w-4 h-4" />
          <span>ติดตามสถานะงานซ่อม</span>
        </Link>
      </div>

      {/* Form Header Banner */}
      <div className="emms-card p-4 sm:p-6 bg-gradient-to-br from-[#121420] via-[#121420] to-[#2F6BFF]/10 border-[#1E2235]">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-[#2F6BFF]/15 text-[#5A8BFF] border border-[#2F6BFF]/30">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>ไม่ต้องล็อกอิน • ไม่เก็บข้อมูลส่วนบุคคล (PDPA Zero PII)</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-extrabold text-[#F3F5FA]">
            แบบฟอร์มแจ้งซ่อมบำรุงออนไลน์ (e-MMS)
          </h1>
          <p className="text-xs sm:text-sm text-[#9BA3B8]">
            กรอกข้อมูล 3 ขั้นตอนสั้นๆ พร้อมถ่ายรูปจุดที่ชำรุด 1–3 รูป ระบบจะส่งแจ้งเตือนทีมช่างทันที
          </p>
        </div>
      </div>

      {/* Loading or Error state for Master Data */}
      {isLoadingMaster ? (
        <div className="emms-card p-10 sm:p-12 flex flex-col items-center justify-center gap-3 text-[#9BA3B8]">
          <Loader2 className="w-8 h-8 text-[#2F6BFF] animate-spin" />
          <p className="text-sm font-medium text-center">
            กำลังโหลดข้อมูลอาคาร ห้อง และหมวดหมู่งานซ่อม...
          </p>
        </div>
      ) : masterError ? (
        <div className="emms-card p-6 border-[#FF7A1A]/40 space-y-4 text-center">
          <AlertTriangle className="w-10 h-10 text-[#FF7A1A] mx-auto" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-[#F3F5FA]">
              ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ข้อมูลหลักได้
            </h2>
            <p className="text-xs text-[#9BA3B8]">{masterError}</p>
          </div>
          <button
            type="button"
            onClick={loadMaster}
            className="emms-btn-primary text-xs mx-auto"
          >
            ลองโหลดข้อมูลอีกครั้ง
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="emms-card p-4 sm:p-7 space-y-6">
          {/* Hidden Honeypot Anti-Spam Field (ADR-010) */}
          <div
            aria-hidden="true"
            className="fixed -left-[9999px] top-auto w-px h-px overflow-hidden opacity-0 pointer-events-none"
          >
            <label htmlFor="emms_hp_website">Website</label>
            <input
              id="emms_hp_website"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypotWebsite}
              onChange={(e) => setHoneypotWebsite(e.target.value)}
            />
          </div>

          {/* Step 1: Location (3-Level Cascading Dropdown) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[#1E2235] pb-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#2F6BFF]/15 text-[#5A8BFF] flex items-center justify-center font-bold text-sm shrink-0">
                1
              </div>
              <h2 className="text-sm sm:text-base font-bold text-[#F3F5FA] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#2F6BFF] shrink-0" />
                <span>สถานที่พบจุดชำรุด (อาคาร → ชั้น → ห้อง/บริเวณ)</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Building */}
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
                  1.1 อาคาร <span className="text-[#FF7A1A]">*</span>
                </label>
                <select
                  value={buildingId}
                  onChange={(e) => handleBuildingChange(Number(e.target.value))}
                  className="emms-select text-sm py-3 sm:py-2.5"
                  required
                >
                  <option value={0}>-- เลือกอาคาร --</option>
                  {masterData?.buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code ? `[${b.code}] ` : ''}
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Floor */}
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
                  1.2 ชั้น <span className="text-[#FF7A1A]">*</span>
                </label>
                <select
                  value={floorId}
                  onChange={(e) => handleFloorChange(Number(e.target.value))}
                  disabled={buildingId <= 0}
                  className="emms-select text-sm py-3 sm:py-2.5 disabled:opacity-50"
                  required
                >
                  <option value={0}>
                    {buildingId <= 0 ? '-- เลือกอาคารก่อน --' : '-- เลือกชั้น --'}
                  </option>
                  {availableFloors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Room */}
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
                  1.3 ห้อง / บริเวณ <span className="text-[#FF7A1A]">*</span>
                </label>
                <select
                  value={roomId}
                  onChange={(e) => setRoomId(Number(e.target.value))}
                  disabled={floorId <= 0}
                  className="emms-select text-sm py-3 sm:py-2.5 disabled:opacity-50"
                  required
                >
                  <option value={0}>
                    {floorId <= 0 ? '-- เลือกชั้นก่อน --' : '-- เลือกห้อง / บริเวณ --'}
                  </option>
                  {availableRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code ? `${r.code} - ` : ''}
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional Location Detail */}
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
                จุดย่อยเพิ่มเติม (ไม่บังคับ — ช่วยให้ช่างหาจุดเสียได้เร็วขึ้น)
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-[#9BA3B8] absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={locationDetail}
                  onChange={(e) => setLocationDetail(e.target.value)}
                  placeholder="เช่น หน้าลิฟต์ฝั่งซ้าย, โคมไฟแถวที่ 2, อ่างล้างมือช่องริมสุด"
                  maxLength={200}
                  className="emms-input pl-10 text-sm py-3 sm:py-2.5"
                />
              </div>
            </div>
          </div>

          {/* Step 2: Category (Dropdown) & Reporter Type (Dropdown) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[#1E2235] pb-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#2F6BFF]/15 text-[#5A8BFF] flex items-center justify-center font-bold text-sm shrink-0">
                2
              </div>
              <h2 className="text-sm sm:text-base font-bold text-[#F3F5FA] flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#2F6BFF] shrink-0" />
                <span>หมวดหมู่งานซ่อม และประเภทผู้แจ้ง</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 2.1 Category Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
                  2.1 เลือกหมวดหมู่งานซ่อม <span className="text-[#FF7A1A]">*</span>
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-[#9BA3B8] absolute left-3.5 top-3.5 pointer-events-none" />
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(Number(e.target.value))}
                    className="emms-select pl-10 text-sm py-3 sm:py-2.5"
                    required
                  >
                    <option value={0}>-- เลือกหมวดหมู่งานซ่อม --</option>
                    {masterData?.categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedCategory?.description && (
                  <p className="mt-1.5 text-[11px] text-[#5A8BFF] flex items-start gap-1">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>ตัวอย่างอาการ: {selectedCategory.description}</span>
                  </p>
                )}
              </div>

              {/* 2.2 Reporter Type Dropdown (Zero PII) */}
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
                  2.2 ประเภทผู้แจ้งซ่อม <span className="text-[#FF7A1A]">*</span>
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 text-[#9BA3B8] absolute left-3.5 top-3.5 pointer-events-none" />
                  <select
                    value={reporterTypeId}
                    onChange={(e) => setReporterTypeId(Number(e.target.value))}
                    className="emms-select pl-10 text-sm py-3 sm:py-2.5"
                    required
                  >
                    <option value={0}>-- เลือกประเภทผู้แจ้ง --</option>
                    {masterData?.reporter_types.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-[11px] text-[#9BA3B8]">
                  🔒 ไม่เก็บชื่อ เบอร์โทร หรืออีเมลผู้แจ้ง (PDPA Zero PII)
                </p>
              </div>
            </div>

            {/* Real-Time Duplicate Warning Banner (Sunset Orange #FF7A1A — ADR-005) */}
            {isCheckingDuplicate && (
              <div className="flex items-center gap-2 text-xs text-[#9BA3B8] bg-[#090A10] border border-[#1E2235] rounded-xl px-3.5 py-2.5">
                <Loader2 className="w-4 h-4 text-[#2F6BFF] animate-spin shrink-0" />
                <span>กำลังตรวจสอบรายการแจ้งซ่อมที่เปิดค้างในห้องและหมวดหมู่นี้...</span>
              </div>
            )}

            {!isCheckingDuplicate && duplicates.length > 0 && (
              <div className="bg-[#FF7A1A]/10 border-2 border-[#FF7A1A] rounded-2xl p-3.5 sm:p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FF7A1A] text-[#090A10] flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <h3 className="text-xs sm:text-sm font-extrabold text-[#FF984D]">
                      แจ้งเตือนงานซ้ำ: พบใบแจ้งซ่อมในห้องและหมวดหมู่นี้ที่กำลังดำเนินการอยู่ (
                      {duplicates.length} รายการ)
                    </h3>
                    <p className="text-xs text-[#F3F5FA]/90">
                      กรุณาตรวจสอบว่าอาการที่คุณต้องการแจ้งตรงกับรายการด้านล่างหรือไม่
                      หากเป็นเรื่องเดียวกันไม่จำเป็นต้องแจ้งซ้ำ
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {duplicates.map((dup) => (
                    <div
                      key={dup.ticket_code}
                      className="bg-[#090A10]/90 border border-[#FF7A1A]/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-[#FF984D]">
                            {dup.ticket_code}
                          </span>
                          <StatusBadge status={dup.status} short />
                          <span className="text-[#9BA3B8]">
                            {formatThaiDateTime(dup.created_at)}
                          </span>
                        </div>
                        <p className="text-[#F3F5FA]">
                          {dup.location_detail ? `[${dup.location_detail}] ` : ''}
                          {dup.description}
                        </p>
                      </div>
                      <Link
                        to={`/track/${dup.ticket_code}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#5A8BFF] hover:underline shrink-0"
                      >
                        <span>ดูสถานะใบงานนี้</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmDuplicateProceed}
                    onChange={(e) => setConfirmDuplicateProceed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[#FF7A1A] text-[#FF7A1A] focus:ring-[#FF7A1A]"
                  />
                  <span className="text-xs font-semibold text-[#F3F5FA]">
                    ยืนยันแจ้งซ่อมรายการใหม่ต่อ (เป็นคนละจุด หรือคนละอุปกรณ์กับรายการที่ค้างอยู่ข้างต้น)
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Step 3: Symptom Description & Photos (1-3 WebP) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[#1E2235] pb-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#2F6BFF]/15 text-[#5A8BFF] flex items-center justify-center font-bold text-sm shrink-0">
                3
              </div>
              <h2 className="text-sm sm:text-base font-bold text-[#F3F5FA] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#2F6BFF] shrink-0" />
                <span>รายละเอียดอาการเสีย และรูปภาพประกอบ (1–3 รูป)</span>
              </h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
                3.1 อาการหรือลักษณะความเสียหาย <span className="text-[#FF7A1A]">*</span>
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="อธิบายอาการที่พบ เช่น แอร์ไม่เย็นมีน้ำหยดลงพื้น, หลอดไฟกะพริบ 2 ดวง, ท่อน้ำใต้อ่างล้างมือรั่ว"
                maxLength={1000}
                className="emms-input text-sm"
                required
              />
            </div>

            <PhotoUploader
              photos={photos}
              onChange={setPhotos}
              minPhotos={1}
              maxPhotos={3}
              label="3.2 รูปภาพจุดที่ชำรุด (บังคับ 1–3 รูป)"
              required
            />
          </div>

          {submitError && (
            <div className="bg-[#FF7A1A]/15 border border-[#FF7A1A] text-[#FF984D] rounded-xl p-3.5 text-xs sm:text-sm font-medium flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#FF7A1A] shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="emms-btn-primary w-full py-3.5 text-base shadow-lg shadow-[#2F6BFF]/25"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>กำลังอัปโหลดรูปภาพและสร้างใบแจ้งซ่อม...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>ส่งใบแจ้งซ่อมทันที</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Local Saved Tickets on This Device (localStorage — ADR-005) */}
      {savedTickets.length > 0 && (
        <div className="emms-card p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-[#2F6BFF]" />
              <h2 className="text-sm sm:text-base font-bold text-[#F3F5FA]">
                รายการแจ้งซ่อมที่บันทึกไว้ในอุปกรณ์นี้ ({savedTickets.length})
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
                    หมวด: {item.category_name} • {formatThaiDateTime(item.created_at)}
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
        </div>
      )}
    </div>
  );
};
