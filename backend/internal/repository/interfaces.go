package repository

import (
	"context"
	"errors"

	"github.com/emms/backend/internal/model"
)

var (
	ErrNotFound      = errors.New("record not found")
	ErrDuplicate     = errors.New("duplicate record conflict")
	ErrInvalidInput  = errors.New("invalid input or constraint violation")
)

// HealthChecker checks database connectivity for GET /api/health.
type HealthChecker interface {
	Ping(ctx context.Context) error
}

// MasterRepository defines operations for master data and staff user accounts.
type MasterRepository interface {
	HealthChecker

	// Public Master Data (only is_active = true)
	GetPublicMasterData(ctx context.Context) (*model.PublicMasterDataResponse, error)
	ListActiveTechnicians(ctx context.Context) ([]model.Technician, error)

	// Authentication
	GetUserByUsername(ctx context.Context, username string) (*model.User, error)
	GetUserByID(ctx context.Context, id int) (*model.User, error)
	UpdateUserLastLogin(ctx context.Context, userID int) error

	// Admin CRUD: Buildings
	ListBuildings(ctx context.Context) ([]model.Building, error)
	CreateBuilding(ctx context.Context, b *model.Building) (*model.Building, error)
	UpdateBuilding(ctx context.Context, b *model.Building) (*model.Building, error)

	// Admin CRUD: Floors
	ListFloors(ctx context.Context, buildingID int) ([]model.Floor, error)
	CreateFloor(ctx context.Context, f *model.Floor) (*model.Floor, error)
	UpdateFloor(ctx context.Context, f *model.Floor) (*model.Floor, error)

	// Admin CRUD: Rooms
	ListRooms(ctx context.Context, floorID int, buildingID int) ([]model.Room, error)
	CreateRoom(ctx context.Context, r *model.Room) (*model.Room, error)
	UpdateRoom(ctx context.Context, r *model.Room) (*model.Room, error)

	// Admin CRUD: Categories
	ListCategories(ctx context.Context) ([]model.Category, error)
	CreateCategory(ctx context.Context, c *model.Category) (*model.Category, error)
	UpdateCategory(ctx context.Context, c *model.Category) (*model.Category, error)

	// Admin CRUD: Subcategories
	ListSubcategories(ctx context.Context, categoryID int) ([]model.Subcategory, error)
	CreateSubcategory(ctx context.Context, sc *model.Subcategory) (*model.Subcategory, error)
	UpdateSubcategory(ctx context.Context, sc *model.Subcategory) (*model.Subcategory, error)

	// Admin CRUD: Reporter Types
	ListReporterTypes(ctx context.Context) ([]model.ReporterType, error)
	CreateReporterType(ctx context.Context, rt *model.ReporterType) (*model.ReporterType, error)
	UpdateReporterType(ctx context.Context, rt *model.ReporterType) (*model.ReporterType, error)

	// Admin CRUD: Technicians
	ListTechnicians(ctx context.Context) ([]model.Technician, error)
	CreateTechnician(ctx context.Context, t *model.Technician) (*model.Technician, error)
	UpdateTechnician(ctx context.Context, t *model.Technician) (*model.Technician, error)

	// Admin CRUD: Users
	ListUsers(ctx context.Context) ([]model.User, error)
	CreateUser(ctx context.Context, u *model.User, passwordHash string) (*model.User, error)
	UpdateUser(ctx context.Context, u *model.User) (*model.User, error)
	ResetUserPassword(ctx context.Context, userID int, newPasswordHash string) error
}

// TicketRepository defines operations for tickets, duplicate check, public board, and status transitions.
type TicketRepository interface {
	CheckDuplicate(ctx context.Context, roomID int, categoryID int, subcategoryID int) ([]model.DuplicateTicketSummary, error)
	CreateTicket(ctx context.Context, input model.CreateTicketInput) (*model.Ticket, error)
	GetByCode(ctx context.Context, ticketCode string) (*model.Ticket, error)
	GetByID(ctx context.Context, id int) (*model.Ticket, error)
	ListPublicBoard(ctx context.Context, limit int, status string, buildingID int) (*model.PublicBoardResponse, error)
	ListStaffTickets(ctx context.Context, filter model.TicketFilter) (*model.PaginatedTicketsResponse, error)
	AcknowledgeTicket(ctx context.Context, ticketID int, userID int, note *string) (*model.Ticket, error)
	UpdateTicketStatus(ctx context.Context, input model.UpdateStatusInput) (*model.Ticket, error)
}

// ReportRepository defines operations for executive statistical reports and Excel/CSV exports.
type ReportRepository interface {
	GetReportSummary(ctx context.Context, filter model.ReportFilter) (*model.ReportSummaryResponse, error)
	ListTicketsForExport(ctx context.Context, filter model.ReportFilter) ([]model.ExportTicketRow, error)
}
