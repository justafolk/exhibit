package main

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	database "github.com/justafolk/exhibit/db"
	"log"
	"os"
	"time"
)

func main() {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Fatal("DATABASE_URL required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		log.Fatal("invalid database configuration")
	}
	defer pool.Close()
	if err := database.Migrate(ctx, pool); err != nil {
		log.Fatal(err)
	}
	log.Print("Exhibit schema is current")
}
