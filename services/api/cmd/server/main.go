package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/justafolk/exhibit/services/api/internal/httpapi"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

var commitSHA = "development"

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	var data store.Store = store.Demo{}
	var identity store.IdentityStore
	mode := os.Getenv("EXHIBIT_STORE")
	if mode == "" {
		mode = "demo"
	}
	switch mode {
	case "demo":
		slog.Warn("demo mode: all evidence is sample data; no PR execution")
	case "postgres":
		url := os.Getenv("DATABASE_URL")
		if url == "" {
			return errors.New("DATABASE_URL is required for postgres mode")
		}
		cfg, err := pgxpool.ParseConfig(url)
		if err != nil {
			return errors.New("invalid DATABASE_URL")
		}
		cfg.MaxConns = 5
		pool, err := pgxpool.NewWithConfig(ctx, cfg)
		if err != nil {
			return errors.New("could not create database pool")
		}
		defer pool.Close()
		data = store.Postgres{Pool: pool}
		identity = store.Postgres{Pool: pool}
	default:
		return errors.New("EXHIBIT_STORE must be demo or postgres")
	}
	addr := os.Getenv("API_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	secureCookies := mode == "postgres"
	switch os.Getenv("EXHIBIT_COOKIE_SECURE") {
	case "true":
		secureCookies = true
	case "false":
		secureCookies = false
	case "":
	default:
		return errors.New("EXHIBIT_COOKIE_SECURE must be true or false")
	}
	server := &http.Server{Addr: addr, Handler: httpapi.Server{Store: data, Identity: identity, SecureCookies: secureCookies, PublicOrigin: os.Getenv("EXHIBIT_PUBLIC_ORIGIN"), CommitSHA: commitSHA, StaticDir: os.Getenv("STATIC_DIR")}.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	result := make(chan error, 1)
	go func() {
		slog.Info("exhibit API listening", "address", addr, "mode", mode)
		result <- server.ListenAndServe()
	}()
	select {
	case err := <-result:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
	return nil
}
func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
