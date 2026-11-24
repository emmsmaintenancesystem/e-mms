import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  EyeOff,
  History,
  Image as ImageIcon,
  LayoutList,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import {
  fetchPublicBoard,
  fetchPublicMasterData,
  trackPublicTicketByCode,
} from '../lib/apiClient';
import {
  SavedLocalTicket,
  getSavedLocalTickets,
  saveLocalTicket,
} from '../lib/ticketHistory';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { StatusBadge } from '../components/StatusBadge';
import {
  ALL_TICKET_STATUSES,
  Building,
  PublicBoardItem,
  STATUS_META,
  Ticket,
  TicketPhoto,
  formatThaiDateTime,
} from '../types/api';

export const PublicTrackPage: React.FC = () => {
  const { code: routeCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();

  // Search by code state
  const [searchInput, setSearchInput] = useState<string>(routeCode || '');
  const [trackedTicket, setTrackedTicket] = useState<Ticket | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<TicketPhoto | null>(null);

  // Local saved tickets
  const [savedTickets, setSavedTickets] = useState<SavedLocalTicket[]>(() =>
    getSavedLocalTickets()
  );

  // Public Board state (strictly without photos per ADR-005 & Golden Rule 4.3)
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [boardItems, setBoardItems] = useState<PublicBoardItem[]>([]);
  const [boardTotal, setBoardTotal] = useState<number>(0);
  const [boardBuildingId, setBoardBuildingId] = useState<number>(0);
  const [boardStatus, setBoardStatus] = useState<string>('');
  const [isLoadingBoard, setIsLoadingBoard] = useState<boolean>(true);

  useEffect(() => {
    fetchPublicMasterData()
      .then((res) => setBuildings(res.buildings || []))
      .catch(() => {});
  }, []);

  const loadTicketByCode = async (targetCode: string) => {
    const clean = targetCode.trim().toUpperCase();
    if (!clean) {
      setTrackedTicket(null);
      setTrackError(null);
      return;
    }

    setIsTracking(true);
    setTrackError(null);
    try {
      const ticket = await trackPublicTicketByCode(clean);
      setTrackedTicket(ticket);
      const updated = saveLocalTicket({
        ticket_code: ticket.ticket_code,
        location_summary: `${ticket.building_name} • ${ticket.floor_name} • ${ticket.room_name}`,
        category_name: ticket.category_name,
        status: ticket.status,
        created_at: ticket.created_at,
      });
      setSavedTickets(updated);
    } catch (err) {
      setTrackedTicket(null);
      setTrackError(
        err instanceof Error ? err.message : `ไม่พบข้อมูลใบแจ้งซ่อมรหัส ${clean}`
      );
    } finally {
      setIsTracking(false);
    }
  };

  useEffect(() => {
    if (routeCode) {
      const clean = routeCode.trim().toUpperCase();
      setSearchInput(clean);
      loadTicketByCode(clean);
    } else {
      setTrackedTicket(null);
      setTrackError(null);
    }
  }, [routeCode]);

  const loadBoard = () => {
    setIsLoadingBoard(true);
    fetchPublicBoard({
      limit: 40,
      building_id: boardBuildingId > 0 ? boardBuildingId : undefined,
      status: boardStatus || undefined,
    })
      .then((res) => {
        setBoardItems(res.items || []);
        setBoardTotal(res.total || 0);
      })
      .catch(() => {
        setBoardItems([]);
      })
      .finally(() => {
        setIsLoadingBoard(false);
      });
  };

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardBuildingId, boardStatus]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchInput.trim().toUpperCase();
    if (!clean) return;
    if (routeCode?.toUpperCase() === clean) {
      loadTicketByCode(clean);
    } else {
      navigate(`/track/${encodeURIComponent(clean)}`);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(label);
      setTimeout(() => setCopiedMsg(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-3.5 sm:px-4 py-5 sm:py-8 space-y-6 sm:space-y-8">
      <PhotoLightbox
        photo={lightboxPhoto}
        onClose={() => setLightboxPhoto(null)}
      />

      {/* Top Back Link */}
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#9BA3B8] hover:text-[#F3F5FA] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[#2F6BFF]" />
          <span>กลับหน้าแรก</span>
        </Link>

        <Link
          to="/repair"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#5A8BFF] hover:underline"
        >
          <Wrench className="w-4 h-4" />
          <span>ไปหน้าแจ้งซ่อม</span>
        </Link>
      </div>

      {/* Search by Ticket Code Card */}
      <div className="emms-card p-4 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-extrabold text-[#F3F5FA] flex items-center gap-2">
              <Search className="w-5 h-5 sm:w-6 sm:h-6 text-[#2F6BFF] shrink-0" />
              <span>ติดตามสถานะใบแจ้งซ่อม</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#9BA3B8] mt-0.5">
              กรอกรหัสใบแจ้งซ่อม <code className="text-[#5A8BFF]">MMS-YYYYMM-NNN</code>{' '}
              เพื่อดูไทม์ไลน์การดำเนินงานและรูปภาพก่อน–หลังซ่อม
            </p>
          </div>
          <Link to="/repair" className="emms-btn-primary text-xs sm:text-sm self-start shrink-0">
            <Wrench className="w-4 h-4" />
            <span>แจ้งซ่อมรายการใหม่</span>
          </Link>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#9BA3B8] absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="กรอกรหัสใบแจ้งซ่อม เช่น MMS-202611-001"
              className="emms-input pl-10 font-mono text-sm uppercase py-3 sm:py-2.5"
            />
          </div>
          <button
            type="submit"
            disabled={isTracking || !searchInput.trim()}
            className="emms-btn-primary px-6 py-3 sm:py-2.5 text-sm shrink-0"
          >
            {isTracking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังค้นหา...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>ค้นหาใบงาน</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Chips from LocalStorage */}
        {savedTickets.length > 0 && (
          <div className="pt-2 border-t border-[#1E2235] space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-[#9BA3B8]">
              <History className="w-3.5 h-3.5 text-[#2F6BFF] shrink-0" />
              <span>รหัสใบแจ้งซ่อมที่คุณเคยเปิดดูหรือแจ้งจากอุปกรณ์นี้:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {savedTickets.slice(0, 8).map((item) => {
                const isSelected =
                  trackedTicket?.ticket_code === item.ticket_code;
                return (
                  <button
                    key={item.ticket_code}
                    type="button"
                    onClick={() => navigate(`/track/${item.ticket_code}`)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-all ${
                      isSelected
                        ? 'bg-[#2F6BFF] text-white border-[#2F6BFF]'
                        : 'bg-[#090A10] text-[#F3F5FA] border-[#1E2235] hover:border-[#2F6BFF]'
                    }`}
                  >
                    <span>{item.ticket_code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tracked Ticket Result Section */}
      {isTracking && (
        <div className="emms-card p-10 flex flex-col items-center justify-center gap-3 text-[#9BA3B8]">
          <Loader2 className="w-8 h-8 text-[#2F6BFF] animate-spin" />
          <p className="text-sm">กำลังดึงข้อมูลใบแจ้งซ่อม...</p>
        </div>
      )}

      {!isTracking && trackError && (
        <div className="emms-card p-5 border-[#FF7A1A]/50 flex items-center gap-3 text-sm text-[#FF984D]">
          <AlertCircle className="w-6 h-6 text-[#FF7A1A] shrink-0" />
          <div>
            <p className="font-bold">ไม่พบข้อมูลใบแจ้งซ่อม</p>
            <p className="text-xs text-[#9BA3B8] mt-0.5">{trackError}</p>
          </div>
        </div>
      )}

      {!isTracking && trackedTicket && (
        <div className="emms-card p-4 sm:p-7 space-y-6 border-[#2F6BFF]/40">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E2235]">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xl sm:text-2xl font-black font-mono text-[#2F6BFF]">
                  {trackedTicket.ticket_code}
                </span>
                <StatusBadge status={trackedTicket.status} />
              </div>
              <p className="text-xs text-[#9BA3B8]">
                แจ้งเมื่อ {formatThaiDateTime(trackedTicket.created_at)} • อัปเดตล่าสุด{' '}
                {formatThaiDateTime(trackedTicket.updated_at)}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() =>
                  handleCopy(trackedTicket.ticket_code, 'คัดลอกรหัสใบงานแล้ว')
                }
                className="emms-btn-secondary text-xs px-3 py-2"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>คัดลอกรหัส</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    `${window.location.origin}${window.location.pathname}#/track/${trackedTicket.ticket_code}`,
                    'คัดลอกลิงก์ติดตามงานแล้ว'
                  )
                }
                className="emms-btn-secondary text-xs px-3 py-2"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>คัดลอกลิงก์</span>
              </button>
              {copiedMsg && (
                <span className="text-xs text-emerald-400 font-semibold">
                  {copiedMsg}
                </span>
              )}
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-4 space-y-3 text-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#5A8BFF]">
                ข้อมูลสถานที่และอาการที่แจ้ง
              </h3>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-[#2F6BFF] shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs text-[#9BA3B8] block">สถานที่:</span>
                    <span className="font-semibold text-[#F3F5FA]">
                      {trackedTicket.building_name} → {trackedTicket.floor_name} →{' '}
                      {trackedTicket.room_name}
                    </span>
                    {trackedTicket.location_detail && (
                      <span className="block text-xs text-[#9BA3B8] mt-0.5">
                        จุดย่อย: {trackedTicket.location_detail}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-[#2F6BFF] shrink-0" />
                  <span className="text-xs text-[#9BA3B8]">หมวดหมู่:</span>
                  <span className="font-semibold text-[#F3F5FA]">
                    {trackedTicket.category_name}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#2F6BFF] shrink-0" />
                  <span className="text-xs text-[#9BA3B8]">ประเภทผู้แจ้ง:</span>
                  <span className="text-[#F3F5FA]">
                    {trackedTicket.reporter_type_name}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#1E2235]">
                  <span className="text-xs text-[#9BA3B8] block mb-1">
                    อาการหรือรายละเอียดที่แจ้ง:
                  </span>
                  <p className="text-[#F3F5FA] bg-[#121420] p-3 rounded-lg border border-[#1E2235] whitespace-pre-wrap">
                    {trackedTicket.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Resolution & Technicians Info */}
            <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-4 space-y-3 text-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#5A8BFF]">
                ผลการดำเนินงานของทีมช่าง
              </h3>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#9BA3B8]">สถานะปัจจุบัน:</span>
                  <StatusBadge status={trackedTicket.status} />
                </div>

                {trackedTicket.acknowledged_at && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#9BA3B8]">รับทราบงานเมื่อ:</span>
                    <span className="text-[#F3F5FA]">
                      {formatThaiDateTime(trackedTicket.acknowledged_at)}
                    </span>
                  </div>
                )}

                {trackedTicket.completed_at && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#9BA3B8]">ปิดงานเมื่อ:</span>
                    <span className="text-emerald-400 font-semibold">
                      {formatThaiDateTime(trackedTicket.completed_at)}
                    </span>
                  </div>
                )}

                {trackedTicket.technicians && trackedTicket.technicians.length > 0 && (
                  <div className="pt-2 border-t border-[#1E2235]">
                    <span className="text-xs text-[#9BA3B8] flex items-center gap-1.5 mb-1.5">
                      <Users className="w-3.5 h-3.5 text-[#2F6BFF]" />
                      ช่างผู้ปฏิบัติงานหน้างาน:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {trackedTicket.technicians.map((tech) => (
                        <span
                          key={tech.technician_id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2F6BFF]/15 text-[#F3F5FA] border border-[#2F6BFF]/30 text-xs font-medium"
                        >
                          {tech.full_name}
                          {tech.nickname ? ` (${tech.nickname})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {trackedTicket.status_note && (
                  <div className="pt-2 border-t border-[#1E2235]">
                    <span className="text-xs text-[#9BA3B8] block mb-1">
                      บันทึกผลการซ่อม / หมายเหตุจากช่าง:
                    </span>
                    <p className="text-[#F3F5FA] bg-[#121420] p-3 rounded-lg border border-[#1E2235] whitespace-pre-wrap">
                      {trackedTicket.status_note}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Before & After Photos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Before Photos */}
            <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#FF984D] flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4" />
                  รูปภาพก่อนซ่อม ({trackedTicket.before_photos?.length || 0} รูป)
                </h4>
                <span className="text-[11px] text-[#9BA3B8]">กดที่รูปเพื่อขยาย</span>
              </div>
              {trackedTicket.before_photos && trackedTicket.before_photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {trackedTicket.before_photos.map((photo, idx) => (
                    <button
                      key={photo.id || idx}
                      type="button"
                      onClick={() => setLightboxPhoto(photo)}
                      className="aspect-video rounded-lg overflow-hidden border border-[#1E2235] hover:border-[#2F6BFF] bg-[#121420] group relative"
                    >
                      <img
                        src={photo.public_url}
                        alt={`ก่อนซ่อม ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#9BA3B8]">ไม่มีรูปภาพก่อนซ่อม</p>
              )}
            </div>

            {/* After Photos */}
            <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  รูปภาพหลังซ่อม ({trackedTicket.after_photos?.length || 0} รูป)
                </h4>
                <span className="text-[11px] text-[#9BA3B8]">กดที่รูปเพื่อขยาย</span>
              </div>
              {trackedTicket.after_photos && trackedTicket.after_photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {trackedTicket.after_photos.map((photo, idx) => (
                    <button
                      key={photo.id || idx}
                      type="button"
                      onClick={() => setLightboxPhoto(photo)}
                      className="aspect-video rounded-lg overflow-hidden border border-[#1E2235] hover:border-emerald-400 bg-[#121420] group relative"
                    >
                      <img
                        src={photo.public_url}
                        alt={`หลังซ่อม ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#9BA3B8]">
                  ยังไม่มีรูปภาพหลังซ่อม (แสดงเมื่อช่างดำเนินการปิดงานซ่อมเสร็จสิ้นแล้ว)
                </p>
              )}
            </div>
          </div>

          {/* Status Timeline Logs */}
          {trackedTicket.status_logs && trackedTicket.status_logs.length > 0 && (
            <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#5A8BFF] flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                ไทม์ไลน์ประวัติการดำเนินงาน
              </h4>
              <div className="space-y-2.5">
                {trackedTicket.status_logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#121420] border border-[#1E2235] rounded-xl p-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <StatusBadge status={log.to_status} short />
                      {log.note && (
                        <span className="text-[#F3F5FA] font-medium">
                          {log.note}
                        </span>
                      )}
                    </div>
                    <div className="text-[#9BA3B8] shrink-0">
                      {formatThaiDateTime(log.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          Public Board แบบย่อ (Compact Public Board — Strictly No Photos!)
          ADR-005 & Golden Rule 4.3
         ===================================================================== */}
      <div className="emms-card p-4 sm:p-7 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1E2235] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <LayoutList className="w-5 h-5 text-[#2F6BFF] shrink-0" />
              <h2 className="text-base sm:text-lg font-extrabold text-[#F3F5FA]">
                กระดานสถานะงานซ่อมสาธารณะ (Public Board)
              </h2>
            </div>
            <p className="text-xs text-[#9BA3B8] flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5 text-[#5A8BFF] shrink-0" />
              <span>
                แสดงเฉพาะรหัสงาน สถานที่ หมวดหมู่ และสถานะล่าสุด (ไม่แสดงรูปภาพบนกระดานสาธารณะ)
              </span>
            </p>
          </div>

          {/* Board Filters */}
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <select
              value={boardBuildingId}
              onChange={(e) => setBoardBuildingId(Number(e.target.value))}
              className="emms-select text-xs py-2.5 sm:py-2 sm:w-auto"
            >
              <option value={0}>ทุกอาคาร</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <select
                value={boardStatus}
                onChange={(e) => setBoardStatus(e.target.value)}
                className="emms-select text-xs py-2.5 sm:py-2 flex-1 sm:w-auto"
              >
                <option value="">ทุกสถานะ</option>
                {ALL_TICKET_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_META[st].shortLabel}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={loadBoard}
                className="emms-btn-secondary text-xs py-2.5 sm:py-2 px-3 shrink-0"
                title="รีเฟรชข้อมูลกระดาน"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingBoard ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>
        </div>

        {isLoadingBoard ? (
          <div className="py-10 flex flex-col items-center justify-center gap-2 text-[#9BA3B8]">
            <Loader2 className="w-6 h-6 text-[#2F6BFF] animate-spin" />
            <span className="text-xs">กำลังโหลดกระดานสถานะงานซ่อม...</span>
          </div>
        ) : boardItems.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#9BA3B8]">
            ยังไม่มีรายการแจ้งซ่อมที่ตรงกับเงื่อนไขที่เลือก
          </div>
        ) : (
          <>
            {/* Mobile Card List (< md) — Easy to read on smartphones without horizontal scrolling */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {boardItems.map((item) => (
                <div
                  key={item.ticket_code}
                  onClick={() => navigate(`/track/${item.ticket_code}`)}
                  className="bg-[#090A10] border border-[#1E2235] active:border-[#2F6BFF] rounded-xl p-3.5 space-y-2 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-sm text-[#5A8BFF]">
                      {item.ticket_code}
                    </span>
                    <StatusBadge status={item.status} short />
                  </div>
                  <div className="text-xs font-semibold text-[#F3F5FA] flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#2F6BFF] shrink-0 mt-0.5" />
                    <span>
                      {item.building_name} • {item.floor_name} • {item.room_name}
                      {item.location_detail ? ` (${item.location_detail})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#9BA3B8] pt-1 border-t border-[#1E2235]">
                    <span>หมวด: {item.category_name}</span>
                    <span>{formatThaiDateTime(item.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (md and up) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#1E2235] text-xs text-[#9BA3B8]">
                    <th className="py-3 px-3 font-semibold">รหัสใบงาน</th>
                    <th className="py-3 px-3 font-semibold">
                      สถานที่ (อาคาร • ชั้น • ห้อง)
                    </th>
                    <th className="py-3 px-3 font-semibold">หมวดหมู่งานซ่อม</th>
                    <th className="py-3 px-3 font-semibold">สถานะ</th>
                    <th className="py-3 px-3 font-semibold">เวลาที่แจ้ง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2235]">
                  {boardItems.map((item) => (
                    <tr
                      key={item.ticket_code}
                      onClick={() => navigate(`/track/${item.ticket_code}`)}
                      className="hover:bg-[#171A29] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3 font-mono font-bold text-[#5A8BFF] whitespace-nowrap">
                        {item.ticket_code}
                      </td>
                      <td className="py-3 px-3 text-[#F3F5FA]">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#9BA3B8] shrink-0" />
                          <span>
                            {item.building_name} • {item.floor_name} •{' '}
                            {item.room_name}
                          </span>
                        </div>
                        {item.location_detail && (
                          <span className="text-xs text-[#9BA3B8] block pl-5">
                            ({item.location_detail})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[#F3F5FA] whitespace-nowrap">
                        {item.category_name}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={item.status} short />
                      </td>
                      <td className="py-3 px-3 text-xs text-[#9BA3B8] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatThaiDateTime(item.created_at)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 text-xs text-[#9BA3B8] flex items-center justify-between flex-wrap gap-2">
              <span>
                แสดง {boardItems.length} รายการล่าสุด (จากทั้งหมด {boardTotal} รายการ)
              </span>
              <span>แตะที่รายการเพื่อดูรายละเอียดใบงาน</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
