SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help bootstrap dev build check test test-integration e2e db-up db-down migrate seed worktree doctor fmt
help: ## Show common commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "%-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
bootstrap: ## Install locked dependencies and create checkout-local environment
	python3 scripts/worktree.py env
	npm ci
	go mod download
dev: ## Run API and web; demo mode needs no Docker
	npm run dev
build: ## Build web and API
	npm run build
	go build -o .local/bin/exhibit ./services/api/cmd/server
check: ## Run formatting, generated-contract, type, unit, vet and build checks
	npm run check
	@test -z "$$(gofmt -l services db)" || (gofmt -l services db; exit 1)
	go vet ./...
	go test -race ./...
	python3 -m unittest discover -s scripts -p 'test_*.py'
	git diff --exit-code -- packages/contracts/src/api.d.ts

go-check:
	go vet ./...
	go test -race ./...
test: ## Run Go unit and tooling tests
	go test -race ./...
	python3 -m unittest discover -s scripts -p 'test_*.py'
test-integration: ## Test migrations and API against a disposable PostgreSQL schema
	node scripts/with-env.mjs go test -tags integration -count=1 ./services/api/internal/httpapi
e2e: ## Run browser tests (install browser with npx playwright install chromium)
	npm run test:e2e
db-up: ## Start this checkout's PostgreSQL instance
	docker compose --env-file .env -f infra/compose.dev.yaml up -d --wait
db-down: ## Stop this checkout's database; preserve its data
	docker compose --env-file .env -f infra/compose.dev.yaml down
migrate: ## Apply pending migrations to the configured LOCAL Exhibit database
	node scripts/with-env.mjs go run ./services/api/cmd/migrate
seed: ## Insert clearly labelled sample runs into the LOCAL Exhibit database
	node scripts/with-env.mjs go run ./services/api/cmd/seed
worktree: ## Create an isolated checkout: make worktree NAME=feature-name
	python3 scripts/worktree.py create "$(NAME)"
doctor: ## Check tools, local environment and worktree identity
	python3 scripts/worktree.py doctor
fmt: ## Format source and documentation
	npm run format
	gofmt -w services db
