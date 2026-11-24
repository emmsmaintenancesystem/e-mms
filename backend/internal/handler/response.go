package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/emms/backend/internal/repository"
)

// WriteJSON serializes data as UTF-8 JSON with the given HTTP status code.
func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// WriteError sends a standardized JSON error response.
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{
		"error": message,
	})
}

// DecodeJSON decodes a JSON request body with strict size limits.
func DecodeJSON(r *http.Request, dst interface{}) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)) // 1 MB max JSON payload
	return dec.Decode(dst)
}

// HandleRepoError maps repository errors to appropriate HTTP status codes and Thai messages.
func HandleRepoError(w http.ResponseWriter, err error, notFoundMsg string) {
	if errors.Is(err, repository.ErrNotFound) {
		if notFoundMsg == "" {
			notFoundMsg = "ไม่พบข้อมูลที่ต้องการ"
		}
		WriteError(w, http.StatusNotFound, notFoundMsg)
		return
	}
	if errors.Is(err, repository.ErrDuplicate) {
		WriteError(w, http.StatusConflict, "ข้อมูลซ้ำกับที่มีอยู่ในระบบแล้ว กรุณาตรวจสอบรหัสหรือชื่ออีกครั้ง")
		return
	}
	if errors.Is(err, repository.ErrInvalidInput) {
		WriteError(w, http.StatusBadRequest, "ข้อมูลไม่ถูกต้องหรือมีความสัมพันธ์ของข้อมูลไม่สอดคล้องกัน")
		return
	}
	WriteError(w, http.StatusInternalServerError, "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง")
}

func parseIntQuery(r *http.Request, key string, fallback int) int {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return v
}

func strPtrOrNil(s string) *string {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
