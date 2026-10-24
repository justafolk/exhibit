// bootstrap-user provisions a private owner via an operator-controlled database connection.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net/mail"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

func run() error {
	email := flag.String("email", "", "owner email")
	name := flag.String("name", "", "owner display name")
	workspace := flag.String("workspace", "", "new workspace name")
	stdin := flag.Bool("password-stdin", false, "read password from standard input; never pass passwords as arguments")
	flag.Parse()
	*email = strings.ToLower(strings.TrimSpace(*email))
	*name = strings.TrimSpace(*name)
	*workspace = strings.TrimSpace(*workspace)
	parsed, err := mail.ParseAddress(*email)
	if err != nil || parsed.Address != *email || len(*email) > 254 || len(*name) < 1 || len(*name) > 100 || len(*workspace) < 1 || len(*workspace) > 100 || !*stdin {
		return fmt.Errorf("provide --email, --name, --workspace and --password-stdin; names must contain 1–100 bytes")
	}
	password, err := io.ReadAll(io.LimitReader(os.Stdin, 259))
	if err != nil {
		return fmt.Errorf("could not read password")
	}
	hash, err := auth.HashPassword(strings.TrimSuffix(strings.TrimSuffix(string(password), "\n"), "\r"))
	if err != nil {
		return err
	}
	if os.Getenv("DATABASE_URL") == "" {
		return fmt.Errorf("DATABASE_URL required; run migrations before provisioning")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("invalid database configuration")
	}
	defer pool.Close()
	account := store.Account{Identity: store.Identity{User: store.User{ID: auth.Token(), Email: *email, Name: *name}, Workspace: store.Workspace{ID: auth.Token(), Name: *workspace, Role: "owner"}}, PasswordHash: hash}
	if err = (store.Postgres{Pool: pool}).Bootstrap(ctx, account); err != nil {
		return fmt.Errorf("could not provision owner; check migrations and whether the email already exists")
	}
	fmt.Println("Owner and workspace created. Sign in with the supplied email and password.")
	return nil
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
