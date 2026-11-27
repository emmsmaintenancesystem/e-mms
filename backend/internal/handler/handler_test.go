package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/emms/backend/internal/config"
	"github.com/emms/backend/internal/middleware"
	"github.com/emms/backend/internal/model"
	"github.com/emms/backend/internal/repository"
	"github.com/emms/backend/internal/storage"
	"github.com/emms/backend/internal/telegram"
	"golang.org/x/crypto/bcrypt"
)

// =============================================================================
// Mock Implementations for Comprehensive Handler Unit Tests
// =============================================================================

type mockMasterRepo struct {
	users map[string]*model.User
}

func newMockMasterRepo() *mockMasterRepo {
	adminHash, _ := bcrypt.GenerateFromPassword([]byte("Admin@1234"), bcrypt.MinCost)
	techHash, _ := bcrypt.GenerateFromPassword([]byte("Tech@1234"), bcrypt.MinCost)
	repHash, _ := bcrypt.GenerateFromPassword([]byte("Report@1234"), bcrypt.MinCost)

	return &mockMasterRepo{
		users: map[string]*model.User{
			"admin":    {ID: 1, Username: "admin", PasswordHash: string(adminHash), DisplayName: "Admin", Role: model.RoleAdmin, IsActive: true},
			"tech":     {ID: 2, Username: "tech", PasswordHash: string(techHash), DisplayName: "Tech Team", Role: model.RoleTechnician, IsActive: true},
			"reporter": {ID: 3, Username: "reporter", PasswordHash: string(repHash), DisplayName: "Reporter", Role: model.RoleReporter, IsActive: true},
		},
	}
}

func (m *mockMasterRepo) Ping(ctx context.Context) error { return nil }
func (m *mockMasterRepo) GetPublicMasterData(ctx context.Context) (*model.PublicMasterDataResponse, error) {
	return &model.PublicMasterDataResponse{
		Buildings:     []model.Building{{ID: 1, Name: "อาคาร 1", IsActive: true}},
		Floors:        []model.Floor{{ID: 1, BuildingID: 1, Name: "ชั้น 1", IsActive: true}},
		Rooms:         []model.Room{{ID: 1, FloorID: 1, BuildingID: 1, Name: "ห้อง 101", IsActive: true}},
		Categories:    []model.Category{{ID: 1, Name: "ระบบไฟฟ้า", IsActive: true}},
		Subcategories: []model.Subcategory{{ID: 1, CategoryID: 1, Name: "หลอดไฟ / โคมไฟ", IsActive: true}},
		ReporterTypes: []model.ReporterType{{ID: 1, Name: "เจ้าหน้าที่", IsActive: true}},
	}, nil
}
func (m *mockMasterRepo) ListActiveTechnicians(ctx context.Context) ([]model.Technician, error) {
	return []model.Technician{{ID: 1, FullName: "นายสมชาย สายฟ้า", IsActive: true}}, nil
}
func (m *mockMasterRepo) GetUserByUsername(ctx context.Context, username string) (*model.User, error) {
	u, ok := m.users[strings.ToLower(username)]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return u, nil
}
func (m *mockMasterRepo) GetUserByID(ctx context.Context, id int) (*model.User, error) {
	for _, u := range m.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (m *mockMasterRepo) UpdateUserLastLogin(ctx context.Context, userID int) error { return nil }
func (m *mockMasterRepo) ListBuildings(ctx context.Context) ([]model.Building, error) {
	return []model.Building{{ID: 1, Name: "อาคาร 1", IsActive: true}}, nil
}
func (m *mockMasterRepo) CreateBuilding(ctx context.Context, b *model.Building) (*model.Building, error) {
	b.ID = 2
	return b, nil
}
func (m *mockMasterRepo) UpdateBuilding(ctx context.Context, b *model.Building) (*model.Building, error) {
	return b, nil
}
func (m *mockMasterRepo) ListFloors(ctx context.Context, buildingID int) ([]model.Floor, error) {
	return nil, nil
}
func (m *mockMasterRepo) CreateFloor(ctx context.Context, f *model.Floor) (*model.Floor, error) {
	return f, nil
}
func (m *mockMasterRepo) UpdateFloor(ctx context.Context, f *model.Floor) (*model.Floor, error) {
	return f, nil
}
func (m *mockMasterRepo) ListRooms(ctx context.Context, floorID int, buildingID int) ([]model.Room, error) {
	return nil, nil
}
func (m *mockMasterRepo) CreateRoom(ctx context.Context, r *model.Room) (*model.Room, error) {
	return r, nil
}
func (m *mockMasterRepo) UpdateRoom(ctx context.Context, r *model.Room) (*model.Room, error) {
	return r, nil
}
func (m *mockMasterRepo) ListCategories(ctx context.Context) ([]model.Category, error) {
	return nil, nil
}
func (m *mockMasterRepo) CreateCategory(ctx context.Context, c *model.Category) (*model.Category, error) {
	return c, nil
}
func (m *mockMasterRepo) UpdateCategory(ctx context.Context, c *model.Category) (*model.Category, error) {
	return c, nil
}
func (m *mockMasterRepo) ListSubcategories(ctx context.Context, categoryID int) ([]model.Subcategory, error) {
	return []model.Subcategory{{ID: 1, CategoryID: 1, Name: "หลอดไฟ / โคมไฟ", IsActive: true}}, nil
}
func (m *mockMasterRepo) CreateSubcategory(ctx context.Context, sc *model.Subcategory) (*model.Subcategory, error) {
	sc.ID = 2
	return sc, nil
}
func (m *mockMasterRepo) UpdateSubcategory(ctx context.Context, sc *model.Subcategory) (*model.Subcategory, error) {
	return sc, nil
}
func (m *mockMasterRepo) ListReporterTypes(ctx context.Context) ([]model.ReporterType, error) {
	return nil, nil
}
func (m *mockMasterRepo) CreateReporterType(ctx context.Context, rt *model.ReporterType) (*model.ReporterType, error) {
	return rt, nil
}
func (m *mockMasterRepo) UpdateReporterType(ctx context.Context, rt *model.ReporterType) (*model.ReporterType, error) {
	return rt, nil
}
func (m *mockMasterRepo) ListTechnicians(ctx context.Context) ([]model.Technician, error) {
	return nil, nil
}
func (m *mockMasterRepo) CreateTechnician(ctx context.Context, t *model.Technician) (*model.Technician, error) {
	return t, nil
}
func (m *mockMasterRepo) UpdateTechnician(ctx context.Context, t *model.Technician) (*model.Technician, error) {
	return t, nil
}
func (m *mockMasterRepo) ListUsers(ctx context.Context) ([]model.User, error) { return nil, nil }
func (m *mockMasterRepo) CreateUser(ctx context.Context, u *model.User, hash string) (*model.User, error) {
	return u, nil
}
func (m *mockMasterRepo) UpdateUser(ctx context.Context, u *model.User) (*model.User, error) {
	return u, nil
}
func (m *mockMasterRepo) ResetUserPassword(ctx context.Context, userID int, hash string) error {
	return nil
}

type mockTicketRepo struct {
	tickets []*model.Ticket
}

func newMockTicketRepo() *mockTicketRepo {
	now := time.Now()
	return &mockTicketRepo{
		tickets: []*model.Ticket{
			{
				ID:               1,
				TicketCode:       "MMS-202611-001",
				BuildingID:       1,
				BuildingName:     "อาคารอำนวยการ",
				FloorID:          1,
				FloorName:        "ชั้น 1",
				RoomID:           10,
				RoomName:         "ห้อง 101",
				CategoryID:       2,
				CategoryName:     "ระบบแอร์",
				ReporterTypeID:   1,
				ReporterTypeName: "เจ้าหน้าที่",
				Description:      "แอร์ไม่เย็น",
				Status:           model.StatusPending,
				StatusLabel:      model.ThaiStatusLabel(model.StatusPending),
				CreatedAt:        now,
				UpdatedAt:        now,
				BeforePhotos: []model.TicketPhoto{
					{ID: 1, TicketID: 1, PhotoType: "before", PublicURL: "https://secret-bucket/photo1.webp"},
				},
			},
		},
	}
}

func (m *mockTicketRepo) CheckDuplicate(ctx context.Context, roomID int, categoryID int, subcategoryID int) ([]model.DuplicateTicketSummary, error) {
	var out []model.DuplicateTicketSummary
	for _, t := range m.tickets {
		if t.RoomID == roomID && t.CategoryID == categoryID && model.IsOpenStatus(t.Status) {
			if subcategoryID > 0 && (t.SubcategoryID == nil || *t.SubcategoryID != subcategoryID) {
				continue
			}
			out = append(out, model.DuplicateTicketSummary{
				TicketCode:      t.TicketCode,
				Status:          t.Status,
				StatusLabel:     t.StatusLabel,
				RoomName:        t.RoomName,
				CategoryName:    t.CategoryName,
				SubcategoryID:   t.SubcategoryID,
				SubcategoryName: t.SubcategoryName,
				Description:     t.Description,
				CreatedAt:       t.CreatedAt,
			})
		}
	}
	return out, nil
}

func (m *mockTicketRepo) CreateTicket(ctx context.Context, input model.CreateTicketInput) (*model.Ticket, error) {
	id := len(m.tickets) + 1
	code := fmt.Sprintf("MMS-202611-%03d", id)
	var beforePhotos []model.TicketPhoto
	for i, p := range input.Photos {
		beforePhotos = append(beforePhotos, model.TicketPhoto{
			ID:           i + 1,
			TicketID:     id,
			PhotoType:    "before",
			StoragePath:  p.StoragePath,
			PublicURL:    p.PublicURL,
			MimeType:     p.MimeType,
			DisplayOrder: i + 1,
		})
	}
	t := &model.Ticket{
		ID:               id,
		TicketCode:       code,
		BuildingID:       input.BuildingID,
		BuildingName:     "อาคารอำนวยการ",
		FloorID:          input.FloorID,
		FloorName:        "ชั้น 1",
		RoomID:           input.RoomID,
		RoomName:         "ห้อง 101",
		LocationDetail:   input.LocationDetail,
		CategoryID:       input.CategoryID,
		CategoryName:     "ระบบไฟฟ้า",
		ReporterTypeID:   input.ReporterTypeID,
		ReporterTypeName: "เจ้าหน้าที่",
		Description:      input.Description,
		Status:           model.StatusPending,
		StatusLabel:      model.ThaiStatusLabel(model.StatusPending),
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
		BeforePhotos:     beforePhotos,
		AfterPhotos:      []model.TicketPhoto{},
		Technicians:      []model.TicketTechnician{},
	}
	m.tickets = append(m.tickets, t)
	return t, nil
}

func (m *mockTicketRepo) GetByCode(ctx context.Context, code string) (*model.Ticket, error) {
	for _, t := range m.tickets {
		if strings.EqualFold(t.TicketCode, code) {
			return t, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockTicketRepo) GetByID(ctx context.Context, id int) (*model.Ticket, error) {
	for _, t := range m.tickets {
		if t.ID == id {
			return t, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockTicketRepo) ListPublicBoard(ctx context.Context, limit int, status string, buildingID int) (*model.PublicBoardResponse, error) {
	var items []model.PublicBoardItem
	for _, t := range m.tickets {
		items = append(items, model.PublicBoardItem{
			TicketCode:   t.TicketCode,
			BuildingID:   t.BuildingID,
			BuildingName: t.BuildingName,
			FloorName:    t.FloorName,
			RoomName:     t.RoomName,
			CategoryID:   t.CategoryID,
			CategoryName: t.CategoryName,
			Status:       t.Status,
			StatusLabel:  t.StatusLabel,
			CreatedAt:    t.CreatedAt,
			UpdatedAt:    t.UpdatedAt,
		})
	}
	return &model.PublicBoardResponse{Items: items, Total: len(items)}, nil
}

func (m *mockTicketRepo) ListStaffTickets(ctx context.Context, filter model.TicketFilter) (*model.PaginatedTicketsResponse, error) {
	var items []model.Ticket
	for _, t := range m.tickets {
		items = append(items, *t)
	}
	return &model.PaginatedTicketsResponse{Items: items, Total: len(items), Limit: 50, Offset: 0}, nil
}

func (m *mockTicketRepo) AcknowledgeTicket(ctx context.Context, ticketID int, userID int, note *string) (*model.Ticket, error) {
	t, err := m.GetByID(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	t.Status = model.StatusInProgress
	t.StatusLabel = model.ThaiStatusLabel(model.StatusInProgress)
	t.StatusNote = note
	return t, nil
}

func (m *mockTicketRepo) UpdateTicketStatus(ctx context.Context, input model.UpdateStatusInput) (*model.Ticket, error) {
	t, err := m.GetByID(ctx, input.TicketID)
	if err != nil {
		return nil, err
	}
	t.Status = input.ToStatus
	t.StatusLabel = model.ThaiStatusLabel(input.ToStatus)
	t.StatusNote = input.Note
	t.Technicians = nil
	for _, techID := range input.TechnicianIDs {
		t.Technicians = append(t.Technicians, model.TicketTechnician{
			TicketID:     t.ID,
			TechnicianID: techID,
			FullName:     "นายสมชาย สายฟ้า",
		})
	}
	t.AfterPhotos = nil
	for i, p := range input.AfterPhotos {
		t.AfterPhotos = append(t.AfterPhotos, model.TicketPhoto{
			ID:           100 + i,
			TicketID:     t.ID,
			PhotoType:    "after",
			PublicURL:    p.PublicURL,
			DisplayOrder: i + 1,
		})
	}
	return t, nil
}

type mockReportRepo struct{}

func (m *mockReportRepo) GetReportSummary(ctx context.Context, filter model.ReportFilter) (*model.ReportSummaryResponse, error) {
	return &model.ReportSummaryResponse{
		Filter:   filter,
		Overview: model.ReportOverview{TotalTickets: 5, CompletedCount: 4, OpenBacklog: 1},
	}, nil
}

func (m *mockReportRepo) ListTicketsForExport(ctx context.Context, filter model.ReportFilter) ([]model.ExportTicketRow, error) {
	return []model.ExportTicketRow{
		{TicketCode: "MMS-202611-001", CreatedAt: time.Now(), BuildingName: "อาคาร 1", StatusLabel: "ซ่อมเสร็จสิ้น"},
	}, nil
}

type mockStorage struct{}

func (m *mockStorage) UploadPhoto(ctx context.Context, folderPrefix string, photoType string, order int, photo *storage.ValidatedPhoto) (string, string, error) {
	path := fmt.Sprintf("202611/%s/%s_%d%s", folderPrefix, photoType, order, photo.Extension)
	url := "https://example.supabase.co/storage/v1/object/public/ticket-photos/" + path
	return path, url, nil
}

type mockTelegram struct {
	sentCount int
	lastCode  string
}

func (m *mockTelegram) NotifyNewTicketAsync(payload telegram.NewTicketPayload) {
	m.sentCount++
	m.lastCode = payload.TicketCode
}

func (m *mockTelegram) SendNewTicket(ctx context.Context, payload telegram.NewTicketPayload) error {
	m.sentCount++
	m.lastCode = payload.TicketCode
	return nil
}

func setupTestRouter() (http.Handler, *mockTelegram, string) {
	jwtSecret := "test-jwt-secret-key-at-least-32-chars"
	cfg := &config.Config{
		Port:                   "8080",
		AppEnv:                 "test",
		JWTSecret:              jwtSecret,
		JWTExpiryHours:         24,
		CORSAllowedOrigins:     []string{"http://localhost:5173"},
		RateLimitMaxRequests:   5,
		RateLimitWindowMinutes: 15,
		MaxPhotoSizeBytes:      512 * 1024,
	}
	tg := &mockTelegram{}
	router := NewRouter(RouterDependencies{
		Config:           cfg,
		MasterRepo:       newMockMasterRepo(),
		TicketRepo:       newMockTicketRepo(),
		ReportRepo:       &mockReportRepo{},
		PhotoStorage:     &mockStorage{},
		TelegramNotifier: tg,
	})
	return router, tg, jwtSecret
}

func makeTestWebP() []byte {
	buf := make([]byte, 64)
	copy(buf[0:4], []byte("RIFF"))
	copy(buf[8:12], []byte("WEBP"))
	copy(buf[12:16], []byte("VP8 "))
	return buf
}

// =============================================================================
// End-to-End Handler Tests
// =============================================================================

func TestHealthAndAuthLogin(t *testing.T) {
	router, _, _ := setupTestRouter()

	// 1. GET /api/health
	reqHealth := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	recHealth := httptest.NewRecorder()
	router.ServeHTTP(recHealth, reqHealth)
	if recHealth.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/health, got %d", recHealth.Code)
	}

	// 2. POST /api/auth/login with valid credentials
	loginBody := `{"username":"tech","password":"Tech@1234"}`
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(loginBody))
	reqLogin.Header.Set("Content-Type", "application/json")
	recLogin := httptest.NewRecorder()
	router.ServeHTTP(recLogin, reqLogin)
	if recLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/auth/login, got %d: %s", recLogin.Code, recLogin.Body.String())
	}

	var loginResp struct {
		Token string     `json:"token"`
		User  model.User `json:"user"`
	}
	if err := json.Unmarshal(recLogin.Body.Bytes(), &loginResp); err != nil || loginResp.Token == "" {
		t.Fatalf("failed to decode login token: %v", err)
	}
	if loginResp.User.Role != model.RoleTechnician {
		t.Fatalf("expected role technician, got %s", loginResp.User.Role)
	}
}

func TestPublicDuplicateCheckAndPublicBoardPrivacy(t *testing.T) {
	router, _, _ := setupTestRouter()

	// 1. Duplicate check for existing open ticket (room_id=10, category_id=2)
	reqDup := httptest.NewRequest(http.MethodGet, "/api/public/tickets/check-duplicate?room_id=10&category_id=2", nil)
	recDup := httptest.NewRecorder()
	router.ServeHTTP(recDup, reqDup)
	if recDup.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recDup.Code)
	}
	var dupResp model.DuplicateCheckResponse
	_ = json.Unmarshal(recDup.Body.Bytes(), &dupResp)
	if !dupResp.HasDuplicate || dupResp.Count != 1 || dupResp.OpenTickets[0].TicketCode != "MMS-202611-001" {
		t.Fatalf("expected duplicate warning for room 10 + category 2, got %+v", dupResp)
	}

	// 2. Public Board Privacy Guarantee: MUST NOT return photo URLs
	reqBoard := httptest.NewRequest(http.MethodGet, "/api/public/board", nil)
	recBoard := httptest.NewRecorder()
	router.ServeHTTP(recBoard, reqBoard)
	if recBoard.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/public/board, got %d", recBoard.Code)
	}
	rawBoardJSON := recBoard.Body.String()
	if strings.Contains(rawBoardJSON, "secret-bucket") ||
		strings.Contains(rawBoardJSON, "public_url") ||
		strings.Contains(rawBoardJSON, "before_photos") {
		t.Fatalf("PRIVACY VIOLATION: /api/public/board leaked photo URLs: %s", rawBoardJSON)
	}
}

func TestPublicCreateTicketHoneypotAndTelegram(t *testing.T) {
	router, tg, _ := setupTestRouter()

	// 1. Honeypot spam rejection: non-empty "website" field must fail without creating ticket or calling Telegram
	var hpBuf bytes.Buffer
	hpWriter := multipart.NewWriter(&hpBuf)
	_ = hpWriter.WriteField("building_id", "1")
	_ = hpWriter.WriteField("floor_id", "1")
	_ = hpWriter.WriteField("room_id", "1")
	_ = hpWriter.WriteField("category_id", "1")
	_ = hpWriter.WriteField("reporter_type_id", "1")
	_ = hpWriter.WriteField("description", "Bot spam message")
	_ = hpWriter.WriteField("website", "http://spambot.example.com")
	_ = hpWriter.Close()

	reqHP := httptest.NewRequest(http.MethodPost, "/api/public/tickets", &hpBuf)
	reqHP.Header.Set("Content-Type", hpWriter.FormDataContentType())
	recHP := httptest.NewRecorder()
	router.ServeHTTP(recHP, reqHP)
	if recHP.Code != http.StatusBadRequest {
		t.Fatalf("expected honeypot submission to be rejected with 400, got %d", recHP.Code)
	}
	if tg.sentCount != 0 {
		t.Fatalf("Telegram must NOT be called when honeypot triggers")
	}

	// 2. Valid Guest ticket creation with 1 WebP photo -> 201 Created + Telegram triggered
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("building_id", "1")
	_ = writer.WriteField("floor_id", "1")
	_ = writer.WriteField("room_id", "1")
	_ = writer.WriteField("category_id", "1")
	_ = writer.WriteField("reporter_type_id", "1")
	_ = writer.WriteField("description", "หลอดไฟทางเดินดับ 1 ดวง")
	part, _ := writer.CreateFormFile("photos", "before1.webp")
	_, _ = part.Write(makeTestWebP())
	_ = writer.Close()

	reqCreate := httptest.NewRequest(http.MethodPost, "/api/public/tickets", &body)
	reqCreate.Header.Set("Content-Type", writer.FormDataContentType())
	recCreate := httptest.NewRecorder()
	router.ServeHTTP(recCreate, reqCreate)
	if recCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", recCreate.Code, recCreate.Body.String())
	}
	if tg.sentCount != 1 || tg.lastCode != "MMS-202611-002" {
		t.Fatalf("expected Telegram notification for MMS-202611-002, got count=%d code=%s", tg.sentCount, tg.lastCode)
	}
}

func TestTechnicianStatusTransitionGuards(t *testing.T) {
	router, _, jwtSecret := setupTestRouter()

	techToken, _, _ := middleware.GenerateJWT(model.User{
		ID: 2, Username: "tech", DisplayName: "Tech", Role: model.RoleTechnician,
	}, jwtSecret, 24)

	reporterToken, _, _ := middleware.GenerateJWT(model.User{
		ID: 3, Username: "reporter", DisplayName: "Reporter", Role: model.RoleReporter,
	}, jwtSecret, 24)

	// 1. Reporter (Read-only) must be forbidden (403) from acknowledging or mutating tickets
	reqRepAck := httptest.NewRequest(http.MethodPost, "/api/staff/tickets/1/acknowledge", nil)
	reqRepAck.Header.Set("Authorization", "Bearer "+reporterToken)
	recRepAck := httptest.NewRecorder()
	router.ServeHTTP(recRepAck, reqRepAck)
	if recRepAck.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for read-only reporter on acknowledge, got %d", recRepAck.Code)
	}

	// 2. Technician 1-click Acknowledge succeeds
	reqAck := httptest.NewRequest(http.MethodPost, "/api/staff/tickets/1/acknowledge", nil)
	reqAck.Header.Set("Authorization", "Bearer "+techToken)
	recAck := httptest.NewRecorder()
	router.ServeHTTP(recAck, reqAck)
	if recAck.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on technician acknowledge, got %d", recAck.Code)
	}

	// 3. Transition to "completed" WITHOUT after-repair photos MUST fail (400)
	badCompJSON := `{"status":"completed","note":"ซ่อมเสร็จ","technician_ids":[1]}`
	reqBadComp := httptest.NewRequest(http.MethodPatch, "/api/staff/tickets/1/status", strings.NewReader(badCompJSON))
	reqBadComp.Header.Set("Authorization", "Bearer "+techToken)
	reqBadComp.Header.Set("Content-Type", "application/json")
	recBadComp := httptest.NewRecorder()
	router.ServeHTTP(recBadComp, reqBadComp)
	if recBadComp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request when closing completed without after photos, got %d", recBadComp.Code)
	}

	// 4. Transition to "unrepairable" WITHOUT reason note MUST fail (400)
	badUnrepJSON := `{"status":"unrepairable","note":"","technician_ids":[1]}`
	reqBadUnrep := httptest.NewRequest(http.MethodPatch, "/api/staff/tickets/1/status", strings.NewReader(badUnrepJSON))
	reqBadUnrep.Header.Set("Authorization", "Bearer "+techToken)
	reqBadUnrep.Header.Set("Content-Type", "application/json")
	recBadUnrep := httptest.NewRecorder()
	router.ServeHTTP(recBadUnrep, reqBadUnrep)
	if recBadUnrep.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request when setting unrepairable without reason note, got %d", recBadUnrep.Code)
	}

	// 5. Transition to "completed" WITH 1 after photo + technician_ids=[1] + note MUST succeed (200)
	var compBuf bytes.Buffer
	compWriter := multipart.NewWriter(&compBuf)
	_ = compWriter.WriteField("status", "completed")
	_ = compWriter.WriteField("note", "เปลี่ยนอะไหล่และทดสอบแอร์เย็นปกติเรียบร้อย")
	_ = compWriter.WriteField("technician_ids", "1")
	afterPart, _ := compWriter.CreateFormFile("after_photos", "after1.webp")
	_, _ = afterPart.Write(makeTestWebP())
	_ = compWriter.Close()

	reqGoodComp := httptest.NewRequest(http.MethodPatch, "/api/staff/tickets/1/status", &compBuf)
	reqGoodComp.Header.Set("Authorization", "Bearer "+techToken)
	reqGoodComp.Header.Set("Content-Type", compWriter.FormDataContentType())
	recGoodComp := httptest.NewRecorder()
	router.ServeHTTP(recGoodComp, reqGoodComp)
	if recGoodComp.Code != http.StatusOK {
		t.Fatalf("expected 200 OK when closing completed with photo + technician + note, got %d: %s",
			recGoodComp.Code, recGoodComp.Body.String())
	}
}
