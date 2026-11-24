package middleware

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// IPRateLimiter enforces a sliding-window request limit per client IP address
// (ADR-010: Zero-Friction Anti-Spam on POST /api/public/tickets: 5 req / 15 min).
type IPRateLimiter struct {
	mu          sync.Mutex
	maxRequests int
	window      time.Duration
	hits        map[string][]time.Time
}

// NewIPRateLimiter creates an IPRateLimiter with the specified maxRequests per window.
func NewIPRateLimiter(maxRequests int, window time.Duration) *IPRateLimiter {
	if maxRequests <= 0 {
		maxRequests = 5
	}
	if window <= 0 {
		window = 15 * time.Minute
	}
	return &IPRateLimiter{
		maxRequests: maxRequests,
		window:      window,
		hits:        make(map[string][]time.Time),
	}
}

// Allow checks if the given IP is permitted to perform an action at time now.
// Returns (allowed, retryAfterSeconds).
func (rl *IPRateLimiter) Allow(ip string, now time.Time) (bool, int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	cutoff := now.Add(-rl.window)

	// Opportunistically prune old entries if map grows
	if len(rl.hits) > 500 {
		for k, timestamps := range rl.hits {
			var valid []time.Time
			for _, ts := range timestamps {
				if ts.After(cutoff) {
					valid = append(valid, ts)
				}
			}
			if len(valid) == 0 {
				delete(rl.hits, k)
			} else {
				rl.hits[k] = valid
			}
		}
	}

	var recent []time.Time
	for _, ts := range rl.hits[ip] {
		if ts.After(cutoff) {
			recent = append(recent, ts)
		}
	}

	if len(recent) >= rl.maxRequests {
		rl.hits[ip] = recent
		oldest := recent[0]
		retryAfter := int(oldest.Add(rl.window).Sub(now).Seconds())
		if retryAfter < 1 {
			retryAfter = 1
		}
		return false, retryAfter
	}

	recent = append(recent, now)
	rl.hits[ip] = recent
	return true, 0
}

// Middleware wraps an http.Handler with the IP rate limit check.
func (rl *IPRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientIP := ExtractClientIP(r)
		allowed, retryAfter := rl.Allow(clientIP, time.Now())
		if !allowed {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error":               "คุณส่งรายการแจ้งซ่อมถี่เกินกำหนด (จำกัด 5 ครั้งต่อ 15 นาที) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
				"retry_after_seconds": retryAfter,
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ExtractClientIP reads the first client IP from X-Forwarded-For (Cloud Run standard),
// falling back to X-Real-IP and RemoteAddr.
func ExtractClientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		if first := strings.TrimSpace(parts[0]); first != "" {
			return first
		}
	}
	if xrip := strings.TrimSpace(r.Header.Get("X-Real-IP")); xrip != "" {
		return xrip
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	if r.RemoteAddr != "" {
		return r.RemoteAddr
	}
	return "unknown"
}
