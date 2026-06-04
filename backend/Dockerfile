FROM golang:1.23-alpine AS builder
WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o xdcstats-backend .

# ── Runtime image ──────────────────────────────────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

COPY --from=builder /build/xdcstats-backend .

ENV LOG_LEVEL=debug

EXPOSE 2000
CMD ["./xdcstats-backend"]
