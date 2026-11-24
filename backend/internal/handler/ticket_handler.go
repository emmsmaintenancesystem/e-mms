package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/emms/backend/internal/middleware"
	"github.com/emms/backend/internal/model"
	"github.com/emms/backend/internal/repository"
	"github.com/emms/backend/internal/storage"
	"github.com/go-chi/chi/v5"
)

// TicketHandler serves staff endpoints for viewing, acknowledging, and updating repair tickets.
type TicketHandler struct {
	masterRepo        repository.MasterRepository
	ticketRepo        repository.TicketRepository
	photoStorage      storage.PhotoStorage
	maxPhotoSizeBytes int
}

func NewTicketHandler(
	masterRepo repository.MasterRepository,
	ticketRepo repository.TicketRepository,
	photoStorage storage.PhotoStorage,
	maxPhotoSizeBytes int,
) *TicketHandler {
	if maxPhotoSizeBytes <= 0 {
		maxPhotoSizeBytes = storage.DefaultMaxPhotoSizeBytes
	}
	return &TicketHandler{
		masterRepo:        masterRepo,
		ticketRepo:        ticketRepo,
		photoStorage:      photoStorage,
		maxPhotoSizeBytes: maxPhotoSizeBytes,
	}
}

// ListTickets lists tickets with filters for Technician, Reporter, and Admin roles.
func (h *TicketHandler) ListTickets(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !model.IsValidTicketStatus(status) {
		WriteError(w, http.StatusBadRequest, "สถานะงานซ่อมที่ใช้กรองไม่ถูกต้อง")
		return
	}

	filter := model.TicketFilter{
		Status:     status,
		BuildingID: parseIntQuery(r, "building_id", 0),
		FloorID:    parseIntQuery(r, "floor_id", 0),
		RoomID:     parseIntQuery(r, "room_id", 0),
		CategoryID: parseIntQuery(r, "category_id", 0),
		Search:     strings.TrimSpace(r.URL.Query().Get("search")),
		Year:       parseIntQuery(r, "year", 0),
		Month:      parseIntQuery(r, "month", 0),
		Limit:      parseIntQuery(r, "limit", 50),
		Offset:     parseIntQuery(r, "offset", 0),
	}

	result, err := h.ticketRepo.ListStaffTickets(r.Context(), filter)
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, result)
}

// GetTicket retrieves a single ticket by numeric ID or MMS-YYYYMM-NNN code.
func (h *TicketHandler) GetTicket(w http.ResponseWriter, r *http.Request) {
	idOrCode := strings.TrimSpace(chi.URLParam(r, "idOrCode"))
	if idOrCode == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุรหัสใบแจ้งซ่อม")
		return
	}

	var (
		ticket *model.Ticket
		err    error
	)
	if id, convErr := strconv.Atoi(idOrCode); convErr == nil && id > 0 {
		ticket, err = h.ticketRepo.GetByID(r.Context(), id)
	} else {
		ticket, err = h.ticketRepo.GetByCode(r.Context(), idOrCode)
	}

	if err != nil {
		HandleRepoError(w, err, "ไม่พบข้อมูลใบแจ้งซ่อม")
		return
	}
	WriteJSON(w, http.StatusOK, ticket)
}

// ListActiveTechnicians returns the active technicians roster so technicians can select
// who went onsite when closing a ticket (ADR-006).
func (h *TicketHandler) ListActiveTechnicians(w http.ResponseWriter, r *http.Request) {
	techs, err := h.masterRepo.ListActiveTechnicians(r.Context())
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"items": techs,
	})
}

type acknowledgeRequest struct {
	Note string `json:"note"`
}

// AcknowledgeTicket allows any technician on the team to 1-click "รับทราบงาน" (pending -> in_progress).
func (h *TicketHandler) AcknowledgeTicket(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserClaims(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบก่อนใช้งาน")
		return
	}

	ticketID, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || ticketID <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสอ้างอิงใบแจ้งซ่อมไม่ถูกต้อง")
		return
	}

	var notePtr *string
	if r.ContentLength > 0 {
		var req acknowledgeRequest
		if err := DecodeJSON(r, &req); err == nil {
			notePtr = strPtrOrNil(req.Note)
		}
	}

	updated, err := h.ticketRepo.AcknowledgeTicket(r.Context(), ticketID, claims.UserID, notePtr)
	if err != nil {
		HandleRepoError(w, err, "ไม่พบใบแจ้งซ่อมที่ต้องการรับงาน")
		return
	}

	WriteJSON(w, http.StatusOK, updated)
}

type jsonUpdateStatusRequest struct {
	Status        string `json:"status"`
	Note          string `json:"note"`
	TechnicianIDs []int  `json:"technician_ids"`
}

// UpdateStatus handles status transitions across the 6 statuses (ADR-006):
// Supports both application/json and multipart/form-data (for uploading 1-3 after-repair photos).
// Strict Guards:
// - completed: requires 1-3 after photos + >= 1 technician IDs + non-empty resolution note
// - unrepairable: requires non-empty reason note + >= 1 technician IDs (0-3 optional photos)
// - cancelled: requires non-empty reason note
func (h *TicketHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserClaims(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบก่อนใช้งาน")
		return
	}

	ticketID, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || ticketID <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสอ้างอิงใบแจ้งซ่อมไม่ถูกต้อง")
		return
	}

	contentType := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	var (
		toStatus        string
		note            string
		technicianIDs   []int
		validatedPhotos []*storage.ValidatedPhoto
	)

	if strings.HasPrefix(contentType, "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)
		if err := r.ParseMultipartForm(maxMultipartMemory); err != nil {
			WriteError(w, http.StatusBadRequest, "ไม่สามารถอ่านข้อมูลฟอร์มหรือไฟล์รูปหลังซ่อมมีขนาดใหญ่เกินกำหนด")
			return
		}
		defer func() {
			if r.MultipartForm != nil {
				_ = r.MultipartForm.RemoveAll()
			}
		}()

		toStatus = strings.TrimSpace(r.FormValue("status"))
		note = strings.TrimSpace(r.FormValue("note"))
		if note == "" {
			note = strings.TrimSpace(r.FormValue("status_note"))
		}
		technicianIDs = parseTechnicianIDsFromForm(r)

		fileHeaders := extractMultipartFiles(r.MultipartForm, "photos", "after_photos", "photo")
		if len(fileHeaders) > 3 {
			WriteError(w, http.StatusBadRequest, "แนบรูปภาพหลังซ่อมได้สูงสุดไม่เกิน 3 รูป")
			return
		}
		for i, fh := range fileHeaders {
			vp, err := readAndValidateMultipartPhoto(fh, h.maxPhotoSizeBytes)
			if err != nil {
				WriteError(w, http.StatusBadRequest, fmt.Sprintf("รูปหลังซ่อมที่ %d: %s", i+1, err.Error()))
				return
			}
			validatedPhotos = append(validatedPhotos, vp)
		}
	} else {
		var req jsonUpdateStatusRequest
		if err := DecodeJSON(r, &req); err != nil {
			WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลการอัปเดตสถานะไม่ถูกต้อง")
			return
		}
		toStatus = strings.TrimSpace(req.Status)
		note = strings.TrimSpace(req.Note)
		technicianIDs = cleanTechnicianIDs(req.TechnicianIDs)
	}

	// Validate target status against the 6 allowed statuses
	if !model.IsValidTicketStatus(toStatus) {
		WriteError(w, http.StatusBadRequest, "สถานะงานซ่อมไม่ถูกต้อง (อนุญาตเฉพาะ 6 สถานะที่กำหนดเท่านั้น)")
		return
	}

	// Enforce business rules per target status (ADR-004, ADR-006, Golden Rule 4.3)
	switch toStatus {
	case model.StatusCompleted:
		if len(validatedPhotos) < 1 || len(validatedPhotos) > 3 {
			WriteError(w, http.StatusBadRequest, "การปิดงานซ่อมเสร็จสิ้น (completed) บังคับต้องแนบรูปภาพหลังซ่อมอย่างน้อย 1 รูป (สูงสุด 3 รูป)")
			return
		}
		if len(technicianIDs) < 1 {
			WriteError(w, http.StatusBadRequest, "กรุณาเลือกชื่อช่างผู้เข้าปฏิบัติงานหน้างานอย่างน้อย 1 คน")
			return
		}
		if note == "" {
			WriteError(w, http.StatusBadRequest, "กรุณาระบุสรุปผลการซ่อมเมื่อปิดงานซ่อมเสร็จสิ้น")
			return
		}

	case model.StatusUnrepairable:
		if note == "" {
			WriteError(w, http.StatusBadRequest, "กรณีไม่สามารถซ่อมได้ (unrepairable) บังคับต้องระบุเหตุผลอย่างละเอียด (เช่น ไม่มีอะไหล่, เลิกใช้งาน, ไม่มีงบประมาณ)")
			return
		}
		if len(technicianIDs) < 1 {
			WriteError(w, http.StatusBadRequest, "กรุณาเลือกชื่อช่างผู้เข้าตรวจสอบหน้างานอย่างน้อย 1 คน")
			return
		}

	case model.StatusCancelled:
		if note == "" {
			WriteError(w, http.StatusBadRequest, "กรณียกเลิกรายการแจ้งซ่อม (cancelled) บังคับต้องระบุเหตุผลการยกเลิก")
			return
		}
	}

	// Upload any after-repair photos to Supabase Storage
	afterRecords := make([]model.CreateTicketPhotoRecord, 0, len(validatedPhotos))
	if len(validatedPhotos) > 0 {
		folderPrefix := fmt.Sprintf("ticket_%d_after", ticketID)
		for i, vp := range validatedPhotos {
			storagePath, publicURL, err := h.photoStorage.UploadPhoto(
				r.Context(),
				folderPrefix,
				model.PhotoTypeAfter,
				i+1,
				vp,
			)
			if err != nil {
				WriteError(w, http.StatusBadGateway, "ไม่สามารถอัปโหลดรูปภาพหลังซ่อมได้ กรุณาลองใหม่อีกครั้ง")
				return
			}
			afterRecords = append(afterRecords, model.CreateTicketPhotoRecord{
				PhotoType:     model.PhotoTypeAfter,
				StoragePath:   storagePath,
				PublicURL:     publicURL,
				MimeType:      vp.MimeType,
				FileSizeBytes: vp.SizeBytes,
				DisplayOrder:  i + 1,
			})
		}
	}

	updatedTicket, err := h.ticketRepo.UpdateTicketStatus(r.Context(), model.UpdateStatusInput{
		TicketID:      ticketID,
		ToStatus:      toStatus,
		Note:          strPtrOrNil(note),
		TechnicianIDs: technicianIDs,
		AfterPhotos:   afterRecords,
		ActorUserID:   claims.UserID,
	})
	if err != nil {
		HandleRepoError(w, err, "ไม่พบใบแจ้งซ่อมที่ต้องการอัปเดตสถานะ")
		return
	}

	WriteJSON(w, http.StatusOK, updatedTicket)
}

func parseTechnicianIDsFromForm(r *http.Request) []int {
	var rawIDs []int
	if r.MultipartForm != nil && r.MultipartForm.Value != nil {
		for _, key := range []string{"technician_ids", "technician_ids[]", "technician_id"} {
			for _, val := range r.MultipartForm.Value[key] {
				val = strings.TrimSpace(val)
				if val == "" {
					continue
				}
				// Support JSON array string e.g. "[1, 2]"
				if strings.HasPrefix(val, "[") {
					var arr []int
					if err := json.Unmarshal([]byte(val), &arr); err == nil {
						rawIDs = append(rawIDs, arr...)
						continue
					}
				}
				// Support comma-separated e.g. "1,2,3" or single integer
				for _, part := range strings.Split(val, ",") {
					if id, err := strconv.Atoi(strings.TrimSpace(part)); err == nil && id > 0 {
						rawIDs = append(rawIDs, id)
					}
				}
			}
		}
	}
	return cleanTechnicianIDs(rawIDs)
}

func cleanTechnicianIDs(ids []int) []int {
	seen := make(map[int]bool)
	out := make([]int, 0, len(ids))
	for _, id := range ids {
		if id > 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}
