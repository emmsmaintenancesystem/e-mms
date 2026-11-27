package model

import (
	"strings"
	"time"
)

// =============================================================================
// 1. Constants & Business Enums (ADR-002, ADR-004, ADR-006)
// =============================================================================

const (
	StatusPending      = "pending"
	StatusInProgress   = "in_progress"
	StatusWaitingParts = "waiting_parts"
	StatusCompleted    = "completed"
	StatusUnrepairable = "unrepairable"
	StatusCancelled    = "cancelled"
)

const (
	RoleTechnician = "technician"
	RoleReporter   = "reporter"
	RoleAdmin      = "admin"
)

const (
	PhotoTypeBefore = "before"
	PhotoTypeAfter  = "after"
)

// AllStatuses defines the canonical order of the 6 ticket statuses.
var AllStatuses = []string{
	StatusPending,
	StatusInProgress,
	StatusWaitingParts,
	StatusCompleted,
	StatusUnrepairable,
	StatusCancelled,
}

// IsValidTicketStatus checks whether s is one of the 6 allowed ticket statuses.
func IsValidTicketStatus(s string) bool {
	switch s {
	case StatusPending, StatusInProgress, StatusWaitingParts, StatusCompleted, StatusUnrepairable, StatusCancelled:
		return true
	default:
		return false
	}
}

// IsOpenStatus returns true if the ticket is still considered open/active backlog.
func IsOpenStatus(s string) bool {
	switch s {
	case StatusPending, StatusInProgress, StatusWaitingParts:
		return true
	default:
		return false
	}
}

// ThaiStatusLabel returns the official Thai label for each of the 6 statuses.
func ThaiStatusLabel(s string) string {
	switch s {
	case StatusPending:
		return "แจ้งซ่อมใหม่ (รอดำเนินการ)"
	case StatusInProgress:
		return "รับทราบงาน / กำลังซ่อม"
	case StatusWaitingParts:
		return "รออะไหล่ / ส่งซ่อมภายนอก"
	case StatusCompleted:
		return "ซ่อมเสร็จสิ้น"
	case StatusUnrepairable:
		return "ไม่สามารถซ่อมได้"
	case StatusCancelled:
		return "ยกเลิกรายการ"
	default:
		return s
	}
}

// IsValidRole checks whether r is one of the 3 allowed backend roles.
func IsValidRole(r string) bool {
	switch r {
	case RoleTechnician, RoleReporter, RoleAdmin:
		return true
	default:
		return false
	}
}

// NormalizeTicketCode normalizes a ticket code (e.g., "mms-202611-001") to uppercase.
func NormalizeTicketCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

// =============================================================================
// 2. Master Data Entities
// =============================================================================

type Building struct {
	ID        int       `json:"id"`
	Code      *string   `json:"code"`
	Name      string    `json:"name"`
	SortOrder int       `json:"sort_order"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Floor struct {
	ID           int       `json:"id"`
	BuildingID   int       `json:"building_id"`
	BuildingName string    `json:"building_name,omitempty"`
	Name         string    `json:"name"`
	SortOrder    int       `json:"sort_order"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Room struct {
	ID           int       `json:"id"`
	FloorID      int       `json:"floor_id"`
	FloorName    string    `json:"floor_name,omitempty"`
	BuildingID   int       `json:"building_id,omitempty"`
	BuildingName string    `json:"building_name,omitempty"`
	Code         *string   `json:"code"`
	Name         string    `json:"name"`
	SortOrder    int       `json:"sort_order"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Category struct {
	ID          int       `json:"id"`
	Code        *string   `json:"code"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	SortOrder   int       `json:"sort_order"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Subcategory struct {
	ID           int       `json:"id"`
	CategoryID   int       `json:"category_id"`
	CategoryName string    `json:"category_name,omitempty"`
	Code         *string   `json:"code"`
	Name         string    `json:"name"`
	Description  *string   `json:"description"`
	SortOrder    int       `json:"sort_order"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ReporterType struct {
	ID        int       `json:"id"`
	Code      *string   `json:"code"`
	Name      string    `json:"name"`
	SortOrder int       `json:"sort_order"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Technician struct {
	ID        int       `json:"id"`
	FullName  string    `json:"full_name"`
	Nickname  *string   `json:"nickname"`
	Specialty *string   `json:"specialty"`
	Phone     *string   `json:"phone"`
	SortOrder int       `json:"sort_order"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type User struct {
	ID           int        `json:"id"`
	Username     string     `json:"username"`
	PasswordHash string     `json:"-"`
	DisplayName  string     `json:"display_name"`
	Role         string     `json:"role"`
	IsActive     bool       `json:"is_active"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// PublicMasterDataResponse groups all active master data needed by the Guest form.
type PublicMasterDataResponse struct {
	Buildings     []Building     `json:"buildings"`
	Floors        []Floor        `json:"floors"`
	Rooms         []Room         `json:"rooms"`
	Categories    []Category     `json:"categories"`
	Subcategories []Subcategory  `json:"subcategories"`
	ReporterTypes []ReporterType `json:"reporter_types"`
}

// =============================================================================
// 3. Ticket Entities & DTOs (Zero PII Guaranteed)
// =============================================================================

type TicketPhoto struct {
	ID               int       `json:"id"`
	TicketID         int       `json:"ticket_id"`
	PhotoType        string    `json:"photo_type"` // "before" or "after"
	StoragePath      string    `json:"storage_path,omitempty"`
	PublicURL        string    `json:"public_url"`
	MimeType         string    `json:"mime_type"`
	FileSizeBytes    int       `json:"file_size_bytes"`
	DisplayOrder     int       `json:"display_order"`
	UploadedByUserID *int      `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

type TicketTechnician struct {
	TicketID     int       `json:"ticket_id,omitempty"`
	TechnicianID int       `json:"technician_id"`
	FullName     string    `json:"full_name"`
	Nickname     *string   `json:"nickname,omitempty"`
	Specialty    *string   `json:"specialty,omitempty"`
	AssignedAt   time.Time `json:"assigned_at"`
}

type TicketStatusLog struct {
	ID                  int       `json:"id"`
	TicketID            int       `json:"ticket_id"`
	FromStatus          *string   `json:"from_status"`
	ToStatus            string    `json:"to_status"`
	Note                *string   `json:"note"`
	ChangedByUserID     *int      `json:"changed_by_user_id,omitempty"`
	ChangedByName       *string   `json:"changed_by_name,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
}

type Ticket struct {
	ID                   int                `json:"id"`
	TicketCode           string             `json:"ticket_code"`
	BuildingID           int                `json:"building_id"`
	BuildingName         string             `json:"building_name"`
	FloorID              int                `json:"floor_id"`
	FloorName            string             `json:"floor_name"`
	RoomID               int                `json:"room_id"`
	RoomCode             *string            `json:"room_code,omitempty"`
	RoomName             string             `json:"room_name"`
	LocationDetail       *string            `json:"location_detail"`
	CategoryID           int                `json:"category_id"`
	CategoryName         string             `json:"category_name"`
	SubcategoryID        *int               `json:"subcategory_id"`
	SubcategoryName      *string            `json:"subcategory_name,omitempty"`
	ReporterTypeID       int                `json:"reporter_type_id"`
	ReporterTypeName     string             `json:"reporter_type_name"`
	Description          string             `json:"description"`
	Status               string             `json:"status"`
	StatusLabel          string             `json:"status_label"`
	StatusNote           *string            `json:"status_note"`
	AcknowledgedByUserID *int               `json:"acknowledged_by_user_id,omitempty"`
	AcknowledgedByName   *string            `json:"acknowledged_by_name,omitempty"`
	AcknowledgedAt       *time.Time         `json:"acknowledged_at"`
	ClosedByUserID       *int               `json:"closed_by_user_id,omitempty"`
	ClosedByName         *string            `json:"closed_by_name,omitempty"`
	CompletedAt          *time.Time         `json:"completed_at"`
	CreatedAt            time.Time          `json:"created_at"`
	UpdatedAt            time.Time          `json:"updated_at"`
	BeforePhotos         []TicketPhoto      `json:"before_photos"`
	AfterPhotos          []TicketPhoto      `json:"after_photos"`
	Technicians          []TicketTechnician `json:"technicians"`
	StatusLogs           []TicketStatusLog  `json:"status_logs,omitempty"`
}

// DuplicateTicketSummary represents an existing open ticket in the same room + category/subcategory.
type DuplicateTicketSummary struct {
	TicketCode      string    `json:"ticket_code"`
	Status          string    `json:"status"`
	StatusLabel     string    `json:"status_label"`
	RoomName        string    `json:"room_name"`
	CategoryName    string    `json:"category_name"`
	SubcategoryID   *int      `json:"subcategory_id,omitempty"`
	SubcategoryName *string   `json:"subcategory_name,omitempty"`
	LocationDetail  *string   `json:"location_detail"`
	Description     string    `json:"description"`
	CreatedAt       time.Time `json:"created_at"`
}

type DuplicateCheckResponse struct {
	HasDuplicate bool                     `json:"has_duplicate"`
	Count        int                      `json:"count"`
	OpenTickets  []DuplicateTicketSummary `json:"open_tickets"`
}

// PublicBoardItem strictly excludes photo URLs and internal admin notes (ADR-005 & Golden Rule 4.3).
type PublicBoardItem struct {
	TicketCode      string    `json:"ticket_code"`
	BuildingID      int       `json:"building_id"`
	BuildingName    string    `json:"building_name"`
	FloorName       string    `json:"floor_name"`
	RoomName        string    `json:"room_name"`
	LocationDetail  *string   `json:"location_detail,omitempty"`
	CategoryID      int       `json:"category_id"`
	CategoryName    string    `json:"category_name"`
	SubcategoryID   *int      `json:"subcategory_id,omitempty"`
	SubcategoryName *string   `json:"subcategory_name,omitempty"`
	Status          string    `json:"status"`
	StatusLabel     string    `json:"status_label"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type PublicBoardResponse struct {
	Items []PublicBoardItem `json:"items"`
	Total int               `json:"total"`
}

// CreateTicketPhotoRecord holds uploaded photo metadata ready for DB insertion.
type CreateTicketPhotoRecord struct {
	PhotoType     string
	StoragePath   string
	PublicURL     string
	MimeType      string
	FileSizeBytes int
	DisplayOrder  int
}

// CreateTicketInput holds validated data for creating a new ticket.
type CreateTicketInput struct {
	BuildingID     int
	FloorID        int
	RoomID         int
	LocationDetail *string
	CategoryID     int
	SubcategoryID  *int
	ReporterTypeID int
	Description    string
	Photos         []CreateTicketPhotoRecord
}

// UpdateStatusInput holds validated data for transitioning a ticket's status.
type UpdateStatusInput struct {
	TicketID      int
	ToStatus      string
	Note          *string
	TechnicianIDs []int
	AfterPhotos   []CreateTicketPhotoRecord
	ActorUserID   int
}

// TicketFilter specifies query criteria for staff ticket listings.
type TicketFilter struct {
	Status        string
	BuildingID    int
	FloorID       int
	RoomID        int
	CategoryID    int
	SubcategoryID int
	Search        string
	Year          int
	Month         int
	Limit         int
	Offset        int
}

type PaginatedTicketsResponse struct {
	Items  []Ticket `json:"items"`
	Total  int      `json:"total"`
	Limit  int      `json:"limit"`
	Offset int      `json:"offset"`
}

// =============================================================================
// 4. Statistical Report DTOs (ADR-008: Executive Tables & Matrices)
// =============================================================================

type ReportFilter struct {
	Year       int    `json:"year"`
	Month      int    `json:"month"`       // 0 = all months in year, 1..12 = specific month
	BuildingID int    `json:"building_id"` // 0 = all buildings
	CategoryID int    `json:"category_id"` // 0 = all categories
	Status     string `json:"status"`      // "" = all statuses
}

type ReportOverview struct {
	TotalTickets      int     `json:"total_tickets"`
	OpenBacklog       int     `json:"open_backlog"` // pending + in_progress + waiting_parts
	PendingCount      int     `json:"pending_count"`
	InProgressCount   int     `json:"in_progress_count"`
	WaitingPartsCount int     `json:"waiting_parts_count"`
	CompletedCount    int     `json:"completed_count"`
	UnrepairableCount int     `json:"unrepairable_count"`
	CancelledCount    int     `json:"cancelled_count"`
	CompletionRate    float64 `json:"completion_rate"`
	AvgAckMinutes     float64 `json:"avg_ack_minutes"`
	AvgResolveHours   float64 `json:"avg_resolve_hours"`
}

type StatusStatItem struct {
	Status      string  `json:"status"`
	StatusLabel string  `json:"status_label"`
	Count       int     `json:"count"`
	Percentage  float64 `json:"percentage"`
}

type MonthlyTrendItem struct {
	Month        int    `json:"month"`
	MonthLabel   string `json:"month_label"`
	Total        int    `json:"total"`
	OpenBacklog  int    `json:"open_backlog"`
	Completed    int    `json:"completed"`
	Unrepairable int    `json:"unrepairable"`
	Cancelled    int    `json:"cancelled"`
}

type CategoryStatItem struct {
	CategoryID   int     `json:"category_id"`
	CategoryCode string  `json:"category_code"`
	CategoryName string  `json:"category_name"`
	Total        int     `json:"total"`
	OpenBacklog  int     `json:"open_backlog"`
	Completed    int     `json:"completed"`
	Unrepairable int     `json:"unrepairable"`
	Cancelled    int     `json:"cancelled"`
	Percentage   float64 `json:"percentage"`
}

type SubcategoryStatItem struct {
	SubcategoryID   int     `json:"subcategory_id"`
	CategoryID      int     `json:"category_id"`
	CategoryName    string  `json:"category_name"`
	SubcategoryCode string  `json:"subcategory_code"`
	SubcategoryName string  `json:"subcategory_name"`
	Total           int     `json:"total"`
	OpenBacklog     int     `json:"open_backlog"`
	Completed       int     `json:"completed"`
	Unrepairable    int     `json:"unrepairable"`
	Cancelled       int     `json:"cancelled"`
	Percentage      float64 `json:"percentage"`
}

type BuildingStatItem struct {
	BuildingID   int     `json:"building_id"`
	BuildingCode string  `json:"building_code"`
	BuildingName string  `json:"building_name"`
	Total        int     `json:"total"`
	OpenBacklog  int     `json:"open_backlog"`
	Completed    int     `json:"completed"`
	Unrepairable int     `json:"unrepairable"`
	Cancelled    int     `json:"cancelled"`
	Percentage   float64 `json:"percentage"`
}

type RoomHotspotItem struct {
	RoomID       int    `json:"room_id"`
	RoomCode     string `json:"room_code"`
	RoomName     string `json:"room_name"`
	FloorName    string `json:"floor_name"`
	BuildingName string `json:"building_name"`
	Total        int    `json:"total"`
	OpenBacklog  int    `json:"open_backlog"`
	Completed    int    `json:"completed"`
	TopCategory  string `json:"top_category"`
}

// ExecutiveMatrixRow represents a row in the Cross-Tab table (Category x 12 Months or Building x 12 Months).
type ExecutiveMatrixRow struct {
	BuildingID   int    `json:"building_id,omitempty"`
	BuildingName string `json:"building_name,omitempty"`
	CategoryID   int    `json:"category_id,omitempty"`
	CategoryName string `json:"category_name"`
	Months       [12]int `json:"months"` // Index 0 = Jan (ม.ค.) ... Index 11 = Dec (ธ.ค.)
	Total        int    `json:"total"`
	Completed    int    `json:"completed"`
	OpenBacklog  int    `json:"open_backlog"`
}

type TechnicianStatItem struct {
	TechnicianID    int     `json:"technician_id"`
	FullName        string  `json:"full_name"`
	Nickname        string  `json:"nickname"`
	Specialty       string  `json:"specialty"`
	TotalAssigned   int     `json:"total_assigned"`
	CompletedCount  int     `json:"completed_count"`
	Unrepairable    int     `json:"unrepairable_count"`
	AvgResolveHours float64 `json:"avg_resolve_hours"`
}

type ReportSummaryResponse struct {
	Filter              ReportFilter          `json:"filter"`
	Overview            ReportOverview        `json:"overview"`
	StatusBreakdown     []StatusStatItem      `json:"status_breakdown"`
	MonthlyTrend        []MonthlyTrendItem    `json:"monthly_trend"`
	ByCategory          []CategoryStatItem    `json:"by_category"`
	BySubcategory       []SubcategoryStatItem `json:"by_subcategory"`
	ByBuilding          []BuildingStatItem    `json:"by_building"`
	TopRooms            []RoomHotspotItem     `json:"top_rooms"`
	ExecutiveMatrix     []ExecutiveMatrixRow  `json:"executive_matrix"`
	BuildingMonthMatrix []ExecutiveMatrixRow  `json:"building_month_matrix"`
	ByTechnician        []TechnicianStatItem  `json:"by_technician"`
}

// ExportTicketRow holds flattened fields for CSV and Excel (.xlsx) export.
type ExportTicketRow struct {
	TicketCode       string
	CreatedAt        time.Time
	BuildingName     string
	FloorName        string
	RoomName         string
	LocationDetail   string
	CategoryName     string
	SubcategoryName  string
	ReporterTypeName string
	Description      string
	Status           string
	StatusLabel      string
	StatusNote       string
	TechnicianNames  string
	AcknowledgedAt   *time.Time
	CompletedAt      *time.Time
}
