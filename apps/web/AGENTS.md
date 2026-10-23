# Web module

Follow root `AGENTS.md`. Use `npm run dev --workspace @exhibit/web` only when an API
is already running; prefer root `make dev` for both. Vite proxies `/api` to the local Go service.
Types come from `packages/contracts/src/api.d.ts`; regenerate from OpenAPI.
System fonts and local assets keep the app self-contained. Preserve light-mode styling,
keyboard navigation, explicit sample labels, loading, error and empty states.
Browser flow tests live in `tests/e2e`. Avoid adding state/router/UI frameworks until needed.
