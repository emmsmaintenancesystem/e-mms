package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/emms/backend/internal/config"
	"github.com/emms/backend/internal/db"
	"github.com/emms/backend/internal/handler"
	"github.com/emms/backend/internal/repository"
	"github.com/emms/backend/internal/storage"
	"github.com/emms/backend/internal/telegram"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("[FATAL] Failed to load configuration: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.ConnectPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[FATAL] Failed to connect to PostgreSQL database: %v", err)
	}
	defer pool.Close()
	log.Printf("[INFO] Connected to Supabase PostgreSQL successfully")

	masterRepo := repository.NewMasterRepository(pool)
	ticketRepo := repository.NewTicketRepository(pool)
	reportRepo := repository.NewReportRepository(pool)

	photoStorage := storage.NewSupabaseStorage(
		cfg.SupabaseURL,
		cfg.SupabaseServiceRoleKey,
		cfg.SupabaseStorageBucket,
	)

	telegramNotifier := telegram.NewBotNotifier(
		cfg.TelegramBotToken,
		cfg.TelegramChatID,
		cfg.FrontendBaseURL,
	)
	if telegramNotifier.IsConfigured() {
		log.Printf("[INFO] Telegram Bot Notification is ENABLED (New Ticket events only)")
	} else {
		log.Printf("[WARN] Telegram Bot Notification is DISABLED (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set)")
	}

	router := handler.NewRouter(handler.RouterDependencies{
		Config:           cfg,
		MasterRepo:       masterRepo,
		TicketRepo:       ticketRepo,
		ReportRepo:       reportRepo,
		PhotoStorage:     photoStorage,
		TelegramNotifier: telegramNotifier,
	})

	addr := ":" + cfg.Port
	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("[INFO] e-MMS Backend Server listening on http://localhost%s (env: %s)", addr, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[FATAL] HTTP server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Printf("[INFO] Shutting down e-MMS Backend Server gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[WARN] Graceful shutdown encountered error: %v", err)
	}
	log.Printf("[INFO] e-MMS Backend Server stopped cleanly")
}
