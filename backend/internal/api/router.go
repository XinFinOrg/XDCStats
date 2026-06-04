package api

import (
	"github.com/gin-gonic/gin"
)

// SetupRouter attaches all /v2/* routes to the given engine.
func SetupRouter(r *gin.Engine, h *Handler) {
	v2 := r.Group("/v2")
	{
		v2.GET("/health", h.Health)
		v2.GET("/snapshot", h.Snapshot)
		v2.GET("/nodes_info", h.NodesInfo)
		v2.GET("/nodes_info_verbose", h.NodesInfoVerbose)
		v2.GET("/coinbase_info", h.CoinbaseInfo)
		v2.GET("/history", h.HistoryMetric)

		// Forensics routes — handlers are nil if forensics disabled; middleware guards them.
		v2.GET("/forensics/masternode", forensicsGuard(h, func(c *gin.Context) {
			h.ForensicsMasternode(c)
		}))
		v2.GET("/forensics/batch/load", forensicsGuard(h, func(c *gin.Context) {
			h.ForensicsReports(c)
		}))
		v2.GET("/forensics/load/detail", forensicsGuard(h, func(c *gin.Context) {
			h.ForensicsDetail(c)
		}))
		v2.GET("/forensics/load/latest", forensicsGuard(h, func(c *gin.Context) {
			h.ForensicsLatest(c)
		}))
	}
}

func forensicsGuard(h *Handler, next gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		if h.ForensicsReports == nil {
			c.JSON(503, gin.H{"error": "forensics not enabled"})
			return
		}
		next(c)
	}
}
