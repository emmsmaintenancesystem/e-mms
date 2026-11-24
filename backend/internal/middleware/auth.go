package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/emms/backend/internal/model"
	"github.com/golang-jwt/jwt/v5"
)

type ctxKey string

const userClaimsContextKey ctxKey = "emms_user_claims"

// UserClaims stores the JWT payload for an authenticated staff user.
type UserClaims struct {
	UserID      int    `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	jwt.RegisteredClaims
}

// GenerateJWT creates a signed HS256 JWT token for an authenticated staff user.
func GenerateJWT(user model.User, secret string, expiryHours int) (string, time.Time, error) {
	if expiryHours <= 0 {
		expiryHours = 24
	}
	now := time.Now()
	expiresAt := now.Add(time.Duration(expiryHours) * time.Hour)

	claims := UserClaims{
		UserID:      user.ID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		Role:        user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", user.ID),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			Issuer:    "emms-backend",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, expiresAt, nil
}

// VerifyJWT parses and validates an HS256 JWT token string.
func VerifyJWT(tokenString, secret string) (*UserClaims, error) {
	claims := &UserClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	if !model.IsValidRole(claims.Role) {
		return nil, errors.New("invalid user role in token")
	}
	return claims, nil
}

// GetUserClaims extracts the authenticated user's claims from the request context.
func GetUserClaims(ctx context.Context) (*UserClaims, bool) {
	claims, ok := ctx.Value(userClaimsContextKey).(*UserClaims)
	return claims, ok && claims != nil
}

// ContextWithUserClaims injects UserClaims into a context (also useful in tests).
func ContextWithUserClaims(ctx context.Context, claims *UserClaims) context.Context {
	return context.WithValue(ctx, userClaimsContextKey, claims)
}

// RequireAuth validates the Bearer token and attaches UserClaims to the request context.
func RequireAuth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
			var tokenStr string

			if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
				tokenStr = strings.TrimSpace(authHeader[7:])
			}

			if tokenStr == "" {
				writeAuthError(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบก่อนใช้งาน (Missing Authorization Token)")
				return
			}

			claims, err := VerifyJWT(tokenStr, jwtSecret)
			if err != nil {
				writeAuthError(w, http.StatusUnauthorized, "เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง")
				return
			}

			ctx := ContextWithUserClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRoles ensures the authenticated user holds one of the allowed roles.
func RequireRoles(allowedRoles ...string) func(http.Handler) http.Handler {
	roleSet := make(map[string]bool, len(allowedRoles))
	for _, r := range allowedRoles {
		roleSet[r] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := GetUserClaims(r.Context())
			if !ok {
				writeAuthError(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบก่อนใช้งาน")
				return
			}

			if !roleSet[claims.Role] {
				writeAuthError(w, http.StatusForbidden, "คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้ (Insufficient Role Permissions)")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeAuthError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": message,
	})
}
