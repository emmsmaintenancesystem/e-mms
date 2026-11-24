package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/emms/backend/internal/model"
)

func TestJWTAndRoleGuards(t *testing.T) {
	secret := "super-secret-jwt-test-key-32-chars-minimum"
	techUser := model.User{
		ID:          2,
		Username:    "tech",
		DisplayName: "ทีมช่างซ่อมบำรุง",
		Role:        model.RoleTechnician,
		IsActive:    true,
	}

	token, _, err := GenerateJWT(techUser, secret, 24)
	if err != nil {
		t.Fatalf("GenerateJWT failed: %v", err)
	}

	claims, err := VerifyJWT(token, secret)
	if err != nil {
		t.Fatalf("VerifyJWT failed: %v", err)
	}
	if claims.Username != "tech" || claims.Role != model.RoleTechnician {
		t.Fatalf("unexpected claims: %+v", claims)
	}

	// Test RequireAuth + RequireRoles allowing technician
	protectedTech := RequireAuth(secret)(RequireRoles(model.RoleTechnician, model.RoleAdmin)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	))

	req := httptest.NewRequest(http.MethodGet, "/api/staff/tickets", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	protectedTech.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for technician, got %d", rec.Code)
	}

	// Test RequireRoles blocking technician from admin-only route
	protectedAdmin := RequireAuth(secret)(RequireRoles(model.RoleAdmin)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	))

	reqAdmin := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	reqAdmin.Header.Set("Authorization", "Bearer "+token)
	recAdmin := httptest.NewRecorder()
	protectedAdmin.ServeHTTP(recAdmin, reqAdmin)
	if recAdmin.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for technician on admin endpoint, got %d", recAdmin.Code)
	}
}

func TestIPRateLimiter(t *testing.T) {
	limiter := NewIPRateLimiter(5, 15*time.Minute)
	handler := limiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))

	// First 5 requests from same X-Forwarded-For IP must succeed
	for i := 1; i <= 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/public/tickets", nil)
		req.Header.Set("X-Forwarded-For", "203.0.113.50, 10.0.0.1")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("request #%d should be allowed (201), got %d", i, rec.Code)
		}
	}

	// 6th request within 15 minutes must be rate-limited (429)
	req6 := httptest.NewRequest(http.MethodPost, "/api/public/tickets", nil)
	req6.Header.Set("X-Forwarded-For", "203.0.113.50, 10.0.0.1")
	rec6 := httptest.NewRecorder()
	handler.ServeHTTP(rec6, req6)
	if rec6.Code != http.StatusTooManyRequests {
		t.Fatalf("6th request should return 429 Too Many Requests, got %d", rec6.Code)
	}
	if rec6.Header().Get("Retry-After") == "" {
		t.Fatalf("expected Retry-After header on 429 response")
	}

	// Different IP should still be allowed
	reqOther := httptest.NewRequest(http.MethodPost, "/api/public/tickets", nil)
	reqOther.Header.Set("X-Forwarded-For", "198.51.100.99")
	recOther := httptest.NewRecorder()
	handler.ServeHTTP(recOther, reqOther)
	if recOther.Code != http.StatusCreated {
		t.Fatalf("different IP should be allowed, got %d", recOther.Code)
	}
}

func TestCORSMiddleware(t *testing.T) {
	corsMw := CORS([]string{"http://localhost:5173", "https://example.github.io"})
	h := corsMw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Allowed origin preflight
	req := httptest.NewRequest(http.MethodOptions, "/api/public/master-data", nil)
	req.Header.Set("Origin", "https://example.github.io")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content for OPTIONS, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://example.github.io" {
		t.Fatalf("expected Access-Control-Allow-Origin to match allowed origin, got %q", got)
	}

	// Disallowed origin
	reqBad := httptest.NewRequest(http.MethodGet, "/api/public/master-data", nil)
	reqBad.Header.Set("Origin", "https://evil.example.com")
	recBad := httptest.NewRecorder()
	h.ServeHTTP(recBad, reqBad)
	if got := recBad.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected empty Access-Control-Allow-Origin for disallowed origin, got %q", got)
	}
}
