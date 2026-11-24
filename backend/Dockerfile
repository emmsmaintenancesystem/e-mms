# =============================================================================
# e-MaintenanceManagementSystem (e-MMS) — Minimal Multi-Stage Dockerfile
# Optimized for Google Cloud Run Free Tier (min-instances=0, fast cold start)
# =============================================================================

# Stage 1: Build binary
FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o /app/bin/server ./cmd/server

# Stage 2: Minimal runtime image
FROM alpine:3.21

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -g '' appuser

ENV TZ=Asia/Bangkok
ENV PORT=8080

COPY --from=builder /app/bin/server /app/server

USER appuser

EXPOSE 8080

ENTRYPOINT ["/app/server"]
