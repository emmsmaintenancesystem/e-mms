package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/emms/backend/internal/repository"
)

// HealthHandler handles GET /api/health (used by Cloud Run health probes and
// the 5-day GitHub Actions Cron Keep-Alive job to prevent Supabase Free Tier pause).
type HealthHandler struct {
	checker repository.HealthChecker
}

func NewHealthHandler(checker repository.HealthChecker) *HealthHandler {
	return &HealthHandler{checker: checker}
}

func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	dbStatus := "connected"
	if h.checker != nil {
		if err := h.checker.Ping(ctx); err != nil {
			WriteJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
				"status":    "degraded",
				"service":   "e-MMS Backend API",
				"database":  "unreachable",
				"timestamp": time.Now().Format(time.RFC3339),
			})
			return
		}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"service":   "e-MMS Backend API",
		"database":  dbStatus,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}
