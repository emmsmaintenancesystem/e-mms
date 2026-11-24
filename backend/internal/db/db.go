package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ConnectPool creates and validates a PostgreSQL connection pool optimized
// for Supabase Free Tier (compatible with both Session Pooler port 5432 and
// Supavisor Transaction Pooler port 6543) and Google Cloud Run (min-instances=0).
func ConnectPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse DATABASE_URL: %w", err)
	}

	// Use QueryExecModeExec so parameterized queries never collide with
	// prepared statements when using Supabase Transaction Pooler (port 6543).
	poolCfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec

	// Conservative pool limits for Supabase Free Tier + Cloud Run max-instances=1
	poolCfg.MaxConns = 10
	poolCfg.MinConns = 0
	poolCfg.MaxConnIdleTime = 5 * time.Minute
	poolCfg.MaxConnLifetime = 30 * time.Minute
	poolCfg.HealthCheckPeriod = 1 * time.Minute

	if poolCfg.ConnConfig.RuntimeParams == nil {
		poolCfg.ConnConfig.RuntimeParams = make(map[string]string)
	}
	poolCfg.ConnConfig.RuntimeParams["TimeZone"] = "Asia/Bangkok"

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create database pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var one int
	if err := pool.QueryRow(pingCtx, "SELECT 1").Scan(&one); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to verify database connection (SELECT 1): %w", err)
	}

	return pool, nil
}
