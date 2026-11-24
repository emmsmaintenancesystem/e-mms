// =============================================================================
// Local Ticket Memory (localStorage) — ADR-005
// Stores ticket codes (MMS-YYYYMM-NNN) submitted or tracked on this device
// so Guests can check status without any login or PII collection.
// =============================================================================

import { TicketStatus } from '../types/api';

const STORAGE_KEY = 'emms_my_tickets_v1';
const MAX_SAVED_TICKETS = 20;

export interface SavedLocalTicket {
  ticket_code: string;
  location_summary: string;
  category_name: string;
  status: TicketStatus;
  created_at: string;
  saved_at: string;
}

export function getSavedLocalTickets(): SavedLocalTicket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedLocalTicket =>
        item && typeof item.ticket_code === 'string' && item.ticket_code.trim() !== ''
    );
  } catch {
    return [];
  }
}

export function saveLocalTicket(entry: Omit<SavedLocalTicket, 'saved_at'>): SavedLocalTicket[] {
  try {
    const code = entry.ticket_code.trim().toUpperCase();
    if (!code) return getSavedLocalTickets();

    const current = getSavedLocalTickets().filter(
      (t) => t.ticket_code.toUpperCase() !== code
    );

    const updated: SavedLocalTicket[] = [
      {
        ...entry,
        ticket_code: code,
        saved_at: new Date().toISOString(),
      },
      ...current,
    ].slice(0, MAX_SAVED_TICKETS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function removeLocalTicket(ticketCode: string): SavedLocalTicket[] {
  try {
    const code = ticketCode.trim().toUpperCase();
    const updated = getSavedLocalTickets().filter(
      (t) => t.ticket_code.toUpperCase() !== code
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}
