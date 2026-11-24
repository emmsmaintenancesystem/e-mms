package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/emms/backend/internal/model"
	"github.com/emms/backend/internal/repository"
	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

// AdminHandler serves Master Data and Staff User management endpoints (restricted to role = 'admin').
type AdminHandler struct {
	masterRepo repository.MasterRepository
}

func NewAdminHandler(masterRepo repository.MasterRepository) *AdminHandler {
	return &AdminHandler{masterRepo: masterRepo}
}

// =============================================================================
// 1. Buildings (อาคาร)
// =============================================================================

type buildingPayload struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
	IsActive  *bool  `json:"is_active"`
}

func (h *AdminHandler) ListBuildings(w http.ResponseWriter, r *http.Request) {
	items, err := h.masterRepo.ListBuildings(r.Context())
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *AdminHandler) CreateBuilding(w http.ResponseWriter, r *http.Request) {
	var req buildingPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่ออาคาร")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	created, err := h.masterRepo.CreateBuilding(r.Context(), &model.Building{
		Code:      strPtrOrNil(req.Code),
		Name:      name,
		SortOrder: req.SortOrder,
		IsActive:  isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) UpdateBuilding(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || id <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสอาคารไม่ถูกต้อง")
		return
	}
	var req buildingPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่ออาคาร")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	updated, err := h.masterRepo.UpdateBuilding(r.Context(), &model.Building{
		ID:        id,
		Code:      strPtrOrNil(req.Code),
		Name:      name,
		SortOrder: req.SortOrder,
		IsActive:  isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "ไม่พบข้อมูลอาคารที่ต้องการแก้ไข")
		return
	}
	WriteJSON(w, http.StatusOK, updated)
}

// =============================================================================
// 2. Floors (ชั้น)
// =============================================================================

type floorPayload struct {
	BuildingID int    `json:"building_id"`
	Name       string `json:"name"`
	SortOrder  int    `json:"sort_order"`
	IsActive   *bool  `json:"is_active"`
}

func (h *AdminHandler) ListFloors(w http.ResponseWriter, r *http.Request) {
	buildingID := parseIntQuery(r, "building_id", 0)
	items, err := h.masterRepo.ListFloors(r.Context(), buildingID)
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *AdminHandler) CreateFloor(w http.ResponseWriter, r *http.Request) {
	var req floorPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if req.BuildingID <= 0 || name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาเลือกอาคารและระบุชื่อชั้น")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	created, err := h.masterRepo.CreateFloor(r.Context(), &model.Floor{
		BuildingID: req.BuildingID,
		Name:       name,
		SortOrder:  req.SortOrder,
		IsActive:   isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) UpdateFloor(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || id <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสชั้นไม่ถูกต้อง")
		return
	}
	var req floorPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if req.BuildingID <= 0 || name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาเลือกอาคารและระบุชื่อชั้น")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	updated, err := h.masterRepo.UpdateFloor(r.Context(), &model.Floor{
		ID:         id,
		BuildingID: req.BuildingID,
		Name:       name,
		SortOrder:  req.SortOrder,
		IsActive:   isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "ไม่พบข้อมูลชั้นที่ต้องการแก้ไข")
		return
	}
	WriteJSON(w, http.StatusOK, updated)
}

// =============================================================================
// 3. Rooms (ห้อง / บริเวณ)
// =============================================================================

type roomPayload struct {
	FloorID   int    `json:"floor_id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
	IsActive  *bool  `json:"is_active"`
}

func (h *AdminHandler) ListRooms(w http.ResponseWriter, r *http.Request) {
	floorID := parseIntQuery(r, "floor_id", 0)
	buildingID := parseIntQuery(r, "building_id", 0)
	items, err := h.masterRepo.ListRooms(r.Context(), floorID, buildingID)
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *AdminHandler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	var req roomPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if req.FloorID <= 0 || name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาเลือกชั้นและระบุชื่อห้องหรือบริเวณ")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	created, err := h.masterRepo.CreateRoom(r.Context(), &model.Room{
		FloorID:   req.FloorID,
		Code:      strPtrOrNil(req.Code),
		Name:      name,
		SortOrder: req.SortOrder,
		IsActive:  isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) UpdateRoom(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || id <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสห้องไม่ถูกต้อง")
		return
	}
	var req roomPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if req.FloorID <= 0 || name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาเลือกชั้นและระบุชื่อห้องหรือบริเวณ")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	updated, err := h.masterRepo.UpdateRoom(r.Context(), &model.Room{
		ID:        id,
		FloorID:   req.FloorID,
		Code:      strPtrOrNil(req.Code),
		Name:      name,
		SortOrder: req.SortOrder,
		IsActive:  isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "ไม่พบข้อมูลห้องที่ต้องการแก้ไข")
		return
	}
	WriteJSON(w, http.StatusOK, updated)
}

// =============================================================================
// 4. Categories (หมวดหมู่งานซ่อม)
// =============================================================================

type categoryPayload struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	SortOrder   int    `json:"sort_order"`
	IsActive    *bool  `json:"is_active"`
}

func (h *AdminHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	items, err := h.masterRepo.ListCategories(r.Context())
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *AdminHandler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var req categoryPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่อหมวดหมู่งานซ่อม")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	created, err := h.masterRepo.CreateCategory(r.Context(), &model.Category{
		Code:        strPtrOrNil(req.Code),
		Name:        name,
		Description: strPtrOrNil(req.Description),
		SortOrder:   req.SortOrder,
		IsActive:    isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || id <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสหมวดหมู่ไม่ถูกต้อง")
		return
	}
	var req categoryPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่อหมวดหมู่งานซ่อม")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	updated, err := h.masterRepo.UpdateCategory(r.Context(), &model.Category{
		ID:          id,
		Code:        strPtrOrNil(req.Code),
		Name:        name,
		Description: strPtrOrNil(req.Description),
		SortOrder:   req.SortOrder,
		IsActive:    isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "ไม่พบหมวดหมู่ที่ต้องการแก้ไข")
		return
	}
	WriteJSON(w, http.StatusOK, updated)
}

// =============================================================================
// 5. Reporter Types (ประเภทผู้แจ้งซ่อม — Zero PII)
// =============================================================================

type reporterTypePayload struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
	IsActive  *bool  `json:"is_active"`
}

func (h *AdminHandler) ListReporterTypes(w http.ResponseWriter, r *http.Request) {
	items, err := h.masterRepo.ListReporterTypes(r.Context())
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *AdminHandler) CreateReporterType(w http.ResponseWriter, r *http.Request) {
	var req reporterTypePayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่อประเภทผู้แจ้งซ่อม")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	created, err := h.masterRepo.CreateReporterType(r.Context(), &model.ReporterType{
		Code:      strPtrOrNil(req.Code),
		Name:      name,
		SortOrder: req.SortOrder,
		IsActive:  isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) UpdateReporterType(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || id <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสประเภทผู้แจ้งไม่ถูกต้อง")
		return
	}
	var req reporterTypePayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่อประเภทผู้แจ้งซ่อม")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	updated, err := h.masterRepo.UpdateReporterType(r.Context(), &model.ReporterType{
		ID:        id,
		Code:      strPtrOrNil(req.Code),
		Name:      name,
		SortOrder: req.SortOrder,
		IsActive:  isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "ไม่พบประเภทผู้แจ้งที่ต้องการแก้ไข")
		return
	}
	WriteJSON(w, http.StatusOK, updated)
}

// =============================================================================
// 6. Technicians (รายชื่อช่างปฏิบัติงาน — Master Data แยกจากบัญชีล็อกอิน)
// =============================================================================

type technicianPayload struct {
	FullName  string `json:"full_name"`
	Nickname  string `json:"nickname"`
	Specialty string `json:"specialty"`
	Phone     string `json:"phone"`
	SortOrder int    `json:"sort_order"`
	IsActive  *bool  `json:"is_active"`
}

func (h *AdminHandler) ListTechnicians(w http.ResponseWriter, r *http.Request) {
	items, err := h.masterRepo.ListTechnicians(r.Context())
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *AdminHandler) CreateTechnician(w http.ResponseWriter, r *http.Request) {
	var req technicianPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	fullName := strings.TrimSpace(req.FullName)
	if fullName == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่อ-นามสกุลช่างปฏิบัติงาน")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	created, err := h.masterRepo.CreateTechnician(r.Context(), &model.Technician{
		FullName:  fullName,
		Nickname:  strPtrOrNil(req.Nickname),
		Specialty: strPtrOrNil(req.Specialty),
		Phone:     strPtrOrNil(req.Phone),
		SortOrder: req.SortOrder,
		IsActive:  isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) UpdateTechnician(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || id <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสช่างไม่ถูกต้อง")
		return
	}
	var req technicianPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	fullName := strings.TrimSpace(req.FullName)
	if fullName == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่อ-นามสกุลช่างปฏิบัติงาน")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	updated, err := h.masterRepo.UpdateTechnician(r.Context(), &model.Technician{
		ID:        id,
		FullName:  fullName,
		Nickname:  strPtrOrNil(req.Nickname),
		Specialty: strPtrOrNil(req.Specialty),
		Phone:     strPtrOrNil(req.Phone),
		SortOrder: req.SortOrder,
		IsActive:  isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "ไม่พบรายชื่อช่างที่ต้องการแก้ไข")
		return
	}
	WriteJSON(w, http.StatusOK, updated)
}

// =============================================================================
// 7. Staff Users & Password Reset (บัญชีล็อกอินหลังบ้าน: technician, reporter, admin)
// =============================================================================

type createUserPayload struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	IsActive    *bool  `json:"is_active"`
}

type updateUserPayload struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	IsActive    *bool  `json:"is_active"`
}

type resetPasswordPayload struct {
	NewPassword string `json:"new_password"`
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	items, err := h.masterRepo.ListUsers(r.Context())
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *AdminHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	username := strings.TrimSpace(req.Username)
	displayName := strings.TrimSpace(req.DisplayName)
	role := strings.TrimSpace(req.Role)

	if username == "" || displayName == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่อผู้ใช้ (Username) และชื่อที่แสดง (Display Name)")
		return
	}
	if len(req.Password) < 6 {
		WriteError(w, http.StatusBadRequest, "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร")
		return
	}
	if !model.IsValidRole(role) {
		WriteError(w, http.StatusBadRequest, "บทบาทผู้ใช้งานไม่ถูกต้อง (อนุญาตเฉพาะ technician, reporter หรือ admin)")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	hashBytes, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "ไม่สามารถเข้ารหัสรหัสผ่านได้")
		return
	}

	created, err := h.masterRepo.CreateUser(r.Context(), &model.User{
		Username:    username,
		DisplayName: displayName,
		Role:        role,
		IsActive:    isActive,
	}, string(hashBytes))
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}
	WriteJSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || id <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสผู้ใช้งานไม่ถูกต้อง")
		return
	}
	var req updateUserPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	username := strings.TrimSpace(req.Username)
	displayName := strings.TrimSpace(req.DisplayName)
	role := strings.TrimSpace(req.Role)

	if username == "" || displayName == "" {
		WriteError(w, http.StatusBadRequest, "กรุณาระบุชื่อผู้ใช้ (Username) และชื่อที่แสดง (Display Name)")
		return
	}
	if !model.IsValidRole(role) {
		WriteError(w, http.StatusBadRequest, "บทบาทผู้ใช้งานไม่ถูกต้อง (อนุญาตเฉพาะ technician, reporter หรือ admin)")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	updated, err := h.masterRepo.UpdateUser(r.Context(), &model.User{
		ID:          id,
		Username:    username,
		DisplayName: displayName,
		Role:        role,
		IsActive:    isActive,
	})
	if err != nil {
		HandleRepoError(w, err, "ไม่พบบัญชีผู้ใช้งานที่ต้องการแก้ไข")
		return
	}
	WriteJSON(w, http.StatusOK, updated)
}

func (h *AdminHandler) ResetUserPassword(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil || id <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสผู้ใช้งานไม่ถูกต้อง")
		return
	}
	var req resetPasswordPayload
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	if len(req.NewPassword) < 6 {
		WriteError(w, http.StatusBadRequest, "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร")
		return
	}

	hashBytes, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 10)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "ไม่สามารถเข้ารหัสรหัสผ่านใหม่ได้")
		return
	}

	if err := h.masterRepo.ResetUserPassword(r.Context(), id, string(hashBytes)); err != nil {
		HandleRepoError(w, err, "ไม่พบบัญชีผู้ใช้งานที่ต้องการรีเซ็ตรหัสผ่าน")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{
		"message": "รีเซ็ตรหัสผ่านเรียบร้อยแล้ว",
	})
}
