package ws

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"github.com/XinFinOrg/XDCStats/backend/internal/collection"
	"github.com/XinFinOrg/XDCStats/backend/internal/node"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

var sparkSeq atomic.Int64

func nextSparkID() string {
	return fmt.Sprintf("spark-%d", sparkSeq.Add(1))
}

// APIHandler handles the /api WebSocket endpoint.
type APIHandler struct {
	secrets   []string
	banned    map[string]bool
	nodes     *collection.Collection
	geoLookup func(string) node.NodeGeo
}

func NewAPIHandler(secrets []string, banned []string, nodes *collection.Collection, geo func(string) node.NodeGeo) *APIHandler {
	bannedMap := make(map[string]bool, len(banned))
	for _, ip := range banned {
		bannedMap[ip] = true
	}
	return &APIHandler{secrets: secrets, banned: bannedMap, nodes: nodes, geoLookup: geo}
}

func (h *APIHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rawWS, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws upgrade failed", "err", err)
		return
	}

	conn := NewConn(rawWS)
	ip := extractIP(r)
	sparkID := nextSparkID()

	slog.Info("ws new connection", "ip", ip, "spark", sparkID)

	done := make(chan struct{})
	defer close(done)

	go conn.StartPing(done, nil)

	authenticated := false
	var nodeID string

	for {
		event, payload, err := conn.ReadEvent()
		if err != nil {
			break
		}
		if event == "" {
			continue
		}

		if event == "primus::ping::" {
			slog.Warn("ws node-sent ping received", "node", nodeID, "payload", string(payload))
			_ = conn.SendPong(payload)
			continue
		}

		if event == "primus::pong::" {
			// payload is the timestamp we sent in the ping; RTT = now - sent
			var sentMs int64
			if err := json.Unmarshal(payload, &sentMs); err != nil {
				slog.Warn("ws pong parse error", "node", nodeID, "payload", string(payload), "err", err)
			} else if !authenticated {
				slog.Warn("ws pong before auth", "node", nodeID)
			} else {
				rtt := time.Now().UnixMilli() - sentMs
				slog.Warn("ws pong received", "node", nodeID, "sentMs", sentMs, "rtt_ms", rtt)
				if rtt > 0 {
					h.nodes.UpdateLatency(nodeID, rtt)
				}
			}
			continue
		}

		switch event {
		case "hello":
			nodeID, authenticated = h.handleHello(conn, payload, ip, sparkID)
		case "update":
			if authenticated {
				h.handleUpdate(conn, nodeID, payload)
			}
		case "block":
			if authenticated {
				h.handleBlock(nodeID, payload)
			}
		case "pending":
			if authenticated {
				h.handlePending(nodeID, payload)
			}
		case "stats":
			if authenticated {
				h.handleStats(nodeID, payload)
			}
		case "history":
			if authenticated {
				h.handleHistory(nodeID, payload)
			}
		case "node-ping":
			if authenticated {
				h.handleNodePing(conn, nodeID, payload)
			}
		case "latency":
			if authenticated {
				h.handleLatency(conn, nodeID, payload)
			}
		case "forensics":
			if authenticated {
				h.handleForensics(payload)
			}
		default:
			slog.Warn("ws unknown event", "event", event, "node", nodeID, "payload", string(payload))
		}
	}

	if err := h.nodes.Inactive(sparkID); err != nil {
		slog.Info("ws disconnect before hello", "spark", sparkID, "ip", ip)
	} else {
		slog.Info("ws node disconnected", "node", nodeID, "ip", ip)
	}
}

func (h *APIHandler) handleHello(conn *Conn, payload json.RawMessage, ip, sparkID string) (string, bool) {
	var data struct {
		ID     string        `json:"id"`
		Secret string        `json:"secret"`
		Info   node.NodeInfo `json:"info"`
	}
	if err := json.Unmarshal(payload, &data); err != nil {
		slog.Warn("ws hello parse error", "err", err, "ip", ip)
		conn.Close()
		return "", false
	}

	slog.Info("ws hello", "id", data.ID, "ip", ip,
		"secret_match", h.validSecret(data.Secret),
		"banned", h.banned[ip])

	if !h.validSecret(data.Secret) || h.banned[ip] || data.ID == "" {
		slog.Warn("ws auth failed", "id", data.ID, "ip", ip)
		conn.Close()
		return "", false
	}

	if _, err := h.nodes.Add(data.ID, sparkID, ip, 0, data.Info, h.geoLookup); err != nil {
		slog.Error("ws add node failed", "id", data.ID, "err", err)
		return "", false
	}

	if err := conn.Emit("ready", nil); err != nil {
		slog.Warn("ws emit ready failed", "err", err)
	}
	slog.Info("ws node connected", "id", data.ID, "ip", ip)
	return data.ID, true
}

func (h *APIHandler) handleUpdate(conn *Conn, nodeID string, payload json.RawMessage) {
	var data struct {
		ID    string                 `json:"id"`
		Stats map[string]interface{} `json:"stats"`
	}
	if err := json.Unmarshal(payload, &data); err != nil || data.Stats == nil {
		slog.Warn("ws malformed update", "node", nodeID)
		return
	}
	if lat, ok := data.Stats["latency"]; ok {
		slog.Warn("ws update contains latency field", "node", nodeID, "latency_raw", lat)
	}
	_, _, err := h.nodes.Update(data.ID, data.Stats)
	if err != nil {
		slog.Warn("ws update error", "node", nodeID, "err", err)
		return
	}
	slog.Info("ws update", "node", nodeID)
	h.maybeRequestHistory(conn, data.ID)
}

func (h *APIHandler) handleBlock(nodeID string, payload json.RawMessage) {
	var data struct {
		ID                       string                   `json:"id"`
		Block                    map[string]interface{}   `json:"block"`
		LatestCommittedBlockInfo *node.CommittedBlockInfo `json:"latestCommittedBlockInfo"`
	}
	if err := json.Unmarshal(payload, &data); err != nil || data.Block == nil {
		slog.Warn("ws malformed block", "node", nodeID)
		return
	}
	block := mapToBlock(data.Block)
	_, _, err := h.nodes.AddBlock(data.ID, block, data.LatestCommittedBlockInfo)
	if err != nil {
		slog.Warn("ws block error", "node", nodeID, "err", err)
		return
	}
	slog.Info("ws block", "node", nodeID, "num", node.ToInt64(block.Number))
}

func (h *APIHandler) handlePending(nodeID string, payload json.RawMessage) {
	var data struct {
		ID    string `json:"id"`
		Stats struct {
			Pending int `json:"pending"`
		} `json:"stats"`
	}
	if err := json.Unmarshal(payload, &data); err != nil {
		slog.Warn("ws malformed pending", "node", nodeID)
		return
	}
	h.nodes.UpdatePending(data.ID, data.Stats.Pending)
	slog.Info("ws pending", "node", nodeID, "count", data.Stats.Pending)
}

func (h *APIHandler) handleStats(nodeID string, payload json.RawMessage) {
	var data struct {
		ID    string `json:"id"`
		Stats struct {
			Active   bool            `json:"active"`
			Mining   bool            `json:"mining"`
			Syncing  bool            `json:"syncing"`
			Hashrate interface{}     `json:"hashrate"`
			Peers    int             `json:"peers"`
			GasPrice interface{}     `json:"gasPrice"`
			Uptime   float64         `json:"uptime"`
			Latency  json.RawMessage `json:"latency"`
		} `json:"stats"`
	}
	if err := json.Unmarshal(payload, &data); err != nil {
		slog.Warn("ws malformed stats", "node", nodeID)
		return
	}
	s := data.Stats
	h.nodes.UpdateStats(data.ID, s.Active, s.Mining, s.Syncing, s.Hashrate, s.GasPrice, s.Peers, s.Uptime)
	if len(s.Latency) > 0 {
		if lat, err := parseLatencyField(s.Latency); err == nil && lat > 0 {
			h.nodes.UpdateLatency(data.ID, lat)
		}
	}
	slog.Info("ws stats", "node", nodeID)
}

func (h *APIHandler) handleHistory(nodeID string, payload json.RawMessage) {
	var data struct {
		ID      string                   `json:"id"`
		History []map[string]interface{} `json:"history"`
	}
	if err := json.Unmarshal(payload, &data); err != nil {
		slog.Warn("ws malformed history", "node", nodeID)
		return
	}
	blocks := make([]node.BlockInfo, len(data.History))
	for i, m := range data.History {
		blocks[i] = mapToBlock(m)
	}
	if err := h.nodes.AddHistory(data.ID, blocks); err != nil {
		slog.Warn("ws history error", "node", nodeID, "err", err)
		return
	}
	slog.Info("ws history", "node", nodeID, "count", len(blocks))
}

func (h *APIHandler) handleNodePing(conn *Conn, nodeID string, payload json.RawMessage) {
	var data struct {
		ClientTime interface{} `json:"clientTime"`
	}
	json.Unmarshal(payload, &data)
	slog.Warn("ws node-ping received, sending node-pong", "node", nodeID, "clientTime", data.ClientTime)
	_ = conn.Emit("node-pong", map[string]interface{}{
		"clientTime": data.ClientTime,
		"serverTime": time.Now().UnixMilli(),
	})
}

func (h *APIHandler) handleLatency(conn *Conn, nodeID string, payload json.RawMessage) {
	var raw struct {
		ID      string          `json:"id"`
		Latency json.RawMessage `json:"latency"`
	}
	if err := json.Unmarshal(payload, &raw); err != nil {
		slog.Warn("ws latency parse error", "node", nodeID, "raw", string(payload), "err", err)
		return
	}
	latency, err := parseLatencyField(raw.Latency)
	if err != nil {
		slog.Warn("ws latency field parse error", "node", nodeID, "raw_latency", string(raw.Latency), "err", err)
		return
	}
	id := raw.ID
	if id == "" {
		id = nodeID
	}
	slog.Warn("ws latency event received", "node", nodeID, "payload_id", raw.ID, "latency_ms", latency)
	h.nodes.UpdateLatency(id, latency)
	h.maybeRequestHistory(conn, id)
}

// ForensicsHandler is set by main when forensics is enabled.
var ForensicsHandler func(proof json.RawMessage)

func (h *APIHandler) handleForensics(payload json.RawMessage) {
	if ForensicsHandler == nil {
		return
	}
	var data struct {
		ForensicsProof json.RawMessage `json:"forensicsProof"`
	}
	if err := json.Unmarshal(payload, &data); err == nil {
		ForensicsHandler(data.ForensicsProof)
	}
}

func (h *APIHandler) maybeRequestHistory(conn *Conn, nodeID string) {
	if !h.nodes.RequiresUpdate(nodeID) {
		return
	}
	rng := h.nodes.GetHistoryRequestRange()
	if rng == nil {
		return
	}
	if err := conn.Emit("history", rng); err == nil {
		h.nodes.AskedForHistory(true)
		slog.Info("ws requested history", "node", nodeID)
	}
}

func (h *APIHandler) validSecret(secret string) bool {
	for _, s := range h.secrets {
		if s == secret {
			return true
		}
	}
	return false
}

// parseLatencyField parses a JSON latency value that nodes send as either a
// number (79) or a quoted string ("79").
func parseLatencyField(raw json.RawMessage) (int64, error) {
	if len(raw) == 0 {
		return 0, fmt.Errorf("empty latency field")
	}
	// Try integer first
	var n int64
	if err := json.Unmarshal(raw, &n); err == nil {
		return n, nil
	}
	// Fall back to quoted string e.g. "79"
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return 0, fmt.Errorf("latency is neither number nor string: %s", raw)
	}
	return strconv.ParseInt(s, 10, 64)
}

func extractIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if parts := strings.SplitN(xff, ",", 2); len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	host := r.RemoteAddr
	if idx := strings.LastIndex(host, ":"); idx > 0 {
		return host[:idx]
	}
	return host
}

func mapToBlock(m map[string]interface{}) node.BlockInfo {
	b := node.BlockInfo{Number: m["number"]}
	if s, _ := m["hash"].(string); s != "" {
		b.Hash = s
	}
	if s, _ := m["parentHash"].(string); s != "" {
		b.ParentHash = s
	}
	if s, _ := m["sha3Uncles"].(string); s != "" {
		b.SHA3Uncles = s
	}
	if s, _ := m["transactionsRoot"].(string); s != "" {
		b.TransactionsRoot = s
	}
	if s, _ := m["stateRoot"].(string); s != "" {
		b.StateRoot = s
	}
	if s, _ := m["miner"].(string); s != "" {
		b.Miner = s
	}
	b.Difficulty = m["difficulty"]
	b.TotalDifficulty = m["totalDifficulty"]
	b.GasUsed = m["gasUsed"]
	b.GasLimit = m["gasLimit"]
	b.Timestamp = m["timestamp"]
	if txs, ok := m["transactions"].([]interface{}); ok {
		b.Transactions = txs
	} else {
		b.Transactions = []interface{}{}
	}
	if uncles, ok := m["uncles"].([]interface{}); ok {
		b.Uncles = uncles
	} else {
		b.Uncles = []interface{}{}
	}
	if b.Difficulty == nil {
		b.Difficulty = 0
	}
	return b
}
