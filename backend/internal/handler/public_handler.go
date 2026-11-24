package handler

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

	"github.com/emms/backend/internal/model"
	"github.com/emms/backend/internal/repository"
	"github.com/emms/backend/internal/storage"
	"github.com/emms/backend/internal/telegram"
	"github.com/go-chi/chi/v5"
)

const (
	maxMultipartMemory = 4 << 20 // 4 MB multipart memory buffer per emms-go-backend skill
	maxRequestBodySize = 8 << 20 // 8 MB total request body cap
)

// PublicHandler serves all Guest (no-login, Zero PII) endpoints.
type PublicHandler struct {
	masterRepo        repository.MasterRepository
	ticketRepo        repository.TicketRepository
	photoStorage      storage.PhotoStorage
	telegramNotifier  telegram.Notifier
	maxPhotoSizeBytes int
}

func NewPublicHandler(
	masterRepo repository.MasterRepository,
	ticketRepo repository.TicketRepository,
	photoStorage storage.PhotoStorage,
	telegramNotifier telegram.Notifier,
	maxPhotoSizeBytes int,
) *PublicHandler {
	if maxPhotoSizeBytes <= 0 {
		maxPhotoSizeBytes = storage.DefaultMaxPhotoSizeBytes
	}
	return &PublicHandler{
		masterRepo:        masterRepo,
		ticketRepo:        ticketRepo,
		photoStorage:      photoStorage,
		telegramNotifier:  telegramNotifier,
		maxPhotoSizeBytes: maxPhotoSizeBytes,
	}
}

// GetMasterData returns active buildings, floors, rooms, categories, and reporter_types.
func (h *PublicHandler) GetMasterData(w http.ResponseWriter, r *http.Request) {
	data, err := h.masterRepo.GetPublicMasterData(r.Context())
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, data)
}

// CheckDuplicate checks in real time whether there is already an open ticket
// in the selected room_id + category_id (ADR-005).
func (h *PublicHandler) CheckDuplicate(w http.ResponseWriter, r *http.Request) {
	roomID := parseIntQuery(r, "room_id", 0)
	categoryID := parseIntQuery(r, "category_id", 0)

	if roomID <= 0 || categoryID <= 0 {
		WriteJSON(w, http.StatusOK, model.DuplicateCheckResponse{
			HasDuplicate: false,
			Count:        0,
			OpenTickets:  []model.DuplicateTicketSummary{},
		})
		return
	}

	openTickets, err := h.ticketRepo.CheckDuplicate(r.Context(), roomID, categoryID)
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}

	WriteJSON(w, http.StatusOK, model.DuplicateCheckResponse{
		HasDuplicate: len(openTickets) > 0,
		Count:        len(openTickets),
		OpenTickets:  openTickets,
	})
}

// CreateTicket handles Guest ticket submission (Zero PII):
// - Hidden Honeypot anti-bot check
// - Enforces 1-3 before photos with strict magic-byte & 512 KB size validation
// - Uploads photos to Supabase Storage via Go Service Role Key
// - Atomically creates ticket MMS-YYYYMM-NNN in PostgreSQL
// - Triggers async Telegram notification to the technicians' group
func (h *PublicHandler) CreateTicket(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)
	if err := r.ParseMultipartForm(maxMultipartMemory); err != nil {
		WriteError(w, http.StatusBadRequest, "ไม่สามารถอ่านข้อมูลฟอร์มหรือไฟล์แนบมีขนาดใหญ่เกินกำหนด")
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()

	// 1. Hidden Honeypot Anti-Spam Check (ADR-010)
	honeypotVal := strings.TrimSpace(
		r.FormValue("website") + r.FormValue("hp_field") + r.FormValue("honeypot"),
	)
	if honeypotVal != "" {
		WriteError(w, http.StatusBadRequest, "คำขอถูกปฏิเสธเนื่องจากตรวจพบการทำงานอัตโนมัติ (Spam Protection)")
		return
	}

	// 2. Parse & validate required fields (Zero PII)
	buildingID, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("building_id")))
	floorID, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("floor_id")))
	roomID, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("room_id")))
	categoryID, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("category_id")))
	reporterTypeID, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("reporter_type_id")))
	locationDetail := strPtrOrNil(r.FormValue("location_detail"))
	description := strings.TrimSpace(r.FormValue("description"))

	if buildingID <= 0 || floorID <= 0 || roomID <= 0 {
		WriteError(w, http.StatusBadRequest, "กรุณาเลือกสถานที่ (อาคาร ชั้น และห้อง/บริเวณ) ให้ครบถ้วน")
		return
	}
	if categoryID <= 0 {
		WriteError(w, http.StatusBadRequest, "กรุณาเลือกหมวดหมู่งานซ่อม")
		return
	}
	if reporterTypeID <= 0 {
		WriteError(w, http.StatusBadRequest, "กรุณาเลือกประเภทผู้แจ้งซ่อม")
		return
	}
	if description == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุอาการหรือรายละเอียดความเสียหาย")
		return
	}

	// 3. Extract & validate 1-3 before photos (ADR-004)
	fileHeaders := extractMultipartFiles(r.MultipartForm, "photos", "photo", "before_photos")
	if len(fileHeaders) < 1 || len(fileHeaders) > 3 {
		WriteError(w, http.StatusBadRequest, "กรุณาแนบรูปภาพจุดที่ชำรุดอย่างน้อย 1 รูป และไม่เกิน 3 รูป")
		return
	}

	validatedPhotos := make([]*storage.ValidatedPhoto, 0, len(fileHeaders))
	for i, fh := range fileHeaders {
		vp, err := readAndValidateMultipartPhoto(fh, h.maxPhotoSizeBytes)
		if err != nil {
			WriteError(w, http.StatusBadRequest, fmt.Sprintf("รูปที่ %d: %s", i+1, err.Error()))
			return
		}
		validatedPhotos = append(validatedPhotos, vp)
	}

	// 4. Upload validated photos to Supabase Storage
	folderPrefix := fmt.Sprintf("room%d_cat%d", roomID, categoryID)
	photoRecords := make([]model.CreateTicketPhotoRecord, 0, len(validatedPhotos))
	for i, vp := range validatedPhotos {
		storagePath, publicURL, err := h.photoStorage.UploadPhoto(
			r.Context(),
			folderPrefix,
			model.PhotoTypeBefore,
			i+1,
			vp,
		)
		if err != nil {
			WriteError(w, http.StatusBadGateway, "ไม่สามารถอัปโหลดรูปภาพไปยังระบบจัดเก็บไฟล์ได้ กรุณาลองใหม่อีกครั้ง")
			return
		}
		photoRecords = append(photoRecords, model.CreateTicketPhotoRecord{
			PhotoType:     model.PhotoTypeBefore,
			StoragePath:   storagePath,
			PublicURL:     publicURL,
			MimeType:      vp.MimeType,
			FileSizeBytes: vp.SizeBytes,
			DisplayOrder:  i + 1,
		})
	}

	// 5. Persist ticket + photos + initial status log in PostgreSQL
	createdTicket, err := h.ticketRepo.CreateTicket(r.Context(), model.CreateTicketInput{
		BuildingID:     buildingID,
		FloorID:        floorID,
		RoomID:         roomID,
		LocationDetail: locationDetail,
		CategoryID:     categoryID,
		ReporterTypeID: reporterTypeID,
		Description:    description,
		Photos:         photoRecords,
	})
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}

	// 6. Trigger Async Telegram Notification (New Ticket ONLY — ADR-007)
	if h.telegramNotifier != nil {
		locDetail := ""
		if createdTicket.LocationDetail != nil {
			locDetail = *createdTicket.LocationDetail
		}
		firstPhotoURL := ""
		if len(createdTicket.BeforePhotos) > 0 {
			firstPhotoURL = createdTicket.BeforePhotos[0].PublicURL
		}
		var firstPhotoBytes []byte
		firstPhotoName := "damage_1.webp"
		if len(validatedPhotos) > 0 {
			firstPhotoBytes = validatedPhotos[0].Data
			firstPhotoName = "damage_1" + validatedPhotos[0].Extension
		}

		h.telegramNotifier.NotifyNewTicketAsync(telegram.NewTicketPayload{
			TicketCode:       createdTicket.TicketCode,
			BuildingName:     createdTicket.BuildingName,
			FloorName:        createdTicket.FloorName,
			RoomName:         createdTicket.RoomName,
			LocationDetail:   locDetail,
			CategoryName:     createdTicket.CategoryName,
			ReporterTypeName: createdTicket.ReporterTypeName,
			Description:      createdTicket.Description,
			FirstPhotoURL:    firstPhotoURL,
			FirstPhotoBytes:  firstPhotoBytes,
			FirstPhotoName:   firstPhotoName,
			CreatedAt:        createdTicket.CreatedAt,
		})
	}

	WriteJSON(w, http.StatusCreated, createdTicket)
}

// TrackTicketByCode returns full ticket status, timeline logs, and before/after photos
// when a Guest searches by exact code MMS-YYYYMM-NNN (ADR-005).
func (h *PublicHandler) TrackTicketByCode(w http.ResponseWriter, r *http.Request) {
	code := model.NormalizeTicketCode(chi.URLParam(r, "code"))
	if code == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุรหัสใบแจ้งซ่อม เช่น MMS-202611-001")
		return
	}

	ticket, err := h.ticketRepo.GetByCode(r.Context(), code)
	if err != nil {
		HandleRepoError(w, err, fmt.Sprintf("ไม่พบใบแจ้งซ่อมรหัส %s", code))
		return
	}

	WriteJSON(w, http.StatusOK, ticket)
}

// GetPublicBoard returns the compact Public Board strictly WITHOUT photos or internal admin notes (ADR-005).
func (h *PublicHandler) GetPublicBoard(w http.ResponseWriter, r *http.Request) {
	limit := parseIntQuery(r, "limit", 30)
	buildingID := parseIntQuery(r, "building_id", 0)
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !model.IsValidTicketStatus(status) {
		WriteError(w, http.StatusBadRequest, "สถานะที่ใช้กรองข้อมูลไม่ถูกต้อง")
		return
	}

	board, err := h.ticketRepo.ListPublicBoard(r.Context(), limit, status, buildingID)
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}

	WriteJSON(w, http.StatusOK, board)
}

func extractMultipartFiles(form *multipart.Form, fieldNames ...string) []*multipart.FileHeader {
	if form == nil || form.File == nil {
		return nil
	}
	var out []*multipart.FileHeader
	for _, name := range fieldNames {
		if files, ok := form.File[name]; ok && len(files) > 0 {
			out = append(out, files...)
		}
	}
	return out
}

func readAndValidateMultipartPhoto(fh *multipart.FileHeader, maxBytes int) (*storage.ValidatedPhoto, error) {
	f, err := fh.Open()
	if err != nil {
		return nil, fmt.Errorf("ไม่สามารถเปิดไฟล์รูปภาพได้")
	}
	defer f.Close()

	// Read up to maxBytes + 1024 bytes so ValidateImageBytes can report exact oversized message
	data, err := io.ReadAll(io.LimitReader(f, int64(maxBytes+1024)))
	if err != nil {
		return nil, fmt.Errorf("ไม่สามารถอ่านข้อมูลไฟล์รูปภาพได้")
	}

	return storage.ValidateImageBytes(fh.Filename, data, maxBytes)
}
