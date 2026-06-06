package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/XinFinOrg/XDCStats/backend/internal/collection"
	"github.com/XinFinOrg/XDCStats/backend/internal/history"
	"github.com/XinFinOrg/XDCStats/backend/internal/node"
)

// snapshotPropagBin is PropagBin without the cumulative field the frontend doesn't use.
type snapshotPropagBin struct {
	X          float64 `json:"x"`
	Dx         float64 `json:"dx"`
	Y          float64 `json:"y"`
	Frequency  int     `json:"frequency"`
	CumPercent float64 `json:"cumpercent"`
}

func toSnapshotPropagBins(bins []history.PropagBin) []snapshotPropagBin {
	out := make([]snapshotPropagBin, len(bins))
	for i, b := range bins {
		out[i] = snapshotPropagBin{X: b.X, Dx: b.Dx, Y: b.Y, Frequency: b.Frequency, CumPercent: b.CumPercent}
	}
	return out
}

type Handler struct {
	nodes       *collection.Collection
	adminSecret string
	// forensics handlers set by main when ENABLE_FORENSICS=true
	ForensicsReports       func(c *gin.Context)
	ForensicsDetail        func(c *gin.Context)
	ForensicsLatest        func(c *gin.Context)
	ForensicsMasternode    func(c *gin.Context)
}

func NewHandler(nodes *collection.Collection, adminSecret string) *Handler {
	return &Handler{nodes: nodes, adminSecret: adminSecret}
}

func (h *Handler) Health(c *gin.Context) {
	c.String(http.StatusOK, "OK")
}

// snapshotBlock maps the internal block to the shape the frontend expects
// (transactions and uncles as counts, not arrays).
type snapshotBlock struct {
	Number      interface{} `json:"number"`
	Arrived     int64       `json:"arrived"`
	Propagation int64       `json:"propagation"`
	GasLimit    interface{} `json:"gasLimit"`
}

type snapshotStats struct {
	Active   bool          `json:"active"`
	Peers    int           `json:"peers"`
	GasPrice interface{}   `json:"gasPrice"`
	Block    snapshotBlock `json:"block"`
	Uptime   float64       `json:"uptime"`
	Latency  int64         `json:"latency"`
	Pending  int           `json:"pending"`
}

type snapshotInfo struct {
	Name      string      `json:"name"`
	Node      string      `json:"node"`
	Net       string      `json:"net"`
	Protocol  string      `json:"protocol"`
	Port      interface{} `json:"port"`
	API       string      `json:"api"`
	Client    string      `json:"client"`
	OS        string      `json:"os"`
	OSVersion string      `json:"os_v"`
	Contact   string      `json:"contact"`
}

type snapshotNode struct {
	ID      string        `json:"id"`
	Info    snapshotInfo  `json:"info"`
	Geo     node.NodeGeo  `json:"geo"`
	Stats   snapshotStats `json:"stats"`
	History []int64       `json:"history"`
}

func toSnapshotNode(n *node.Node) snapshotNode {
	b := n.Stats.Block
	return snapshotNode{
		ID: n.ID,
		Info: snapshotInfo{
			Name:      n.Info.Name,
			Node:      n.Info.Node,
			Net:       n.Info.Net,
			Protocol:  n.Info.Protocol,
			Port:      n.Info.Port,
			API:       n.Info.API,
			Client:    n.Info.Client,
			OS:        n.Info.OS,
			OSVersion: n.Info.OSVersion,
			Contact:   n.Info.Contact,
		},
		Geo: n.Geo,
		Stats: snapshotStats{
			Active:   n.Stats.Active,
			Peers:    n.Stats.Peers,
			GasPrice: n.Stats.GasPrice,
			Uptime:   n.Stats.Uptime,
			Latency:  n.Stats.Latency,
			Pending:  n.Stats.Pending,
			Block: snapshotBlock{
				Number:      b.Number,
				Arrived:     b.Arrived,
				Propagation: b.Propagation,
				GasLimit:    b.GasLimit,
			},
		},
		History: n.History,
	}
}

func (h *Handler) Snapshot(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	all := h.nodes.All()
	nodes := make([]snapshotNode, len(all))
	for i, n := range all {
		nodes[i] = toSnapshotNode(n)
	}
	charts := h.nodes.GetChartsData()
	c.JSON(http.StatusOK, gin.H{
		"nodes": nodes,
		"charts": gin.H{
			"blocktime":          charts.Blocktime,
			"avgTransactionRate": charts.AvgTransactionRate,
			"transactions":       charts.Transactions,
			"gasSpending":        charts.GasSpending,
			"propagation": gin.H{
				"histogram": toSnapshotPropagBins(charts.Propagation.Histogram),
				"avg":       charts.Propagation.Avg,
			},
		},
	})
}

func (h *Handler) NodesInfo(c *gin.Context) {
	if !h.checkAuth(c) {
		return
	}
	all := h.nodes.All()
	type item struct {
		Info  map[string]interface{} `json:"info"`
		Stats map[string]interface{} `json:"stats"`
	}
	result := make([]item, len(all))
	for i, n := range all {
		result[i] = item{
			Info: map[string]interface{}{
				"name":     n.Info.Name,
				"node":     n.Info.Node,
				"coinbase": n.Info.Coinbase,
				"ip":       n.Info.IP,
			},
			Stats: map[string]interface{}{
				"active":  n.Stats.Active,
				"mining":  n.Stats.Mining,
				"peers":   n.Stats.Peers,
				"pending": n.Stats.Pending,
			},
		}
	}
	c.JSON(http.StatusOK, gin.H{"count": len(result), "nodes": result})
}

func (h *Handler) NodesInfoVerbose(c *gin.Context) {
	if !h.checkAuth(c) {
		return
	}
	all := h.nodes.All()
	c.JSON(http.StatusOK, gin.H{"success": true, "count": len(all), "nodes": all})
}

func (h *Handler) CoinbaseInfo(c *gin.Context) {
	if !h.checkAuth(c) {
		return
	}
	all := h.nodes.All()
	type item struct {
		Name     string `json:"name"`
		Coinbase string `json:"coinbase"`
	}
	result := make([]item, len(all))
	for i, n := range all {
		result[i] = item{Name: n.Info.Name, Coinbase: n.Info.Coinbase}
	}
	c.JSON(http.StatusOK, gin.H{"count": len(result), "nodes": result})
}

var validMetrics = map[string]bool{"blocktime": true, "transactions": true, "gasUsed": true}

func (h *Handler) HistoryMetric(c *gin.Context) {
	metric := c.Query("metric")
	if !validMetrics[metric] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "metric must be one of: blocktime, transactions, gasUsed"})
		return
	}
	limit := 100000
	if ls := c.Query("limit"); ls != "" {
		if n, err := strconv.Atoi(ls); err == nil && n > 0 {
			if n < limit {
				limit = n
			}
		}
	}
	c.Header("Cache-Control", "no-store")
	data := h.nodes.GetHistory().GetMetricHistory(metric, limit)
	if data == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown metric"})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *Handler) checkAuth(c *gin.Context) bool {
	secret := c.GetHeader("x-api-secret")
	if h.adminSecret == "" || secret != h.adminSecret {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "Unauthorized",
			"message": "Invalid or missing API secret",
		})
		return false
	}
	return true
}
