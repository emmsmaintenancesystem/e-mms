// =============================================================================
// e-MMS REST API Client (src/lib/apiClient.ts)
// Reads VITE_API_BASE_URL strictly from environment variables (Zero Secrets)
// =============================================================================

import {
  Building,
  Category,
  DuplicateCheckResponse,
  Floor,
  PaginatedTicketsResponse,
  PublicBoardResponse,
  PublicMasterDataResponse,
  ReportFilter,
  ReportSummaryResponse,
  ReporterType,
  Room,
  StaffRole,
  Technician,
  Ticket,
  TicketStatus,
  User,
} from '../types/api';

const TOKEN_STORAGE_KEY = 'emms_staff_jwt_v1';
const USER_STORAGE_KEY = 'emms_staff_user_v1';

export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
  return raw.replace(/\/+$/, '');
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string, user: User): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  isMultipart?: boolean;
  requiresAuth?: boolean;
  query?: Record<string, string | number | undefined | null>;
}

function buildUrl(
  path: string,
  query?: Record<string, string | number | undefined | null>
): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`);

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    isMultipart = false,
    requiresAuth = false,
    query,
  } = options;

  const headers: Record<string, string> = {};
  if (!isMultipart && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (requiresAuth) {
    const token = getStoredToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : isMultipart
        ? (body as FormData)
        : JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = `เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ (HTTP ${response.status})`;
    try {
      const errData = (await response.json()) as { error?: string; message?: string };
      if (errData?.error) {
        errorMessage = errData.error;
      } else if (errData?.message) {
        errorMessage = errData.message;
      }
    } catch {
      // Fallback if response is not JSON
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

// =============================================================================
// 1. Public Guest APIs (Zero PII, No Auth Required)
// =============================================================================

export async function fetchPublicMasterData(): Promise<PublicMasterDataResponse> {
  return apiRequest<PublicMasterDataResponse>('/api/public/master-data');
}

export async function checkDuplicateTicket(
  roomId: number,
  categoryId: number
): Promise<DuplicateCheckResponse> {
  return apiRequest<DuplicateCheckResponse>('/api/public/tickets/check-duplicate', {
    query: { room_id: roomId, category_id: categoryId },
  });
}

export interface CreatePublicTicketPayload {
  building_id: number;
  floor_id: number;
  room_id: number;
  location_detail?: string;
  category_id: number;
  reporter_type_id: number;
  description: string;
  website_honeypot?: string;
  photos: File[];
}

export async function createPublicTicket(
  payload: CreatePublicTicketPayload
): Promise<Ticket> {
  const formData = new FormData();
  formData.append('building_id', String(payload.building_id));
  formData.append('floor_id', String(payload.floor_id));
  formData.append('room_id', String(payload.room_id));
  if (payload.location_detail && payload.location_detail.trim() !== '') {
    formData.append('location_detail', payload.location_detail.trim());
  }
  formData.append('category_id', String(payload.category_id));
  formData.append('reporter_type_id', String(payload.reporter_type_id));
  formData.append('description', payload.description.trim());

  // Hidden honeypot anti-spam field (ADR-010)
  if (payload.website_honeypot) {
    formData.append('website', payload.website_honeypot);
  }

  for (const photo of payload.photos) {
    formData.append('photos', photo);
  }

  return apiRequest<Ticket>('/api/public/tickets', {
    method: 'POST',
    body: formData,
    isMultipart: true,
  });
}

export async function trackPublicTicketByCode(code: string): Promise<Ticket> {
  const normalized = encodeURIComponent(code.trim().toUpperCase());
  return apiRequest<Ticket>(`/api/public/tickets/${normalized}`);
}

export async function fetchPublicBoard(params?: {
  limit?: number;
  status?: string;
  building_id?: number;
}): Promise<PublicBoardResponse> {
  return apiRequest<PublicBoardResponse>('/api/public/board', {
    query: {
      limit: params?.limit ?? 30,
      status: params?.status || undefined,
      building_id: params?.building_id && params.building_id > 0 ? params.building_id : undefined,
    },
  });
}

// =============================================================================
// 2. Staff Authentication APIs
// =============================================================================

export interface LoginResponse {
  token: string;
  expires_at: string;
  user: User;
}

export async function loginStaff(username: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

export async function fetchCurrentUser(): Promise<{ user: User }> {
  return apiRequest<{ user: User }>('/api/auth/me', {
    requiresAuth: true,
  });
}

// =============================================================================
// 3. Staff Ticket Queue & Technician Operations APIs
// =============================================================================

export interface StaffTicketQuery {
  status?: string;
  building_id?: number;
  floor_id?: number;
  room_id?: number;
  category_id?: number;
  search?: string;
  year?: number;
  month?: number;
  limit?: number;
  offset?: number;
}

export async function fetchStaffTickets(
  params: StaffTicketQuery = {}
): Promise<PaginatedTicketsResponse> {
  return apiRequest<PaginatedTicketsResponse>('/api/staff/tickets', {
    requiresAuth: true,
    query: {
      status: params.status || undefined,
      building_id: params.building_id && params.building_id > 0 ? params.building_id : undefined,
      floor_id: params.floor_id && params.floor_id > 0 ? params.floor_id : undefined,
      room_id: params.room_id && params.room_id > 0 ? params.room_id : undefined,
      category_id: params.category_id && params.category_id > 0 ? params.category_id : undefined,
      search: params.search || undefined,
      year: params.year && params.year > 0 ? params.year : undefined,
      month: params.month && params.month > 0 ? params.month : undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  });
}

export async function fetchStaffTicketByIdOrCode(idOrCode: string | number): Promise<Ticket> {
  return apiRequest<Ticket>(`/api/staff/tickets/${encodeURIComponent(String(idOrCode))}`, {
    requiresAuth: true,
  });
}

export async function fetchActiveTechnicians(): Promise<Technician[]> {
  const res = await apiRequest<{ items: Technician[] }>('/api/staff/technicians', {
    requiresAuth: true,
  });
  return res.items || [];
}

export async function acknowledgeStaffTicket(
  ticketId: number,
  note?: string
): Promise<Ticket> {
  return apiRequest<Ticket>(`/api/staff/tickets/${ticketId}/acknowledge`, {
    method: 'POST',
    requiresAuth: true,
    body: { note: note || '' },
  });
}

export interface UpdateTicketStatusPayload {
  ticketId: number;
  status: TicketStatus;
  note: string;
  technicianIds: number[];
  afterPhotos: File[];
}

export async function updateStaffTicketStatus(
  payload: UpdateTicketStatusPayload
): Promise<Ticket> {
  const formData = new FormData();
  formData.append('status', payload.status);
  formData.append('note', payload.note.trim());

  if (payload.technicianIds.length > 0) {
    formData.append('technician_ids', payload.technicianIds.join(','));
  }

  for (const photo of payload.afterPhotos) {
    formData.append('photos', photo);
  }

  return apiRequest<Ticket>(`/api/staff/tickets/${payload.ticketId}/status`, {
    method: 'POST',
    requiresAuth: true,
    isMultipart: true,
    body: formData,
  });
}

// =============================================================================
// 4. Statistical Reports & Excel/CSV Export APIs (Reporter & Admin)
// =============================================================================

export async function fetchReportSummary(
  filter: Partial<ReportFilter>
): Promise<ReportSummaryResponse> {
  return apiRequest<ReportSummaryResponse>('/api/reports/summary', {
    requiresAuth: true,
    query: {
      year: filter.year,
      month: filter.month && filter.month > 0 ? filter.month : undefined,
      building_id: filter.building_id && filter.building_id > 0 ? filter.building_id : undefined,
      category_id: filter.category_id && filter.category_id > 0 ? filter.category_id : undefined,
      status: filter.status || undefined,
    },
  });
}

export async function downloadReportFile(
  format: 'csv' | 'xlsx',
  filter: Partial<ReportFilter>
): Promise<void> {
  const token = getStoredToken();
  const url = buildUrl(`/api/reports/export/${format}`, {
    year: filter.year,
    month: filter.month && filter.month > 0 ? filter.month : undefined,
    building_id: filter.building_id && filter.building_id > 0 ? filter.building_id : undefined,
    category_id: filter.category_id && filter.category_id > 0 ? filter.category_id : undefined,
    status: filter.status || undefined,
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let errMsg = `ไม่สามารถดาวน์โหลดไฟล์รายงานได้ (HTTP ${response.status})`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson?.error) errMsg = errJson.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const blob = await response.blob();
  const monthSuffix =
    filter.month && filter.month >= 1 && filter.month <= 12
      ? `_${String(filter.month).padStart(2, '0')}`
      : '';
  const defaultFilename = `emms_report_${filter.year || new Date().getFullYear()}${monthSuffix}.${format}`;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = defaultFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

// =============================================================================
// 5. Admin Master Data & User Management APIs (Admin Only)
// =============================================================================

export async function adminListBuildings(): Promise<Building[]> {
  const res = await apiRequest<{ items: Building[] }>('/api/admin/buildings', {
    requiresAuth: true,
  });
  return res.items || [];
}

export async function adminCreateBuilding(data: {
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}): Promise<Building> {
  return apiRequest<Building>('/api/admin/buildings', {
    method: 'POST',
    requiresAuth: true,
    body: data,
  });
}

export async function adminUpdateBuilding(
  id: number,
  data: { code: string; name: string; sort_order: number; is_active: boolean }
): Promise<Building> {
  return apiRequest<Building>(`/api/admin/buildings/${id}`, {
    method: 'PUT',
    requiresAuth: true,
    body: data,
  });
}

export async function adminListFloors(buildingId?: number): Promise<Floor[]> {
  const res = await apiRequest<{ items: Floor[] }>('/api/admin/floors', {
    requiresAuth: true,
    query: buildingId && buildingId > 0 ? { building_id: buildingId } : undefined,
  });
  return res.items || [];
}

export async function adminCreateFloor(data: {
  building_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}): Promise<Floor> {
  return apiRequest<Floor>('/api/admin/floors', {
    method: 'POST',
    requiresAuth: true,
    body: data,
  });
}

export async function adminUpdateFloor(
  id: number,
  data: { building_id: number; name: string; sort_order: number; is_active: boolean }
): Promise<Floor> {
  return apiRequest<Floor>(`/api/admin/floors/${id}`, {
    method: 'PUT',
    requiresAuth: true,
    body: data,
  });
}

export async function adminListRooms(params?: {
  building_id?: number;
  floor_id?: number;
}): Promise<Room[]> {
  const res = await apiRequest<{ items: Room[] }>('/api/admin/rooms', {
    requiresAuth: true,
    query: {
      building_id: params?.building_id && params.building_id > 0 ? params.building_id : undefined,
      floor_id: params?.floor_id && params.floor_id > 0 ? params.floor_id : undefined,
    },
  });
  return res.items || [];
}

export async function adminCreateRoom(data: {
  floor_id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}): Promise<Room> {
  return apiRequest<Room>('/api/admin/rooms', {
    method: 'POST',
    requiresAuth: true,
    body: data,
  });
}

export async function adminUpdateRoom(
  id: number,
  data: { floor_id: number; code: string; name: string; sort_order: number; is_active: boolean }
): Promise<Room> {
  return apiRequest<Room>(`/api/admin/rooms/${id}`, {
    method: 'PUT',
    requiresAuth: true,
    body: data,
  });
}

export async function adminListCategories(): Promise<Category[]> {
  const res = await apiRequest<{ items: Category[] }>('/api/admin/categories', {
    requiresAuth: true,
  });
  return res.items || [];
}

export async function adminCreateCategory(data: {
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}): Promise<Category> {
  return apiRequest<Category>('/api/admin/categories', {
    method: 'POST',
    requiresAuth: true,
    body: data,
  });
}

export async function adminUpdateCategory(
  id: number,
  data: {
    code: string;
    name: string;
    description: string;
    sort_order: number;
    is_active: boolean;
  }
): Promise<Category> {
  return apiRequest<Category>(`/api/admin/categories/${id}`, {
    method: 'PUT',
    requiresAuth: true,
    body: data,
  });
}

export async function adminListReporterTypes(): Promise<ReporterType[]> {
  const res = await apiRequest<{ items: ReporterType[] }>('/api/admin/reporter-types', {
    requiresAuth: true,
  });
  return res.items || [];
}

export async function adminCreateReporterType(data: {
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}): Promise<ReporterType> {
  return apiRequest<ReporterType>('/api/admin/reporter-types', {
    method: 'POST',
    requiresAuth: true,
    body: data,
  });
}

export async function adminUpdateReporterType(
  id: number,
  data: { code: string; name: string; sort_order: number; is_active: boolean }
): Promise<ReporterType> {
  return apiRequest<ReporterType>(`/api/admin/reporter-types/${id}`, {
    method: 'PUT',
    requiresAuth: true,
    body: data,
  });
}

export async function adminListTechnicians(): Promise<Technician[]> {
  const res = await apiRequest<{ items: Technician[] }>('/api/admin/technicians', {
    requiresAuth: true,
  });
  return res.items || [];
}

export async function adminCreateTechnician(data: {
  full_name: string;
  nickname: string;
  specialty: string;
  phone: string;
  sort_order: number;
  is_active: boolean;
}): Promise<Technician> {
  return apiRequest<Technician>('/api/admin/technicians', {
    method: 'POST',
    requiresAuth: true,
    body: data,
  });
}

export async function adminUpdateTechnician(
  id: number,
  data: {
    full_name: string;
    nickname: string;
    specialty: string;
    phone: string;
    sort_order: number;
    is_active: boolean;
  }
): Promise<Technician> {
  return apiRequest<Technician>(`/api/admin/technicians/${id}`, {
    method: 'PUT',
    requiresAuth: true,
    body: data,
  });
}

export async function adminListUsers(): Promise<User[]> {
  const res = await apiRequest<{ items: User[] }>('/api/admin/users', {
    requiresAuth: true,
  });
  return res.items || [];
}

export async function adminCreateUser(data: {
  username: string;
  password: string;
  display_name: string;
  role: StaffRole;
  is_active: boolean;
}): Promise<User> {
  return apiRequest<User>('/api/admin/users', {
    method: 'POST',
    requiresAuth: true,
    body: data,
  });
}

export async function adminUpdateUser(
  id: number,
  data: {
    username: string;
    display_name: string;
    role: StaffRole;
    is_active: boolean;
  }
): Promise<User> {
  return apiRequest<User>(`/api/admin/users/${id}`, {
    method: 'PUT',
    requiresAuth: true,
    body: data,
  });
}

export async function adminResetUserPassword(
  id: number,
  newPassword: string
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/admin/users/${id}/reset-password`, {
    method: 'POST',
    requiresAuth: true,
    body: { new_password: newPassword },
  });
}
