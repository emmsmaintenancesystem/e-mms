package handler

import (
	"net/http"
	"time"

	"github.com/emms/backend/internal/config"
	"github.com/emms/backend/internal/middleware"
	"github.com/emms/backend/internal/model"
	"github.com/emms/backend/internal/repository"
	"github.com/emms/backend/internal/storage"
	"github.com/emms/backend/internal/telegram"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
)

// RouterDependencies bundles all repositories and external services required by the HTTP router.
type RouterDependencies struct {
	Config           *config.Config
	MasterRepo       repository.MasterRepository
	TicketRepo       repository.TicketRepository
	ReportRepo       repository.ReportRepository
	PhotoStorage     storage.PhotoStorage
	TelegramNotifier telegram.Notifier
}

// NewRouter constructs the chi HTTP router with CORS, IP Rate Limiter, JWT Auth, and Role Guards.
func NewRouter(deps RouterDependencies) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.Recoverer)
	r.Use(middleware.CORS(deps.Config.CORSAllowedOrigins))

	healthHandler := NewHealthHandler(deps.MasterRepo)
	authHandler := NewAuthHandler(deps.MasterRepo, deps.Config.JWTSecret, deps.Config.JWTExpiryHours)
	publicHandler := NewPublicHandler(
		deps.MasterRepo,
		deps.TicketRepo,
		deps.PhotoStorage,
		deps.TelegramNotifier,
		deps.Config.MaxPhotoSizeBytes,
	)
	ticketHandler := NewTicketHandler(
		deps.MasterRepo,
		deps.TicketRepo,
		deps.PhotoStorage,
		deps.Config.MaxPhotoSizeBytes,
	)
	reportHandler := NewReportHandler(deps.ReportRepo)
	adminHandler := NewAdminHandler(deps.MasterRepo)

	rateLimiter := middleware.NewIPRateLimiter(
		deps.Config.RateLimitMaxRequests,
		time.Duration(deps.Config.RateLimitWindowMinutes)*time.Minute,
	)

	r.Route("/api", func(api chi.Router) {
		// 1. Keep-Alive & Health Probe
		api.Get("/health", healthHandler.ServeHTTP)

		// 2. Staff Authentication
		api.Post("/auth/login", authHandler.Login)
		api.With(middleware.RequireAuth(deps.Config.JWTSecret)).Get("/auth/me", authHandler.Me)

		// 3. Public Guest Endpoints (Zero PII, No Login Required)
		api.Route("/public", func(pub chi.Router) {
			pub.Get("/master-data", publicHandler.GetMasterData)
			pub.Get("/tickets/check-duplicate", publicHandler.CheckDuplicate)
			pub.With(rateLimiter.Middleware).Post("/tickets", publicHandler.CreateTicket)
			pub.Get("/tickets/{code}", publicHandler.TrackTicketByCode)
			pub.Get("/board", publicHandler.GetPublicBoard)
		})

		// 4. Staff Ticket Queue & Technician Operations
		api.Route("/staff", func(staff chi.Router) {
			staff.Use(middleware.RequireAuth(deps.Config.JWTSecret))

			// Read access for Technician, Reporter (Read-only), and Admin
			staff.Group(func(readGroup chi.Router) {
				readGroup.Use(middleware.RequireRoles(model.RoleTechnician, model.RoleReporter, model.RoleAdmin))
				readGroup.Get("/tickets", ticketHandler.ListTickets)
				readGroup.Get("/tickets/{idOrCode}", ticketHandler.GetTicket)
				readGroup.Get("/technicians", ticketHandler.ListActiveTechnicians)
			})

			// Write access (Acknowledge & Update Status) strictly for Technician and Admin
			staff.Group(func(writeGroup chi.Router) {
				writeGroup.Use(middleware.RequireRoles(model.RoleTechnician, model.RoleAdmin))
				writeGroup.Post("/tickets/{id}/acknowledge", ticketHandler.AcknowledgeTicket)
				writeGroup.Patch("/tickets/{id}/status", ticketHandler.UpdateStatus)
				writeGroup.Post("/tickets/{id}/status", ticketHandler.UpdateStatus)
			})
		})

		// 5. Statistical Reports & Excel/CSV Export (Reporter & Admin)
		api.Route("/reports", func(rep chi.Router) {
			rep.Use(middleware.RequireAuth(deps.Config.JWTSecret))
			rep.Use(middleware.RequireRoles(model.RoleReporter, model.RoleAdmin))

			rep.Get("/summary", reportHandler.GetSummary)
			rep.Get("/export/csv", reportHandler.ExportCSV)
			rep.Get("/export/xlsx", reportHandler.ExportXLSX)
		})

		// 6. Admin Master Data & User Management (Admin ONLY)
		api.Route("/admin", func(adm chi.Router) {
			adm.Use(middleware.RequireAuth(deps.Config.JWTSecret))
			adm.Use(middleware.RequireRoles(model.RoleAdmin))

			adm.Get("/buildings", adminHandler.ListBuildings)
			adm.Post("/buildings", adminHandler.CreateBuilding)
			adm.Put("/buildings/{id}", adminHandler.UpdateBuilding)

			adm.Get("/floors", adminHandler.ListFloors)
			adm.Post("/floors", adminHandler.CreateFloor)
			adm.Put("/floors/{id}", adminHandler.UpdateFloor)

			adm.Get("/rooms", adminHandler.ListRooms)
			adm.Post("/rooms", adminHandler.CreateRoom)
			adm.Put("/rooms/{id}", adminHandler.UpdateRoom)

			adm.Get("/categories", adminHandler.ListCategories)
			adm.Post("/categories", adminHandler.CreateCategory)
			adm.Put("/categories/{id}", adminHandler.UpdateCategory)

			adm.Get("/reporter-types", adminHandler.ListReporterTypes)
			adm.Post("/reporter-types", adminHandler.CreateReporterType)
			adm.Put("/reporter-types/{id}", adminHandler.UpdateReporterType)

			adm.Get("/technicians", adminHandler.ListTechnicians)
			adm.Post("/technicians", adminHandler.CreateTechnician)
			adm.Put("/technicians/{id}", adminHandler.UpdateTechnician)

			adm.Get("/users", adminHandler.ListUsers)
			adm.Post("/users", adminHandler.CreateUser)
			adm.Put("/users/{id}", adminHandler.UpdateUser)
			adm.Post("/users/{id}/reset-password", adminHandler.ResetUserPassword)
			adm.Put("/users/{id}/reset-password", adminHandler.ResetUserPassword)
		})
	})

	return r
}
