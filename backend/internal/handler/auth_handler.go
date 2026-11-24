package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/emms/backend/internal/middleware"
	"github.com/emms/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler manages staff authentication (Username + Password -> JWT).
type AuthHandler struct {
	masterRepo     repository.MasterRepository
	jwtSecret      string
	jwtExpiryHours int
}

func NewAuthHandler(masterRepo repository.MasterRepository, jwtSecret string, jwtExpiryHours int) *AuthHandler {
	return &AuthHandler{
		masterRepo:     masterRepo,
		jwtSecret:      jwtSecret,
		jwtExpiryHours: jwtExpiryHours,
	}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Login authenticates a staff user (technician, reporter, admin) via Username + Password.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลเข้าสู่ระบบไม่ถูกต้อง")
		return
	}

	username := strings.TrimSpace(req.Username)
	password := req.Password
	if username == "" || password == "" {
		WriteError(w, http.StatusBadRequest, "กรุณากรอกชื่อผู้ใช้ (Username) และรหัสผ่าน (Password)")
		return
	}

	user, err := h.masterRepo.GetUserByUsername(r.Context(), username)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
		return
	}

	if !user.IsActive {
		WriteError(w, http.StatusForbidden, "บัญชีผู้ใช้นี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ (Admin)")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		WriteError(w, http.StatusUnauthorized, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
		return
	}

	token, expiresAt, err := middleware.GenerateJWT(*user, h.jwtSecret, h.jwtExpiryHours)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "ไม่สามารถสร้างโทเคนเข้าสู่ระบบได้")
		return
	}

	_ = h.masterRepo.UpdateUserLastLogin(r.Context(), user.ID)
	now := time.Now()
	user.LastLoginAt = &now

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"token":      token,
		"expires_at": expiresAt.Format(time.RFC3339),
		"user":       user,
	})
}

// Me returns the profile of the currently authenticated staff user.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserClaims(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบก่อนใช้งาน")
		return
	}

	user, err := h.masterRepo.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		HandleRepoError(w, err, "ไม่พบบัญชีผู้ใช้งาน")
		return
	}
	if !user.IsActive {
		WriteError(w, http.StatusForbidden, "บัญชีผู้ใช้นี้ถูกระงับการใช้งาน")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"user": user,
	})
}
