import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  Filter,
  HandMetal,
  Image as ImageIcon,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  acknowledgeStaffTicket,
  fetchActiveTechnicians,
  fetchPublicMasterData,
  fetchStaffTicketByIdOrCode,
  fetchStaffTickets,
  updateStaffTicketStatus,
} from '../lib/apiClient';
import {
  CompressedPhotoItem,
  revokePhotoPreviews,
} from '../lib/imageCompressor';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { PhotoUploader } from '../components/PhotoUploader';
import { StatusBadge } from '../components/StatusBadge';
import {
  ALL_TICKET_STATUSES,
  Building,
  Category,
  OPEN_TICKET_STATUSES,
  STATUS_META,
  Technician,
  Ticket,
  TicketPhoto,
  TicketStatus,
  formatThaiDateTime,
} from '../types/api';

const UNREPAIRABLE_PRESETS = [
  'ไม่มีอะไหล่ทดแทนในท้องตลาด',
  'อุปกรณ์เสื่อมสภาพตามอายุการใช้งาน / เลิกใช้งาน',
  'ไม่มีงบประมาณซ่อมแซม / รอจัดซื้อทดแทนใหม่',
  'ไม่คุ้มค่าซ่อมแซม (ค่าซ่อมสูงกว่าราคาเครื่องใหม่)',
];

const CANCELLED_PRESETS = [
  'แจ้งซ้ำกับใบงานอื่นที่กำลังดำเนินการอยู่',
  'ผู้แจ้งขอยกเลิก / แก้ไขเบื้องต้นได้เองแล้ว',
  'ข้อมูลสถานที่หรือรายการแจ้งซ่อมไม่ถูกต้อง',
];

const WAITING_PARTS_PRESETS = [
  'อยู่ระหว่างทำเรื่องเบิกอะไหล่จากพัสดุ',
  'รอร้านค้าจัดส่งอะไหล่ทดแทน',
  'ส่งเคลม / ส่งซ่อมศูนย์บริการภายนอก',
];

export const StaffTicketsPage: React.FC = () => {
  const { hasRole } = useAuth();
  const canWrite = hasRole('technician', 'admin');
  const [searchParams, setSearchParams] = useSearchParams();

  // Master Data & Technicians Roster
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [techniciansRoster, setTechniciansRoster] = useState<Technician[]>([]);

  // Filter State
  const [statusTab, setStatusTab] = useState<string>('OPEN_ALL'); // '' | 'OPEN_ALL' | TicketStatus
  const [buildingId, setBuildingId] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ticket List State
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null);

  // Selected Ticket Detail & Status Modal State
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<TicketPhoto | null>(null);

  // Status Update Form inside Modal
  const [targetStatus, setTargetStatus] = useState<TicketStatus>('in_progress');
  const [statusNote, setStatusNote] = useState<string>('');
  const [selectedTechIds, setSelectedTechIds] = useState<number[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<CompressedPhotoItem[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicMasterData()
      .then((res) => {
        setBuildings(res.buildings || []);
        setCategories(res.categories || []);
      })
      .catch(() => {});

    fetchActiveTechnicians()
      .then((techs) => setTechniciansRoster(techs || []))
      .catch(() => {});
  }, []);

  const loadTickets = () => {
    setIsLoading(true);
    setListError(null);

    const apiStatus =
      statusTab === 'OPEN_ALL' || statusTab === '' ? undefined : statusTab;

    fetchStaffTickets({
      status: apiStatus,
      building_id: buildingId > 0 ? buildingId : undefined,
      category_id: categoryId > 0 ? categoryId : undefined,
      search: searchQuery.trim() || undefined,
      limit: 100,
      offset: 0,
    })
      .then((res) => {
        const rawItems = res.items || [];
        if (statusTab === 'OPEN_ALL') {
          const openFiltered = rawItems.filter((t) =>
            OPEN_TICKET_STATUSES.includes(t.status)
          );
          setTickets(openFiltered);
          setTotalCount(openFiltered.length);
        } else {
          setTickets(rawItems);
          setTotalCount(res.total || rawItems.length);
        }
      })
      .catch((err) => {
        setListError(
          err instanceof Error ? err.message : 'ไม่สามารถโหลดรายการใบแจ้งซ่อมได้'
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab, buildingId, categoryId]);

  // Handle Telegram Deep-Link (?code=MMS-YYYYMM-NNN)
  useEffect(() => {
    const deepCode = searchParams.get('code');
    if (deepCode && deepCode.trim() !== '') {
      openTicketModalByIdOrCode(deepCode.trim().toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const initModalForm = (ticket: Ticket) => {
    // Suggest logical next status
    const defaultNext: TicketStatus =
      ticket.status === 'pending'
        ? 'in_progress'
        : ticket.status === 'in_progress'
        ? 'completed'
        : ticket.status;
    setTargetStatus(defaultNext);
    setStatusNote(ticket.status_note || '');
    setSelectedTechIds(
      ticket.technicians ? ticket.technicians.map((t) => t.technician_id) : []
    );
    revokePhotoPreviews(afterPhotos);
    setAfterPhotos([]);
    setModalError(null);
    setModalSuccess(null);
  };

  const openTicketModalByIdOrCode = async (idOrCode: number | string) => {
    setIsLoadingDetail(true);
    setModalError(null);
    try {
      const fullTicket = await fetchStaffTicketByIdOrCode(idOrCode);
      setActiveTicket(fullTicket);
      initModalForm(fullTicket);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : 'ไม่พบข้อมูลใบแจ้งซ่อมที่ระบุ'
      );
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeTicketModal = () => {
    revokePhotoPreviews(afterPhotos);
    setAfterPhotos([]);
    setActiveTicket(null);
    setModalError(null);
    setModalSuccess(null);
    if (searchParams.has('code')) {
      searchParams.delete('code');
      setSearchParams(searchParams, { replace: true });
    }
  };

  // 1-Click Acknowledge ("รับทราบงาน")
  const handleQuickAcknowledge = async (ticket: Ticket, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!canWrite) return;

    setAcknowledgingId(ticket.id);
    try {
      const updated = await acknowledgeStaffTicket(
        ticket.id,
        'ทีมช่างรับทราบงานและกำลังเข้าตรวจสอบหน้างาน'
      );
      setTickets((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      if (activeTicket?.id === updated.id) {
        setActiveTicket(updated);
        initModalForm(updated);
        setModalSuccess('กดรับทราบงานเรียบร้อยแล้ว สถานะเปลี่ยนเป็น "กำลังซ่อม"');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถกดรับทราบงานได้');
    } finally {
      setAcknowledgingId(null);
    }
  };

  const toggleTechnicianSelection = (techId: number) => {
    setSelectedTechIds((prev) =>
      prev.includes(techId)
        ? prev.filter((id) => id !== techId)
        : [...prev, techId]
    );
  };

  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !canWrite) return;

    setModalError(null);
    setModalSuccess(null);

    const cleanNote = statusNote.trim();

    // Enforce ADR-006 & Golden Rule 4.3 per target status
    if (targetStatus === 'completed') {
      if (selectedTechIds.length < 1) {
        setModalError(
          'การปิดงานซ่อมเสร็จสิ้น (completed) บังคับต้องติ๊กเลือกชื่อช่างผู้เข้าปฏิบัติงานอย่างน้อย 1 คน'
        );
        return;
      }
      if (afterPhotos.length < 1 || afterPhotos.length > 3) {
        setModalError(
          'การปิดงานซ่อมเสร็จสิ้น (completed) บังคับต้องแนบรูปภาพหลังซ่อมอย่างน้อย 1 รูป (ไม่เกิน 3 รูป)'
        );
        return;
      }
      if (!cleanNote) {
        setModalError('กรุณากรอกสรุปผลการซ่อมเมื่อปิดงานซ่อมเสร็จสิ้น');
        return;
      }
    } else if (targetStatus === 'unrepairable') {
      if (selectedTechIds.length < 1) {
        setModalError(
          'กรณีไม่สามารถซ่อมได้ (unrepairable) บังคับต้องติ๊กเลือกชื่อช่างผู้ตรวจสอบหน้างานอย่างน้อย 1 คน'
        );
        return;
      }
      if (!cleanNote) {
        setModalError(
          'กรณีไม่สามารถซ่อมได้ (unrepairable) บังคับต้องระบุเหตุผลอย่างละเอียด (เช่น ไม่มีอะไหล่, เลิกใช้งาน, ไม่มีงบประมาณ)'
        );
        return;
      }
    } else if (targetStatus === 'cancelled') {
      if (!cleanNote) {
        setModalError('กรณียกเลิกรายการ (cancelled) บังคับต้องระบุเหตุผลการยกเลิก');
        return;
      }
    }

    setIsUpdatingStatus(true);
    try {
      const updated = await updateStaffTicketStatus({
        ticketId: activeTicket.id,
        status: targetStatus,
        note: cleanNote,
        technicianIds: selectedTechIds,
        afterPhotos: afterPhotos.map((p) => p.file),
      });

      setActiveTicket(updated);
      revokePhotoPreviews(afterPhotos);
      setAfterPhotos([]);
      setModalSuccess(
        `อัปเดตสถานะใบงาน ${updated.ticket_code} เป็น "${STATUS_META[updated.status].label}" เรียบร้อยแล้ว`
      );
      loadTickets();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'ไม่สามารถอัปเดตสถานะงานซ่อมได้'
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <PhotoLightbox
        photo={lightboxPhoto}
        onClose={() => setLightboxPhoto(null)}
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#F3F5FA] flex items-center gap-2.5">
            <Wrench className="w-6 h-6 text-[#2F6BFF]" />
            ระบบคิวงานช่างและการจัดการใบแจ้งซ่อม
          </h1>
          <p className="text-xs sm:text-sm text-[#9BA3B8] mt-0.5">
            ช่างทุกคนในทีมเห็นงานทั้งหมดร่วมกัน สามารถกด{' '}
            <strong className="text-[#FF984D]">"รับทราบงาน"</strong>{' '}
            ได้ทันทีในคลิกเดียว และเลือกชื่อช่างผู้ร่วมลงหน้างานตอนปิดงาน
          </p>
        </div>

        <button
          type="button"
          onClick={loadTickets}
          className="emms-btn-secondary text-xs sm:text-sm self-start sm:self-center"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>รีเฟรชคิวงาน</span>
        </button>
      </div>

      {/* Status Quick Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setStatusTab('OPEN_ALL')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${
            statusTab === 'OPEN_ALL'
              ? 'bg-[#FF7A1A] text-[#090A10] border-[#FF7A1A] shadow-sm'
              : 'bg-[#121420] text-[#9BA3B8] border-[#1E2235] hover:text-[#F3F5FA]'
          }`}
        >
          🔥 งานค้างทั้งหมด (ใหม่ + กำลังซ่อม + รออะไหล่)
        </button>

        <button
          type="button"
          onClick={() => setStatusTab('')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${
            statusTab === ''
              ? 'bg-[#2F6BFF] text-white border-[#2F6BFF]'
              : 'bg-[#121420] text-[#9BA3B8] border-[#1E2235] hover:text-[#F3F5FA]'
          }`}
        >
          ทั้งหมดทุกสถานะ
        </button>

        {ALL_TICKET_STATUSES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusTab(st)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all ${
              statusTab === st
                ? 'bg-[#2F6BFF] text-white border-[#2F6BFF]'
                : 'bg-[#121420] text-[#9BA3B8] border-[#1E2235] hover:text-[#F3F5FA]'
            }`}
          >
            {STATUS_META[st].shortLabel}
          </button>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div className="emms-card p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadTickets();
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-[#9BA3B8] absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหารหัสใบงาน (MMS-...), ชื่อห้อง, หรืออาการเสีย..."
              className="emms-input pl-10 text-xs sm:text-sm py-2"
            />
          </div>

          <select
            value={buildingId}
            onChange={(e) => setBuildingId(Number(e.target.value))}
            className="emms-select text-xs sm:text-sm py-2"
          >
            <option value={0}>ทุกอาคาร ({buildings.length})</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              className="emms-select text-xs sm:text-sm py-2 flex-1"
            >
              <option value={0}>ทุกหมวดหมู่ ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="emms-btn-primary text-xs py-2 px-3.5 shrink-0"
            >
              <Filter className="w-4 h-4" />
              <span>กรอง</span>
            </button>
          </div>
        </form>
      </div>

      {/* Loading Detail Overlay */}
      {isLoadingDetail && (
        <div className="emms-card p-4 flex items-center justify-center gap-2 text-xs text-[#5A8BFF]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>กำลังเปิดรายละเอียดใบแจ้งซ่อม...</span>
        </div>
      )}

      {/* Tickets List */}
      {isLoading ? (
        <div className="emms-card p-12 flex flex-col items-center justify-center gap-3 text-[#9BA3B8]">
          <Loader2 className="w-8 h-8 text-[#2F6BFF] animate-spin" />
          <p className="text-sm">กำลังโหลดคิวงานซ่อม...</p>
        </div>
      ) : listError ? (
        <div className="emms-card p-6 border-[#FF7A1A]/40 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-[#FF7A1A] mx-auto" />
          <p className="text-sm font-bold text-[#F3F5FA]">{listError}</p>
          <button
            type="button"
            onClick={loadTickets}
            className="emms-btn-primary text-xs mx-auto"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="emms-card p-12 text-center space-y-2">
          <ClipboardCheck className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-[#F3F5FA]">
            ไม่พบรายการแจ้งซ่อมในตัวกรองนี้
          </h3>
          <p className="text-xs text-[#9BA3B8]">
            ลองเปลี่ยนแท็บสถานะด้านบน หรือล้างตัวกรองอาคาร/หมวดหมู่เพื่อดูรายการอื่น
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#9BA3B8] px-1">
            <span>พบทั้งหมด {totalCount} รายการ</span>
            <span>คลิกที่การ์ดเพื่อดูรูปภาพขยายและอัปเดตสถานะ</span>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {tickets.map((ticket) => {
              const firstThumb =
                ticket.before_photos && ticket.before_photos.length > 0
                  ? ticket.before_photos[0].public_url
                  : null;

              return (
                <div
                  key={ticket.id}
                  onClick={() => openTicketModalByIdOrCode(ticket.id)}
                  className="emms-card p-4 sm:p-5 hover:border-[#2F6BFF]/60 transition-all cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Thumbnail */}
                    {firstThumb ? (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-[#090A10] border border-[#1E2235] shrink-0">
                        <img
                          src={firstThumb}
                          alt={ticket.ticket_code}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[#090A10] border border-[#1E2235] flex items-center justify-center text-[#9BA3B8] shrink-0">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                    )}

                    {/* Main Details */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-extrabold text-base text-[#5A8BFF]">
                          {ticket.ticket_code}
                        </span>
                        <StatusBadge status={ticket.status} />
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#171A29] text-[#F3F5FA] border border-[#1E2235]">
                          {ticket.category_name}
                        </span>
                        <span className="text-xs text-[#9BA3B8]">
                          ผู้แจ้ง: {ticket.reporter_type_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#F3F5FA]">
                        <MapPin className="w-4 h-4 text-[#2F6BFF] shrink-0" />
                        <span className="truncate">
                          {ticket.building_name} → {ticket.floor_name} →{' '}
                          {ticket.room_name}
                          {ticket.location_detail
                            ? ` (${ticket.location_detail})`
                            : ''}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-[#9BA3B8] line-clamp-2">
                        {ticket.description}
                      </p>

                      <div className="flex items-center gap-4 flex-wrap pt-1 text-[11px] text-[#9BA3B8]">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          แจ้งเมื่อ: {formatThaiDateTime(ticket.created_at)}
                        </span>
                        {ticket.technicians && ticket.technicians.length > 0 && (
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <Users className="w-3.5 h-3.5" />
                            ช่าง:{' '}
                            {ticket.technicians
                              .map((t) => t.nickname || t.full_name)
                              .join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div
                    className="flex items-center gap-2 self-end md:self-center shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canWrite && ticket.status === 'pending' && (
                      <button
                        type="button"
                        disabled={acknowledgingId === ticket.id}
                        onClick={(e) => handleQuickAcknowledge(ticket, e)}
                        className="emms-btn-accent text-xs px-3.5 py-2 shadow-md"
                      >
                        {acknowledgingId === ticket.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <HandMetal className="w-4 h-4" />
                        )}
                        <span>รับทราบงาน</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openTicketModalByIdOrCode(ticket.id)}
                      className="emms-btn-secondary text-xs px-3.5 py-2"
                    >
                      <Eye className="w-4 h-4 text-[#2F6BFF]" />
                      <span>{canWrite ? 'จัดการ / ปิดงาน' : 'ดูรายละเอียด'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          Ticket Detail & Status Update Modal (ADR-006)
         ===================================================================== */}
      {activeTicket && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto no-print"
          onClick={closeTicketModal}
        >
          <div
            className="bg-[#121420] border border-[#1E2235] rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Sticky Header */}
            <div className="sticky top-0 z-10 bg-[#121420]/95 backdrop-blur-md border-b border-[#1E2235] px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono font-black text-xl text-[#2F6BFF]">
                  {activeTicket.ticket_code}
                </span>
                <StatusBadge status={activeTicket.status} />
                <span className="text-xs text-[#9BA3B8]">
                  แจ้งเมื่อ {formatThaiDateTime(activeTicket.created_at)}
                </span>
              </div>
              <button
                type="button"
                onClick={closeTicketModal}
                className="p-1.5 rounded-xl bg-[#171A29] hover:bg-[#1E2235] text-[#F3F5FA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              {/* Quick 1-Click Acknowledge Banner if still pending */}
              {canWrite && activeTicket.status === 'pending' && (
                <div className="bg-[#FF7A1A]/15 border border-[#FF7A1A] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-extrabold text-[#FF984D]">
                      ใบงานใหม่รอดำเนินการ
                    </h3>
                    <p className="text-xs text-[#F3F5FA]">
                      กดปุ่ม "รับทราบงานทันที" เพื่อแจ้งให้ผู้แจ้งซ่อมทราบว่าทีมช่างรับเรื่องและกำลังเข้าหน้างาน
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={acknowledgingId === activeTicket.id}
                    onClick={() => handleQuickAcknowledge(activeTicket)}
                    className="emms-btn-accent text-xs px-4 py-2.5 shrink-0"
                  >
                    {acknowledgingId === activeTicket.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <HandMetal className="w-4 h-4" />
                    )}
                    <span>รับทราบงานทันที (1-Click)</span>
                  </button>
                </div>
              )}

              {/* Ticket Core Info & Photos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-4 space-y-2.5 text-sm">
                  <div className="flex items-start gap-2">
                    <Building2 className="w-4 h-4 text-[#2F6BFF] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs text-[#9BA3B8] block">สถานที่:</span>
                      <span className="font-bold text-[#F3F5FA]">
                        {activeTicket.building_name} → {activeTicket.floor_name} →{' '}
                        {activeTicket.room_name}
                      </span>
                      {activeTicket.location_detail && (
                        <span className="block text-xs text-[#5A8BFF] mt-0.5">
                          จุดย่อย: {activeTicket.location_detail}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-[#2F6BFF]" />
                    <span className="text-xs text-[#9BA3B8]">หมวดหมู่:</span>
                    <span className="font-semibold text-[#F3F5FA]">
                      {activeTicket.category_name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#2F6BFF]" />
                    <span className="text-xs text-[#9BA3B8]">ประเภทผู้แจ้ง:</span>
                    <span className="text-[#F3F5FA]">
                      {activeTicket.reporter_type_name}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[#1E2235]">
                    <span className="text-xs text-[#9BA3B8] block mb-1">
                      อาการหรือรายละเอียดความเสียหาย:
                    </span>
                    <p className="text-[#F3F5FA] bg-[#121420] p-3 rounded-lg border border-[#1E2235] whitespace-pre-wrap">
                      {activeTicket.description}
                    </p>
                  </div>
                </div>

                {/* Photos Panel */}
                <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-4 space-y-4">
                  <div>
                    <span className="text-xs font-bold text-[#FF984D] block mb-2">
                      รูปภาพก่อนซ่อม ({activeTicket.before_photos?.length || 0} รูป) — กดเพื่อดูภาพขยาย
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {activeTicket.before_photos?.map((p, idx) => (
                        <button
                          key={p.id || idx}
                          type="button"
                          onClick={() => setLightboxPhoto(p)}
                          className="aspect-video rounded-lg overflow-hidden border border-[#1E2235] hover:border-[#2F6BFF]"
                        >
                          <img
                            src={p.public_url}
                            alt={`ก่อนซ่อม ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeTicket.after_photos && activeTicket.after_photos.length > 0 && (
                    <div className="pt-3 border-t border-[#1E2235]">
                      <span className="text-xs font-bold text-emerald-400 block mb-2">
                        รูปภาพหลังซ่อมที่บันทึกไว้แล้ว ({activeTicket.after_photos.length} รูป)
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {activeTicket.after_photos.map((p, idx) => (
                          <button
                            key={p.id || idx}
                            type="button"
                            onClick={() => setLightboxPhoto(p)}
                            className="aspect-video rounded-lg overflow-hidden border border-[#1E2235] hover:border-emerald-400"
                          >
                            <img
                              src={p.public_url}
                              alt={`หลังซ่อม ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Update Form (For Technician & Admin Only) */}
              {canWrite ? (
                <form
                  onSubmit={handleUpdateStatusSubmit}
                  className="bg-[#090A10] border border-[#2F6BFF]/40 rounded-2xl p-5 space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-[#1E2235] pb-3">
                    <h3 className="text-base font-extrabold text-[#F3F5FA] flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-[#2F6BFF]" />
                      อัปเดตสถานะใบงาน / บันทึกผลการซ่อม
                    </h3>
                    <span className="text-xs text-[#9BA3B8]">
                      กำหนดสถานะได้ตามขั้นตอนจริง 6 สถานะ
                    </span>
                  </div>

                  {/* 1. Target Status Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-[#9BA3B8] mb-2">
                      1. เลือกสถานะที่ต้องการเปลี่ยน <span className="text-[#FF7A1A]">*</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {ALL_TICKET_STATUSES.map((st) => {
                        const meta = STATUS_META[st];
                        const isSelected = targetStatus === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              setTargetStatus(st);
                              setModalError(null);
                            }}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              isSelected
                                ? 'bg-[#2F6BFF]/20 border-[#2F6BFF] text-[#F3F5FA] ring-2 ring-[#2F6BFF]/40'
                                : 'bg-[#121420] border-[#1E2235] text-[#9BA3B8] hover:text-[#F3F5FA]'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`}
                              />
                              <span className="text-xs font-bold text-[#F3F5FA]">
                                {meta.shortLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#9BA3B8] mt-1 line-clamp-1">
                              {meta.label}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Technicians Multi-Select Roster (Mandatory for completed & unrepairable) */}
                  {(targetStatus === 'completed' ||
                    targetStatus === 'unrepairable' ||
                    targetStatus === 'in_progress') && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-[#F3F5FA]">
                          2. เลือกชื่อช่างผู้เข้าปฏิบัติงานหน้างาน (เลือกได้หลายคน){' '}
                          {(targetStatus === 'completed' ||
                            targetStatus === 'unrepairable') && (
                            <span className="text-[#FF7A1A] font-bold">
                              * บังคับอย่างน้อย 1 คน
                            </span>
                          )}
                        </label>
                        <span className="text-xs text-[#5A8BFF] font-semibold">
                          เลือกแล้ว {selectedTechIds.length} คน
                        </span>
                      </div>

                      {techniciansRoster.length === 0 ? (
                        <p className="text-xs text-[#FF7A1A]">
                          ยังไม่มีรายชื่อช่างในระบบ (ผู้ดูแลระบบสามารถเพิ่มได้ที่เมนูตั้งค่าระบบ)
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {techniciansRoster.map((tech) => {
                            const checked = selectedTechIds.includes(tech.id);
                            return (
                              <button
                                key={tech.id}
                                type="button"
                                onClick={() => toggleTechnicianSelection(tech.id)}
                                className={`flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-all ${
                                  checked
                                    ? 'bg-emerald-500/15 border-emerald-500 text-[#F3F5FA]'
                                    : 'bg-[#121420] border-[#1E2235] text-[#9BA3B8] hover:text-[#F3F5FA]'
                                }`}
                              >
                                <div className="truncate pr-2">
                                  <div className="font-bold text-[#F3F5FA]">
                                    {tech.full_name}
                                    {tech.nickname ? ` (${tech.nickname})` : ''}
                                  </div>
                                  {tech.specialty && (
                                    <div className="text-[11px] text-[#9BA3B8] truncate">
                                      {tech.specialty}
                                    </div>
                                  )}
                                </div>
                                <div
                                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                    checked
                                      ? 'bg-emerald-500 text-[#090A10]'
                                      : 'border border-[#1E2235] bg-[#090A10]'
                                  }`}
                                >
                                  {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. Note / Resolution / Reason Input with Quick Presets */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-[#F3F5FA]">
                      {targetStatus === 'completed'
                        ? '3. สรุปผลการซ่อมและการแก้ไข * (บังคับกรอก)'
                        : targetStatus === 'unrepairable'
                        ? '3. รายละเอียดเหตุผลที่ไม่สามารถซ่อมได้ * (บังคับกรอก)'
                        : targetStatus === 'cancelled'
                        ? '3. เหตุผลการยกเลิกรายการแจ้งซ่อม * (บังคับกรอก)'
                        : '3. บันทึกหมายเหตุ / รายละเอียดความคืบหน้า'}
                    </label>

                    {/* Quick Preset Chips */}
                    {targetStatus === 'unrepairable' && (
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        {UNREPAIRABLE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setStatusNote(preset)}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-[#171A29] hover:bg-[#2F6BFF]/20 text-[#9BA3B8] hover:text-[#F3F5FA] border border-[#1E2235]"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    )}

                    {targetStatus === 'cancelled' && (
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        {CANCELLED_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setStatusNote(preset)}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-[#171A29] hover:bg-[#2F6BFF]/20 text-[#9BA3B8] hover:text-[#F3F5FA] border border-[#1E2235]"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    )}

                    {targetStatus === 'waiting_parts' && (
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        {WAITING_PARTS_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setStatusNote(preset)}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-[#171A29] hover:bg-[#2F6BFF]/20 text-[#9BA3B8] hover:text-[#F3F5FA] border border-[#1E2235]"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      rows={3}
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      placeholder={
                        targetStatus === 'completed'
                          ? 'เช่น เปลี่ยนหลอดไฟ LED 18W จำนวน 2 หลอด และตรวจเช็กสวิตช์ใช้งานได้ปกติ'
                          : targetStatus === 'unrepairable'
                          ? 'ระบุเหตุผล เช่น ไม่มีอะไหล่ทดแทน / เลิกใช้งาน / ไม่มีงบประมาณซ่อม'
                          : targetStatus === 'cancelled'
                          ? 'ระบุเหตุผลการยกเลิก เช่น แจ้งซ้ำกับใบงานอื่น'
                          : 'ระบุรายละเอียดเพิ่มเติม (ถ้ามี)'
                      }
                      className="emms-input text-sm"
                    />
                  </div>

                  {/* 4. After-Repair Photos (Mandatory 1-3 for completed, Optional 0-3 for unrepairable) */}
                  {(targetStatus === 'completed' ||
                    targetStatus === 'unrepairable') && (
                    <PhotoUploader
                      photos={afterPhotos}
                      onChange={setAfterPhotos}
                      minPhotos={targetStatus === 'completed' ? 1 : 0}
                      maxPhotos={3}
                      required={targetStatus === 'completed'}
                      label={
                        targetStatus === 'completed'
                          ? '4. รูปภาพหลังซ่อมเสร็จสิ้น (บังคับ 1–3 รูป)'
                          : '4. รูปภาพประกอบการตรวจสอบ (ไม่บังคับ 0–3 รูป)'
                      }
                    />
                  )}

                  {modalError && (
                    <div className="bg-[#FF7A1A]/15 border border-[#FF7A1A] text-[#FF984D] rounded-xl p-3 text-xs font-medium flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-[#FF7A1A] shrink-0 mt-0.5" />
                      <span>{modalError}</span>
                    </div>
                  )}

                  {modalSuccess && (
                    <div className="bg-emerald-500/15 border border-emerald-500 text-emerald-300 rounded-xl p-3 text-xs font-medium flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{modalSuccess}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closeTicketModal}
                      className="emms-btn-secondary text-xs px-4 py-2.5"
                    >
                      ปิดหน้าต่าง
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingStatus}
                      className="emms-btn-primary text-xs px-6 py-2.5"
                    >
                      {isUpdatingStatus ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>กำลังบันทึกสถานะ...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>บันทึกการอัปเดตสถานะ</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-4 text-xs text-[#9BA3B8]">
                  คุณกำลังเข้าชมในสิทธิ์ผู้ดูรายงานสถิติ (Reporter - Read-only)
                </div>
              )}

              {/* Status Logs History */}
              {activeTicket.status_logs && activeTicket.status_logs.length > 0 && (
                <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#5A8BFF]">
                    ประวัติการเปลี่ยนสถานะ ({activeTicket.status_logs.length})
                  </h4>
                  <div className="space-y-2">
                    {activeTicket.status_logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#121420] border border-[#1E2235] rounded-lg p-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={log.to_status} short />
                          {log.note && (
                            <span className="text-[#F3F5FA]">{log.note}</span>
                          )}
                          {log.changed_by_name && (
                            <span className="text-[#5A8BFF]">
                              (โดย {log.changed_by_name})
                            </span>
                          )}
                        </div>
                        <span className="text-[#9BA3B8] shrink-0">
                          {formatThaiDateTime(log.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
