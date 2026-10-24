FROM node:25-alpine AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN npm run build

FROM golang:1.27.3-alpine AS api
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY services services
COPY db db
ARG COMMIT_SHA=unknown
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.commitSHA=${COMMIT_SHA}" -o /out/exhibit ./services/api/cmd/server && \
    CGO_ENABLED=0 go build -trimpath -o /out/migrate ./services/api/cmd/migrate && \
    CGO_ENABLED=0 go build -trimpath -o /out/bootstrap-user ./services/api/cmd/bootstrap-user

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && addgroup -S exhibit && adduser -S -G exhibit exhibit
RUN mkdir -p /var/lib/exhibit/artifacts && chown -R exhibit:exhibit /var/lib/exhibit
WORKDIR /app
COPY --from=api /out/ /app/
COPY --from=web /src/apps/web/dist /app/web
USER exhibit
ENV API_ADDR=0.0.0.0:8080 STATIC_DIR=/app/web EXHIBIT_STORE=postgres EXHIBIT_ARTIFACT_DIR=/var/lib/exhibit/artifacts
EXPOSE 8080
ENTRYPOINT ["/app/exhibit"]
