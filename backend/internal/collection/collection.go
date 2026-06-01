package collection

import (
	"log/slog"
	"sync"
	"time"

	"github.com/XinFinOrg/XDCStats/backend/internal/history"
	"github.com/XinFinOrg/XDCStats/backend/internal/node"
)

type Collection struct {
	mu                   sync.RWMutex
	items                []*node.Node
	blockchain           *history.History
	askedForHistory      bool
	askedForHistoryTime  int64
	highestBlock         int64
	highestCommittedBlock node.CommittedBlockInfo

	// debounce state for chart computation
	debounceTimer *time.Timer
	debounceStop  chan struct{}
}

func New() *Collection {
	return &Collection{
		blockchain: history.New(),
		highestCommittedBlock: node.CommittedBlockInfo{
			Number: 0,
			Round:  0,
			Hash:   "0x0000000000000000000000000000000000000000000000000000000000000000",
		},
	}
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}

// Add registers or updates a node on hello.
func (c *Collection) Add(id, sparkID, ip string, latency int64, info node.NodeInfo, geoLookup func(string) node.NodeGeo) (*node.Node, error) {
	c.mu.Lock()
	n := c.getOrCreate(id)
	c.mu.Unlock()

	n.SetInfo(id, sparkID, ip, latency, info, geoLookup)
	return n, nil
}

// Update processes a stats update (update event).
func (c *Collection) Update(id string, stats map[string]interface{}) (*node.BlockInfo, []int64, error) {
	c.mu.RLock()
	n := c.findByID(id)
	c.mu.RUnlock()
	if n == nil {
		return nil, nil, errNotFound(id)
	}

	blockRaw, _ := stats["block"].(map[string]interface{})
	if blockRaw == nil {
		return nil, nil, errBadBlock()
	}
	block := mapToBlockInfo(blockRaw)

	result := c.blockchain.Add(block, id, n.Trusted, false)
	if result == nil {
		return nil, nil, errBadBlock()
	}

	block.Arrived = result.Block.Arrived
	block.Received = result.Block.Received
	block.Propagation = result.Block.Propagation

	prop := c.blockchain.GetNodePropagation(id)

	active, _ := stats["active"].(bool)
	mining, _ := stats["mining"].(bool)
	syncing, _ := stats["syncing"].(bool)
	peers, _ := toInt(stats["peers"])
	uptime, _ := toFloat(stats["uptime"])
	hashrate := stats["hashrate"]
	gasPrice := stats["gasPrice"]

	n.SetBasicStats(active, mining, syncing, hashrate, gasPrice, peers, uptime)

	var committed *node.CommittedBlockInfo
	n.SetBlock(block, prop, committed)

	return &block, prop, nil
}

// AddBlock processes a block event.
func (c *Collection) AddBlock(id string, block node.BlockInfo, committed *node.CommittedBlockInfo) (*node.BlockInfo, []int64, error) {
	c.mu.RLock()
	n := c.findByID(id)
	c.mu.RUnlock()
	if n == nil {
		return nil, nil, errNotFound(id)
	}

	result := c.blockchain.Add(block, id, n.Trusted, false)
	if result == nil {
		return nil, nil, errBadBlock()
	}

	block.Arrived = result.Block.Arrived
	block.Received = result.Block.Received
	block.Propagation = result.Block.Propagation

	c.mu.Lock()
	blockNum := node.ToInt64(block.Number)
	if blockNum > c.highestBlock {
		c.highestBlock = blockNum
	}
	if committed != nil && node.ToFloat64(committed.Number) > node.ToFloat64(c.highestCommittedBlock.Number) {
		c.highestCommittedBlock = *committed
	}
	c.mu.Unlock()

	prop := c.blockchain.GetNodePropagation(id)
	n.SetBlock(block, prop, committed)

	return &block, prop, nil
}

// UpdatePending processes a pending event.
func (c *Collection) UpdatePending(id string, pending int) bool {
	c.mu.RLock()
	n := c.findByID(id)
	c.mu.RUnlock()
	if n == nil {
		return false
	}
	return n.SetPending(pending) >= 0
}

// UpdateStats processes a stats-only event.
func (c *Collection) UpdateStats(id string, active, mining, syncing bool, hashrate, gasPrice interface{}, peers int, uptime float64) error {
	c.mu.RLock()
	n := c.findByID(id)
	c.mu.RUnlock()
	if n == nil {
		return errNotFound(id)
	}
	n.SetBasicStats(active, mining, syncing, hashrate, gasPrice, peers, uptime)
	return nil
}

// AddHistory processes bulk history blocks.
func (c *Collection) AddHistory(id string, blocks []node.BlockInfo) error {
	c.mu.RLock()
	n := c.findByID(id)
	c.mu.RUnlock()
	if n == nil {
		return errNotFound(id)
	}

	slog.Info("collection.AddHistory: received", "node", id, "count", len(blocks), "historyLenBefore", c.blockchain.Len())

	// Reverse to oldest-first before adding
	for i, j := 0, len(blocks)-1; i < j; i, j = i+1, j-1 {
		blocks[i], blocks[j] = blocks[j], blocks[i]
	}
	added := 0
	for _, b := range blocks {
		if r := c.blockchain.Add(b, id, n.Trusted, true); r != nil && r.Changed {
			added++
		}
	}

	slog.Info("collection.AddHistory: done", "node", id, "added", added, "historyLenAfter", c.blockchain.Len())
	c.setAskedForHistory(false)
	return nil
}

// UpdateLatency updates node latency.
func (c *Collection) UpdateLatency(id string, latency int64) bool {
	c.mu.RLock()
	n := c.findByID(id)
	c.mu.RUnlock()
	if n == nil {
		return false
	}
	return n.SetLatency(latency)
}

// Inactive marks a node offline by spark ID.
func (c *Collection) Inactive(sparkID string) error {
	c.mu.RLock()
	n := c.findBySpark(sparkID)
	c.mu.RUnlock()
	if n == nil {
		return errNotFound(sparkID)
	}
	n.SetInactive()
	return nil
}

// All returns live nodes (removing stale inactive ones first).
func (c *Collection) All() []*node.Node {
	c.mu.Lock()
	c.removeOldNodes()
	result := make([]*node.Node, len(c.items))
	copy(result, c.items)
	c.mu.Unlock()
	return result
}

func (c *Collection) removeOldNodes() {
	alive := c.items[:0]
	for _, n := range c.items {
		if !n.IsInactiveAndOld() {
			alive = append(alive, n)
		}
	}
	c.items = alive
}

// RequiresUpdate returns true if we should ask a node for block history.
func (c *Collection) RequiresUpdate(id string) bool {
	c.mu.RLock()
	n := c.findByID(id)
	c.mu.RUnlock()
	if n == nil {
		return false
	}
	canUpdate := n.CanUpdate()
	nodeBlock := n.BlockNumber()
	bestBlock := c.blockchain.BestBlockNumber()
	diff := nodeBlock - bestBlock
	historyNeeds := c.blockchain.RequiresUpdate()
	c.mu.RLock()
	asked := c.askedForHistory && (nowMs()-c.askedForHistoryTime < 2*60*1000)
	c.mu.RUnlock()

	result := canUpdate && diff >= 0 && historyNeeds && !asked
	slog.Debug("collection.RequiresUpdate",
		"node", id,
		"canUpdate", canUpdate,
		"nodeBlock", nodeBlock,
		"bestBlock", bestBlock,
		"diff", diff,
		"historyNeeds", historyNeeds,
		"alreadyAsked", asked,
		"result", result,
	)
	return result
}

// AskedForHistory sets/clears the history-request flag.
func (c *Collection) AskedForHistory(set bool) {
	c.setAskedForHistory(set)
}

func (c *Collection) setAskedForHistory(set bool) {
	c.mu.Lock()
	c.askedForHistory = set
	if set {
		c.askedForHistoryTime = nowMs()
	}
	c.mu.Unlock()
}

// GetHistoryRequestRange delegates to blockchain history.
func (c *Collection) GetHistoryRequestRange() *struct {
	Max  int64   `json:"max"`
	Min  int64   `json:"min"`
	List []int64 `json:"list"`
} {
	return c.blockchain.GetHistoryRequestRange()
}

// GetChartsData returns chart data directly (no debounce needed for REST polling).
func (c *Collection) GetChartsData() history.ChartsData {
	return c.blockchain.GetChartsData()
}

// GetHistory exposes the underlying blockchain for range queries.
func (c *Collection) GetHistory() *history.History {
	return c.blockchain
}

// GetBestBlock returns the best known block from history.
func (c *Collection) GetBestBlock() *history.HistoryItem {
	return c.blockchain.BestBlock()
}

// GetHighestCommittedBlock returns the highest committed block info.
func (c *Collection) GetHighestCommittedBlock() node.CommittedBlockInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.highestCommittedBlock
}

func (c *Collection) getOrCreate(id string) *node.Node {
	for _, n := range c.items {
		if n.ID == id {
			return n
		}
	}
	n := node.New(id)
	c.items = append(c.items, n)
	return n
}

func (c *Collection) findByID(id string) *node.Node {
	for _, n := range c.items {
		if n.ID == id {
			return n
		}
	}
	return nil
}

func (c *Collection) findBySpark(sparkID string) *node.Node {
	for _, n := range c.items {
		if n.Spark == sparkID {
			return n
		}
	}
	return nil
}

// FindByID is the exported version for handlers that need a node by ID.
func (c *Collection) FindByID(id string) *node.Node {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.findByID(id)
}

type collectionError struct{ msg string }

func (e *collectionError) Error() string { return e.msg }

func errNotFound(id string) error { return &collectionError{"node not found: " + id} }
func errBadBlock() error          { return &collectionError{"block data invalid"} }

func mapToBlockInfo(m map[string]interface{}) node.BlockInfo {
	b := node.BlockInfo{}
	b.Number = m["number"]
	if s, ok := m["hash"].(string); ok {
		b.Hash = s
	}
	if s, ok := m["parentHash"].(string); ok {
		b.ParentHash = s
	}
	if s, ok := m["sha3Uncles"].(string); ok {
		b.SHA3Uncles = s
	}
	if s, ok := m["transactionsRoot"].(string); ok {
		b.TransactionsRoot = s
	}
	if s, ok := m["stateRoot"].(string); ok {
		b.StateRoot = s
	}
	if s, ok := m["miner"].(string); ok {
		b.Miner = s
	}
	b.Difficulty = m["difficulty"]
	b.TotalDifficulty = m["totalDifficulty"]
	b.GasUsed = m["gasUsed"]
	b.GasLimit = m["gasLimit"]
	b.Timestamp = m["timestamp"]
	if txs, ok := m["transactions"].([]interface{}); ok {
		b.Transactions = txs
	}
	if uncles, ok := m["uncles"].([]interface{}); ok {
		b.Uncles = uncles
	}
	return b
}

func toInt(v interface{}) (int, bool) {
	if v == nil {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		return int(n), true
	case int:
		return n, true
	case int64:
		return int(n), true
	}
	return 0, false
}

func toFloat(v interface{}) (float64, bool) {
	if v == nil {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	}
	return 0, false
}
