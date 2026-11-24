package middleware

import (
	"net/http"
	"strings"
)

// CORS enforces strict origin checking against CORS_ALLOWED_ORIGIN (e.g. GitHub Pages + localhost).
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	originSet := make(map[string]bool, len(allowedOrigins))
	allowAll := false
	for _, o := range allowedOrigins {
		clean := strings.TrimRight(strings.TrimSpace(o), "/")
		if clean == "*" {
			allowAll = true
		} else if clean != "" {
			originSet[strings.ToLower(clean)] = true
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reqOrigin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")

			if reqOrigin != "" {
				if allowAll {
					w.Header().Set("Access-Control-Allow-Origin", "*")
				} else if originSet[strings.ToLower(reqOrigin)] {
					w.Header().Set("Access-Control-Allow-Origin", reqOrigin)
					w.Header().Set("Vary", "Origin")
				}
			}

			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Requested-With")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition")
			w.Header().Set("Access-Control-Max-Age", "86400")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
