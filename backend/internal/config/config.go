package config

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds all configuration settings for the e-MMS Backend server.
type Config struct {
	Port                   string
	AppEnv                 string
	DatabaseURL            string
	SupabaseURL            string
	SupabaseServiceRoleKey string
	SupabaseStorageBucket  string
	JWTSecret              string
	JWTExpiryHours         int
	CORSAllowedOrigins     []string
	FrontendBaseURL        string
	TelegramBotToken       string
	TelegramChatID         string
	RateLimitMaxRequests   int
	RateLimitWindowMinutes int
	MaxPhotoSizeBytes      int
}

// Load reads environment variables (loading from local .env file first if present)
// and validates critical configuration parameters.
func Load() (*Config, error) {
	// Load .env file if it exists in current working directory
	_ = loadDotEnv(".env")

	port := getEnv("PORT", "8080")
	appEnv := getEnv("APP_ENV", "development")
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	supabaseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/")
	supabaseKey := strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	bucket := getEnv("SUPABASE_STORAGE_BUCKET", "ticket-photos")
	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	jwtExpiry := getEnvInt("JWT_EXPIRY_HOURS", 24)
	frontendBaseURL := strings.TrimRight(getEnv("FRONTEND_BASE_URL", "http://localhost:5173"), "/")
	telegramToken := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN"))
	telegramChatID := strings.TrimSpace(os.Getenv("TELEGRAM_CHAT_ID"))
	rateLimitMax := getEnvInt("RATE_LIMIT_MAX_REQUESTS", 5)
	rateLimitWindow := getEnvInt("RATE_LIMIT_WINDOW_MINUTES", 15)
	maxPhotoBytes := getEnvInt("MAX_PHOTO_SIZE_BYTES", 512*1024) // 512 KB default per skill rule

	rawCORS := getEnv("CORS_ALLOWED_ORIGIN", "http://localhost:5173,http://127.0.0.1:5173")
	var origins []string
	for _, part := range strings.Split(rawCORS, ",") {
		trimmed := strings.TrimRight(strings.TrimSpace(part), "/")
		if trimmed != "" {
			origins = append(origins, trimmed)
		}
	}

	if dbURL == "" {
		return nil, fmt.Errorf("missing required environment variable: DATABASE_URL")
	}
	if jwtSecret == "" || len(jwtSecret) < 16 {
		return nil, fmt.Errorf("missing or insecure JWT_SECRET (must be at least 16 characters)")
	}

	return &Config{
		Port:                   port,
		AppEnv:                 appEnv,
		DatabaseURL:            dbURL,
		SupabaseURL:            supabaseURL,
		SupabaseServiceRoleKey: supabaseKey,
		SupabaseStorageBucket:  bucket,
		JWTSecret:              jwtSecret,
		JWTExpiryHours:         jwtExpiry,
		CORSAllowedOrigins:     origins,
		FrontendBaseURL:        frontendBaseURL,
		TelegramBotToken:       telegramToken,
		TelegramChatID:         telegramChatID,
		RateLimitMaxRequests:   rateLimitMax,
		RateLimitWindowMinutes: rateLimitWindow,
		MaxPhotoSizeBytes:      maxPhotoBytes,
	}, nil
}

func getEnv(key, fallback string) string {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	return val
}

func getEnvInt(key string, fallback int) int {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	n, err := strconv.Atoi(val)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

// loadDotEnv parses a local .env file and sets any environment variables
// that are not already defined in the OS environment.
func loadDotEnv(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		idx := strings.IndexByte(line, '=')
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])

		// Strip surrounding single or double quotes
		if len(val) >= 2 {
			if (val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
		}

		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, val)
		}
	}
	return scanner.Err()
}
