package main

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/justafolk/exhibit/services/api/internal/store"
	"log"
	"net/url"
	"os"
	"time"
)

func main() {
	raw := os.Getenv("DATABASE_URL")
	u, err := url.Parse(raw)
	if err != nil || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") {
		log.Fatal("sample seed only permits a loopback database URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		log.Fatal("invalid database configuration")
	}
	defer pool.Close()
	if err := store.SeedSamples(ctx, pool); err != nil {
		log.Fatal(err)
	}
	log.Print("sample runs inserted; every record is marked sample=true")
}
