package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/XinFinOrg/XDCStats/backend/internal/collection"
	"github.com/XinFinOrg/XDCStats/backend/internal/service"
)

// ForensicsHandler wires the forensics REST endpoints to storage and masternode client.
type ForensicsHandler struct {
	storage    *service.ForensicsStorage
	masternode *service.MasterNodeClient
	nodes      *collection.Collection
}

func NewForensicsHandler(storage *service.ForensicsStorage, masternode *service.MasterNodeClient, nodes *collection.Collection) *ForensicsHandler {
	return &ForensicsHandler{storage: storage, masternode: masternode, nodes: nodes}
}

func (h *ForensicsHandler) Reports(c *gin.Context) {
	rangeParam := c.Query("range")
	var since *time.Time
	if rangeParam != "all" {
		days := 7
		if n, err := strconv.Atoi(rangeParam); err == nil && n > 0 {
			days = n
		}
		t := time.Now().AddDate(0, 0, -days)
		since = &t
	}
	reports, err := h.storage.BulkGetSummaries(since)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, reports)
}

func (h *ForensicsHandler) Detail(c *gin.Context) {
	id := c.Query("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id required"})
		return
	}
	detail, err := h.storage.FindByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if detail == nil {
		c.JSON(http.StatusOK, gin.H{})
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h *ForensicsHandler) Latest(c *gin.Context) {
	id := c.Query("id")

	bestBlock := h.nodes.GetBestBlock()
	latestBlockInfo := gin.H{
		"blockNumber": "0",
		"blockHash":   "",
	}
	if bestBlock != nil {
		latestBlockInfo = gin.H{
			"blockNumber": strconv.FormatInt(bestBlock.Height, 10),
			"blockHash":   bestBlock.Block.Hash,
		}
	}

	committed := h.nodes.GetHighestCommittedBlock()

	var newReports []service.ForensicsSummary
	if id != "" {
		summaries, err := h.storage.BulkGetLatest()
		if err == nil && len(summaries) > 0 {
			for i, s := range summaries {
				if s.Key == id {
					newReports = summaries[:i]
					break
				}
			}
		}
	}
	if newReports == nil {
		newReports = []service.ForensicsSummary{}
	}

	c.JSON(http.StatusOK, gin.H{
		"forensics":       newReports,
		"latestBlockInfo": latestBlockInfo,
		"highestCommittedBlockInfo": gin.H{
			"blockNumber": strconv.FormatInt(int64(nodeToInt(committed.Number)), 10),
			"blockHash":   committed.Hash,
		},
	})
}

func (h *ForensicsHandler) Masternode(c *gin.Context) {
	address := c.Query("address")
	if address == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "address required"})
		return
	}
	info, err := h.masternode.GetNodeInfo(address)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, info)
}

func nodeToInt(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	}
	return 0
}
