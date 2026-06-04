package node

import (
	"sync"
	"time"
)

const (
	MaxHistory      = 40
	MaxInactiveTime = 4 * time.Hour
)

// TrustedIPs mirrored from lib/utils/config.js
var TrustedIPs = map[string]bool{
	"52.16.188.185":    true,
	"54.94.239.50":     true,
	"54.174.74.156":    true,
	"54.172.25.93":     true,
	"54.174.75.126":    true,
	"54.173.232.137":   true,
	"52.7.205.180":     true,
	"52.7.218.44":      true,
	"52.7.205.152":     true,
	"52.7.224.174":     true,
	"92.51.165.126":    true,
	"84.117.82.122":    true,
	"73.40.58.88":      true,
	"178.19.221.38":    true,
	"185.37.145.18":    true,
	"172.31.39.87":     true,
	"86.120.171.69":    true,
	"86.123.155.6":     true,
	"188.24.81.133":    true,
	"::ffff:127.0.0.1": true,
}

type BlockInfo struct {
	Number          interface{}   `json:"number"`
	Hash            string        `json:"hash"`
	ParentHash      string        `json:"parentHash,omitempty"`
	SHA3Uncles      string        `json:"sha3Uncles,omitempty"`
	TransactionsRoot string       `json:"transactionsRoot,omitempty"`
	StateRoot       string        `json:"stateRoot,omitempty"`
	Miner           string        `json:"miner,omitempty"`
	Difficulty      interface{}   `json:"difficulty,omitempty"`
	TotalDifficulty interface{}   `json:"totalDifficulty,omitempty"`
	GasUsed         interface{}   `json:"gasUsed,omitempty"`
	GasLimit        interface{}   `json:"gasLimit,omitempty"`
	Timestamp       interface{}   `json:"timestamp,omitempty"`
	Transactions    []interface{} `json:"transactions,omitempty"`
	Uncles          []interface{} `json:"uncles,omitempty"`
	// Server-computed
	Trusted     bool  `json:"trusted,omitempty"`
	Arrived     int64 `json:"arrived,omitempty"`
	Received    int64 `json:"received,omitempty"`
	Propagation int64 `json:"propagation,omitempty"`
	Time        int64 `json:"time,omitempty"`
	Fork        int   `json:"fork,omitempty"`
}

type CommittedBlockInfo struct {
	Number interface{} `json:"number"`
	Round  interface{} `json:"round"`
	Hash   string      `json:"hash"`
}

type NodeInfo struct {
	Name             string      `json:"name,omitempty"`
	Node             string      `json:"node,omitempty"`
	Net              string      `json:"net,omitempty"`
	Protocol         string      `json:"protocol,omitempty"`
	Port             interface{} `json:"port,omitempty"`
	API              string      `json:"api,omitempty"`
	Client           string      `json:"client,omitempty"`
	OS               string      `json:"os,omitempty"`
	OSVersion        string      `json:"os_v,omitempty"`
	Contact          string      `json:"contact,omitempty"`
	Coinbase         string      `json:"coinbase,omitempty"`
	CanUpdateHistory bool        `json:"canUpdateHistory,omitempty"`
	IP               string      `json:"ip,omitempty"`
}

// NodeGeo is a flexible map to preserve the geoip2 response shape for the frontend.
type NodeGeo map[string]interface{}

type NodeStats struct {
	Active                  bool               `json:"active"`
	Mining                  bool               `json:"mining"`
	Syncing                 bool               `json:"syncing"`
	Hashrate                interface{}        `json:"hashrate"`
	Peers                   int                `json:"peers"`
	Pending                 int                `json:"pending"`
	GasPrice                interface{}        `json:"gasPrice"`
	Block                   BlockInfo          `json:"block"`
	PropagationAvg          int64              `json:"propagationAvg"`
	Latency                 int64              `json:"latency"`
	Uptime                  float64            `json:"uptime"`
	LatestCommittedBlockInfo CommittedBlockInfo `json:"latestCommittedBlockInfo"`
}

type uptimeTracker struct {
	started    int64
	up         int64
	down       int64
	lastStatus bool
	lastUpdate int64
}

type Node struct {
	mu      sync.RWMutex
	ID      string    `json:"id"`
	Trusted bool      `json:"trusted"`
	Spark   string    `json:"spark"`
	Info    NodeInfo  `json:"info"`
	Geo     NodeGeo   `json:"geo"`
	Stats   NodeStats `json:"stats"`
	History []int64   `json:"history"`
	uptime  uptimeTracker
}

func New(id string) *Node {
	n := &Node{
		ID: id,
		Stats: NodeStats{
			Block: BlockInfo{
				Hash:   "0x0000000000000000000000000000000000000000000000000000000000000000",
				Number: 0,
			},
			LatestCommittedBlockInfo: CommittedBlockInfo{
				Number: 0,
				Round:  0,
				Hash:   "0x0000000000000000000000000000000000000000000000000000000000000000",
			},
			Uptime: 100,
		},
		History: make([]int64, MaxHistory),
	}
	for i := range n.History {
		n.History[i] = -1
	}
	n.setState(true)
	return n
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}

func (n *Node) setState(active bool) {
	now := nowMs()
	if n.uptime.started != 0 {
		if n.uptime.lastStatus == active {
			if active {
				n.uptime.up += now - n.uptime.lastUpdate
			} else {
				n.uptime.down += now - n.uptime.lastUpdate
			}
		} else {
			if active {
				n.uptime.down += now - n.uptime.lastUpdate
			} else {
				n.uptime.up += now - n.uptime.lastUpdate
			}
		}
	} else {
		n.uptime.started = now
	}
	n.Stats.Active = active
	n.uptime.lastStatus = active
	n.uptime.lastUpdate = now
	n.Stats.Uptime = n.calculateUptime()
}

func (n *Node) calculateUptime() float64 {
	if n.uptime.lastUpdate == n.uptime.started {
		return 100
	}
	total := n.uptime.lastUpdate - n.uptime.started
	if total == 0 {
		return 100
	}
	return float64(n.uptime.up) / float64(total) * 100
}

// SetInfo updates node info on hello, returns the info.
func (n *Node) SetInfo(id, sparkID, ip string, latency int64, info NodeInfo, geoLookup func(string) NodeGeo) NodeInfo {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.ID = id
	n.Spark = sparkID
	n.Stats.Latency = latency
	n.Info = info

	cleanIP := ip
	if len(cleanIP) > 7 && cleanIP[:7] == "::ffff:" {
		cleanIP = cleanIP[7:]
	}
	n.Info.IP = cleanIP

	if TrustedIPs[ip] || TrustedIPs[cleanIP] {
		n.Trusted = true
	}

	if geoLookup != nil {
		n.Geo = geoLookup(cleanIP)
	}

	n.setState(true)
	return n.Info
}

// SetBlock updates block stats and history. Returns true if anything changed.
func (n *Node) SetBlock(block BlockInfo, history []int64, committed *CommittedBlockInfo) bool {
	n.mu.Lock()
	defer n.mu.Unlock()

	blockChanged := ToInt64(block.Number) != ToInt64(n.Stats.Block.Number) ||
		block.Hash != n.Stats.Block.Hash
	historyChanged := !int64SliceEqual(history, n.History)

	if !blockChanged && !historyChanged {
		return false
	}
	if blockChanged {
		n.Stats.Block = block
	}
	n.setHistory(history)

	if committed != nil {
		if committed.Hash != n.Stats.LatestCommittedBlockInfo.Hash &&
			ToFloat64(committed.Number) > ToFloat64(n.Stats.LatestCommittedBlockInfo.Number) {
			n.Stats.LatestCommittedBlockInfo = *committed
		}
	}
	return true
}

// SetPending updates pending tx count. Returns new pending or -1 if unchanged.
func (n *Node) SetPending(pending int) int {
	n.mu.Lock()
	defer n.mu.Unlock()
	if pending == n.Stats.Pending {
		return -1
	}
	n.Stats.Pending = pending
	return pending
}

// SetBasicStats updates mining/syncing/peers/etc. Returns true if changed.
func (n *Node) SetBasicStats(active, mining, syncing bool, hashrate, gasPrice interface{}, peers int, uptime float64) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	unchanged := n.Stats.Active == active &&
		n.Stats.Mining == mining &&
		n.Stats.Syncing == syncing &&
		n.Stats.Peers == peers
	if unchanged {
		return false
	}
	n.Stats.Active = active
	n.Stats.Mining = mining
	n.Stats.Syncing = syncing
	n.Stats.Hashrate = hashrate
	n.Stats.Peers = peers
	n.Stats.GasPrice = gasPrice
	n.Stats.Uptime = uptime
	return true
}

// SetLatency updates latency. Returns true if changed.
func (n *Node) SetLatency(latency int64) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	if latency == n.Stats.Latency {
		return false
	}
	n.Stats.Latency = latency
	return true
}

// SetInactive marks node as offline.
func (n *Node) SetInactive() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.setState(false)
}

// CanUpdate returns true if this node can be asked for block history.
func (n *Node) CanUpdate() bool {
	n.mu.RLock()
	defer n.mu.RUnlock()
	if n.Trusted {
		return true
	}
	return n.Info.CanUpdateHistory || (!n.Stats.Syncing && n.Stats.Peers > 0)
}

// BlockNumber returns the current block number as int64.
func (n *Node) BlockNumber() int64 {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return ToInt64(n.Stats.Block.Number)
}

// IsInactiveAndOld returns true if node has been inactive for > 4 hours.
func (n *Node) IsInactiveAndOld() bool {
	n.mu.RLock()
	defer n.mu.RUnlock()
	if n.uptime.lastStatus || n.uptime.lastUpdate == 0 {
		return false
	}
	return time.Duration(nowMs()-n.uptime.lastUpdate)*time.Millisecond > MaxInactiveTime
}

func (n *Node) setHistory(history []int64) {
	if int64SliceEqual(history, n.History) {
		return
	}
	if len(history) == 0 {
		for i := range n.History {
			n.History[i] = -1
		}
		n.Stats.PropagationAvg = 0
		return
	}
	n.History = history
	var sum, count int64
	for _, v := range history {
		if v >= 0 {
			sum += v
			count++
		}
	}
	if count > 0 {
		n.Stats.PropagationAvg = sum / count
	} else {
		n.Stats.PropagationAvg = 0
	}
}

func int64SliceEqual(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// ToInt64 parses a hex/decimal/float interface value to int64.
func ToInt64(v interface{}) int64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case int64:
		return val
	case int:
		return int64(val)
	case float64:
		return int64(val)
	case string:
		return parseHexOrDec(val)
	}
	return 0
}

// ToFloat64 converts an interface value to float64.
func ToFloat64(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case int64:
		return float64(val)
	case int:
		return float64(val)
	case string:
		return float64(parseHexOrDec(val))
	}
	return 0
}

func parseHexOrDec(s string) int64 {
	if len(s) >= 2 && s[:2] == "0x" {
		var n int64
		for _, c := range s[2:] {
			n <<= 4
			switch {
			case c >= '0' && c <= '9':
				n |= int64(c - '0')
			case c >= 'a' && c <= 'f':
				n |= int64(c-'a') + 10
			case c >= 'A' && c <= 'F':
				n |= int64(c-'A') + 10
			}
		}
		return n
	}
	var n int64
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int64(c-'0')
	}
	return n
}
