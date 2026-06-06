package main

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/XinFinOrg/XDCStats/backend/config"
	"github.com/XinFinOrg/XDCStats/backend/internal/api"
	"github.com/XinFinOrg/XDCStats/backend/internal/collection"
	"github.com/XinFinOrg/XDCStats/backend/internal/db"
	"github.com/XinFinOrg/XDCStats/backend/internal/geoip"
	"github.com/XinFinOrg/XDCStats/backend/internal/service"
	"github.com/XinFinOrg/XDCStats/backend/internal/ws"
)

func main() {
	cfg := config.Load()

	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		logLevel = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel,
	})))

	// GeoIP (optional)
	geo := geoip.Open(cfg.GeoIPDBPath)
	defer geo.Close()

	// Node collection (in-memory)
	nodes := collection.New()

	// WebSocket /api handler
	wsHandler := ws.NewAPIHandler(cfg.WSSecrets, nil, nodes, geo.Lookup)

	// Gin REST API
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(requestLogger())
	r.Use(corsMiddleware())
	r.Use(gzipMiddleware())

	handler := api.NewHandler(nodes, cfg.AdminSecret)

	// Forensics (optional)
	if cfg.EnableForensics {
		client, err := db.Connect(cfg.MongoDBURL)
		if err != nil {
			slog.Error("mongodb connect failed", "err", err)
			os.Exit(1)
		}
		storage := service.NewForensicsStorage(client)
		mnClient := service.NewMasterNodeClient(cfg.MasterNodeURL)
		fh := api.NewForensicsHandler(storage, mnClient, nodes)

		handler.ForensicsReports = fh.Reports
		handler.ForensicsDetail = fh.Detail
		handler.ForensicsLatest = fh.Latest
		handler.ForensicsMasternode = fh.Masternode

		ws.ForensicsHandler = func(proof json.RawMessage) {
			if err := storage.Save(proof); err != nil {
				slog.Error("forensics save failed", "err", err)
			}
		}
		slog.Info("forensics enabled")
	}

	api.SetupRouter(r, handler)

	// Mount WebSocket under /api on the same HTTP server
	mux := http.NewServeMux()
	mux.Handle("/api", wsHandler)
	mux.Handle("/api/", wsHandler)
	mux.Handle("/", r)

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Port),
		Handler: mux,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("server started", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("shutdown error", "err", err)
	}
	slog.Info("stopped")
}

func requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		slog.Info("http",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"ms", time.Since(start).Milliseconds(),
		)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, x-api-secret")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

var gzipWriterPool = sync.Pool{
	New: func() interface{} {
		w, _ := gzip.NewWriterLevel(io.Discard, gzip.BestSpeed)
		return w
	},
}

type gzipResponseWriter struct {
	gin.ResponseWriter
	gz *gzip.Writer
}

func (g *gzipResponseWriter) Write(data []byte) (int, error) {
	return g.gz.Write(data)
}

func (g *gzipResponseWriter) WriteString(s string) (int, error) {
	return g.gz.Write([]byte(s))
}

func gzipMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !strings.Contains(c.Request.Header.Get("Accept-Encoding"), "gzip") {
			c.Next()
			return
		}
		gz := gzipWriterPool.Get().(*gzip.Writer)
		gz.Reset(c.Writer)
		defer func() {
			gz.Close()
			gzipWriterPool.Put(gz)
		}()
		c.Header("Content-Encoding", "gzip")
		c.Header("Vary", "Accept-Encoding")
		c.Writer = &gzipResponseWriter{ResponseWriter: c.Writer, gz: gz}
		c.Next()
	}
}
