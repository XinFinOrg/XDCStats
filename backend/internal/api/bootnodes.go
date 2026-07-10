package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/XinFinOrg/XDCStats/backend/internal/service"
)

// BootnodeHandler serves bootnode UDP/TCP health endpoints.
type BootnodeHandler struct {
	checker     *service.BootnodeChecker
	adminSecret string
}

func NewBootnodeHandler(checker *service.BootnodeChecker, adminSecret string) *BootnodeHandler {
	return &BootnodeHandler{checker: checker, adminSecret: adminSecret}
}

// Health returns the latest bootnode UDP/TCP probe results.
func (h *BootnodeHandler) Health(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, h.checker.Snapshot())
}

// Check triggers an immediate bootnode health check (admin only).
func (h *BootnodeHandler) Check(c *gin.Context) {
	if !h.checkAuth(c) {
		return
	}
	go h.checker.CheckNow()
	c.JSON(http.StatusAccepted, gin.H{
		"status":  "check started",
		"message": "poll GET /v2/bootnodes/health for results",
	})
}

func (h *BootnodeHandler) checkAuth(c *gin.Context) bool {
	if h.adminSecret == "" {
		return true
	}
	secret := c.GetHeader("x-api-secret")
	if secret != h.adminSecret {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "Unauthorized",
			"message": "Invalid or missing API secret",
		})
		return false
	}
	return true
}
