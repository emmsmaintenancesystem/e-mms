// =============================================================================
// e-MMS Frontend TypeScript Definitions & Business Enums
// Aligned 1-to-1 with backend/internal/model/models.go (ADR-002..ADR-008)
// =============================================================================

export type TicketStatus =
  | 'pending'
  | 'in_progress'
  | 'waiting_parts'
  | 'completed'
  | 'unrepairable'
  | 'cancelled';

export type StaffRole = 'technician' | 'reporter' | 'admin';

export type PhotoType = 'before' | 'after';

export const ALL_TICKET_STATUSES: TicketStatus[] = [
  'pending',
  'in_progress',
  'waiting_parts',
  'completed',
  'unrepairable',
  'cancelled',
];

export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  'pending',
  'in_progress',
  'waiting_parts',
];

export interface StatusMeta {
  value: TicketStatus;
  label: string;
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
  isOpen: boolean;
}

export const STATUS_META: Record<TicketStatus, StatusMeta> = {
  pending: {
    value: 'pending',
    label: 'แจ้งซ่อมใหม่ (รอดำเนินการ)',
    shortLabel: 'แจ้งซ่อมใหม่',
    badgeClass: 'bg-[#FF7A1A]/15 text-[#FF984D] border-[#FF7A1A]/40',
    dotClass: 'bg-[#FF7A1A]',
    isOpen: true,
  },
  in_progress: {
    value: 'in_progress',
    label: 'รับทราบงาน / กำลังซ่อม',
    shortLabel: 'กำลังซ่อม',
    badgeClass: 'bg-[#2F6BFF]/15 text-[#5A8BFF] border-[#2F6BFF]/40',
    dotClass: 'bg-[#2F6BFF]',
    isOpen: true,
  },
  waiting_parts: {
    value: 'waiting_parts',
    label: 'รออะไหล่ / ส่งซ่อมภายนอก',
    shortLabel: 'รออะไหล่',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    dotClass: 'bg-amber-400',
    isOpen: true,
  },
  completed: {
    value: 'completed',
    label: 'ซ่อมเสร็จสิ้น',
    shortLabel: 'ซ่อมเสร็จสิ้น',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    dotClass: 'bg-emerald-400',
    isOpen: false,
  },
  unrepairable: {
    value: 'unrepairable',
    label: 'ไม่สามารถซ่อมได้',
    shortLabel: 'ซ่อมไม่ได้',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    dotClass: 'bg-rose-400',
    isOpen: false,
  },
  cancelled: {
    value: 'cancelled',
    label: 'ยกเลิกรายการ',
    shortLabel: 'ยกเลิก',
    badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
    dotClass: 'bg-slate-400',
    isOpen: false,
  },
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  technician: 'ช่างซ่อมบำรุง (Technician)',
  reporter: 'ผู้บริหาร / ผู้ดูรายงานสถิติ (Reporter)',
  admin: 'ผู้ดูแลระบบ (Admin)',
};

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

// =============================================================================
// 1. Master Data Models
// =============================================================================

export interface Building {
  id: number;
  code: string | null;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Floor {
  id: number;
  building_id: number;
  building_name?: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: number;
  floor_id: number;
  floor_name?: string;
  building_id?: number;
  building_name?: string;
  code: string | null;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  code: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReporterType {
  id: number;
  code: string | null;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Technician {
  id: number;
  full_name: string;
  nickname: string | null;
  specialty: string | null;
  phone: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: StaffRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicMasterDataResponse {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  categories: Category[];
  reporter_types: ReporterType[];
}

// =============================================================================
// 2. Ticket Models & DTOs (Zero PII Guaranteed)
// =============================================================================

export interface TicketPhoto {
  id: number;
  ticket_id: number;
  photo_type: PhotoType;
  storage_path?: string;
  public_url: string;
  mime_type: string;
  file_size_bytes: number;
  display_order: number;
  uploaded_by_user_id?: number | null;
  created_at: string;
}

export interface TicketTechnician {
  ticket_id?: number;
  technician_id: number;
  full_name: string;
  nickname?: string | null;
  specialty?: string | null;
  assigned_at: string;
}

export interface TicketStatusLog {
  id: number;
  ticket_id: number;
  from_status: TicketStatus | null;
  to_status: TicketStatus;
  note: string | null;
  changed_by_user_id?: number | null;
  changed_by_name?: string | null;
  created_at: string;
}

export interface Ticket {
  id: number;
  ticket_code: string;
  building_id: number;
  building_name: string;
  floor_id: number;
  floor_name: string;
  room_id: number;
  room_code?: string | null;
  room_name: string;
  location_detail: string | null;
  category_id: number;
  category_name: string;
  reporter_type_id: number;
  reporter_type_name: string;
  description: string;
  status: TicketStatus;
  status_label: string;
  status_note: string | null;
  acknowledged_by_user_id?: number | null;
  acknowledged_by_name?: string | null;
  acknowledged_at: string | null;
  closed_by_user_id?: number | null;
  closed_by_name?: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  before_photos: TicketPhoto[];
  after_photos: TicketPhoto[];
  technicians: TicketTechnician[];
  status_logs?: TicketStatusLog[];
}

export interface DuplicateTicketSummary {
  ticket_code: string;
  status: TicketStatus;
  status_label: string;
  room_name: string;
  category_name: string;
  location_detail: string | null;
  description: string;
  created_at: string;
}

export interface DuplicateCheckResponse {
  has_duplicate: boolean;
  count: number;
  open_tickets: DuplicateTicketSummary[];
}

export interface PublicBoardItem {
  ticket_code: string;
  building_id: number;
  building_name: string;
  floor_name: string;
  room_name: string;
  location_detail?: string | null;
  category_id: number;
  category_name: string;
  status: TicketStatus;
  status_label: string;
  created_at: string;
  updated_at: string;
}

export interface PublicBoardResponse {
  items: PublicBoardItem[];
  total: number;
}

export interface PaginatedTicketsResponse {
  items: Ticket[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// 3. Statistical Report DTOs (ADR-008)
// =============================================================================

export interface ReportFilter {
  year: number;
  month: number; // 0 = all months
  building_id: number; // 0 = all buildings
  category_id: number; // 0 = all categories
  status: string; // "" = all statuses
}

export interface ReportOverview {
  total_tickets: number;
  open_backlog: number;
  pending_count: number;
  in_progress_count: number;
  waiting_parts_count: number;
  completed_count: number;
  unrepairable_count: number;
  cancelled_count: number;
  completion_rate: number;
  avg_ack_minutes: number;
  avg_resolve_hours: number;
}

export interface StatusStatItem {
  status: TicketStatus;
  status_label: string;
  count: number;
  percentage: number;
}

export interface MonthlyTrendItem {
  month: number;
  month_label: string;
  total: number;
  open_backlog: number;
  completed: number;
  unrepairable: number;
  cancelled: number;
}

export interface CategoryStatItem {
  category_id: number;
  category_code: string;
  category_name: string;
  total: number;
  open_backlog: number;
  completed: number;
  unrepairable: number;
  cancelled: number;
  percentage: number;
}

export interface BuildingStatItem {
  building_id: number;
  building_code: string;
  building_name: string;
  total: number;
  open_backlog: number;
  completed: number;
  unrepairable: number;
  cancelled: number;
  percentage: number;
}

export interface RoomHotspotItem {
  room_id: number;
  room_code: string;
  room_name: string;
  floor_name: string;
  building_name: string;
  total: number;
  open_backlog: number;
  completed: number;
  top_category: string;
}

export interface ExecutiveMatrixRow {
  building_id?: number;
  building_name?: string;
  category_id?: number;
  category_name: string;
  months: number[]; // length 12 (Jan..Dec)
  total: number;
  completed: number;
  open_backlog: number;
}

export interface TechnicianStatItem {
  technician_id: number;
  full_name: string;
  nickname: string;
  specialty: string;
  total_assigned: number;
  completed_count: number;
  unrepairable_count: number;
  avg_resolve_hours: number;
}

export interface ReportSummaryResponse {
  filter: ReportFilter;
  overview: ReportOverview;
  status_breakdown: StatusStatItem[];
  monthly_trend: MonthlyTrendItem[];
  by_category: CategoryStatItem[];
  by_building: BuildingStatItem[];
  top_rooms: RoomHotspotItem[];
  executive_matrix: ExecutiveMatrixRow[];
  building_month_matrix: ExecutiveMatrixRow[];
  by_technician: TechnicianStatItem[];
}

// =============================================================================
// 4. Formatting Helpers
// =============================================================================

export function formatThaiDateTime(isoString?: string | null): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatThaiDateShort(isoString?: string | null): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString('th-TH', {
    year: '2-digit',
    month: 'short',
    day: 'numeric',
  });
}

export function formatFileSizeKB(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}
