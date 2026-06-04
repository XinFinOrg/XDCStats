package history

import (
	"log/slog"
	"sort"
	"sync"
	"time"

	"github.com/XinFinOrg/XDCStats/backend/internal/node"
)

const (
	MaxHistory         = 100000
	MaxPeerPropagation = 40
	MinPropagation     = int64(0)
	MaxPropagation     = int64(10000)
	MaxUncles          = 1000
	MaxUnclesPerBin    = 25
	MaxBins            = 40
)

type PropagTime struct {
	Node        string `json:"node"`
	Trusted     bool   `json:"trusted"`
	Fork        int    `json:"fork"`
	Received    int64  `json:"received"`
	Propagation int64  `json:"propagation"`
}

type HistoryItem struct {
	Height      int64            `json:"height"`
	Block       node.BlockInfo   `json:"block"`
	Forks       []node.BlockInfo `json:"forks"`
	PropagTimes []PropagTime     `json:"propagTimes"`
}

type ChartsData struct {
	Height             []int64      `json:"height"`
	Blocktime          []float64    `json:"blocktime"`
	AvgBlocktime       float64      `json:"avgBlocktime"`
	AvgTransactionRate float64      `json:"avgTransactionRate"`
	AvgHashrate        float64      `json:"avgHashrate"`
	Difficulty         []interface{} `json:"difficulty"`
	Uncles             []int        `json:"uncles"`
	Transactions       []int        `json:"transactions"`
	GasSpending        []interface{} `json:"gasSpending"`
	GasLimit           []interface{} `json:"gasLimit"`
	Miners             []MinerCount `json:"miners"`
	Propagation        PropagChart  `json:"propagation"`
	UncleCount         []int        `json:"uncleCount"`
}

type MinerCount struct {
	Miner  string `json:"miner"`
	Name   bool   `json:"name"`
	Blocks int    `json:"blocks"`
}

type PropagBin struct {
	X          float64 `json:"x"`
	Dx         float64 `json:"dx"`
	Y          float64 `json:"y"`
	Frequency  int     `json:"frequency"`
	Cumulative int     `json:"cumulative"`
	CumPercent float64 `json:"cumpercent"`
}

type PropagChart struct {
	Histogram []PropagBin `json:"histogram"`
	Avg       int64       `json:"avg"`
}

type MetricHistory struct {
	Heights []int64   `json:"heights"`
	Values  []float64 `json:"values"`
	Count   int       `json:"count"`
}

type History struct {
	mu    sync.RWMutex
	items []*HistoryItem
}

func New() *History {
	return &History{}
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}

// Add inserts or updates a block. Returns block+changed or nil if the block is invalid.
func (h *History) Add(block node.BlockInfo, nodeID string, trusted bool, addingHistory bool) *struct {
	Block   node.BlockInfo
	Changed bool
} {
	if block.Number == nil || node.ToInt64(block.Number) <= 0 {
		slog.Debug("history.Add: rejected — number nil or zero", "node", nodeID, "num", block.Number)
		return nil
	}
	if block.Uncles == nil || block.Transactions == nil || block.Difficulty == nil {
		slog.Debug("history.Add: rejected — missing uncles/transactions/difficulty",
			"node", nodeID, "num", block.Number,
			"uncles_nil", block.Uncles == nil,
			"transactions_nil", block.Transactions == nil,
			"difficulty_nil", block.Difficulty == nil)
		return nil
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	blockNum := node.ToInt64(block.Number)
	now := nowMs()
	changed := false

	block.Trusted = trusted
	block.Arrived = now
	block.Received = now
	block.Propagation = 0
	block.Fork = 0

	existing := h.search(blockNum)

	slog.Debug("history.Add",
		"node", nodeID,
		"blockNum", blockNum,
		"addingHistory", addingHistory,
		"historyLen", len(h.items),
		"bestBlock", h.bestBlockNumber(),
		"existing", existing != nil,
	)

	if existing != nil {
		propIdx := -1
		for i, p := range existing.PropagTimes {
			if p.Node == nodeID {
				propIdx = i
				break
			}
		}
		forkIdx := compareForks(existing, block)

		if propIdx == -1 {
			if forkIdx >= 0 {
				block.Arrived = existing.Forks[forkIdx].Arrived
				block.Propagation = now - existing.Forks[forkIdx].Received
			} else {
				if prev := h.prevMaxBlock(blockNum); prev != nil {
					block.Time = max64(block.Arrived-prev.Block.Arrived, 0)
					if blockNum < h.bestBlockNumber() {
						block.Time = max64((node.ToInt64(block.Timestamp)-node.ToInt64(prev.Block.Timestamp))*1000, 0)
					}
				}
				forkIdx = len(existing.Forks)
				existing.Forks = append(existing.Forks, block)
				existing.Forks[forkIdx].Fork = forkIdx
			}
			existing.PropagTimes = append(existing.PropagTimes, PropagTime{
				Node: nodeID, Trusted: trusted, Fork: forkIdx,
				Received: now, Propagation: block.Propagation,
			})
		} else {
			if forkIdx >= 0 {
				block.Arrived = existing.Forks[forkIdx].Arrived
				if forkIdx == existing.PropagTimes[propIdx].Fork {
					block.Received = existing.PropagTimes[propIdx].Received
					block.Propagation = existing.PropagTimes[propIdx].Propagation
				} else {
					existing.PropagTimes[propIdx].Fork = forkIdx
					block.Propagation = now - existing.Forks[forkIdx].Received
					existing.PropagTimes[propIdx].Propagation = block.Propagation
				}
			} else {
				block.Received = existing.PropagTimes[propIdx].Received
				block.Propagation = existing.PropagTimes[propIdx].Propagation
				if prev := h.prevMaxBlock(blockNum); prev != nil {
					block.Time = max64(block.Arrived-prev.Block.Arrived, 0)
					if blockNum < h.bestBlockNumber() {
						block.Time = max64((node.ToInt64(block.Timestamp)-node.ToInt64(prev.Block.Timestamp))*1000, 0)
					}
				}
				forkIdx = len(existing.Forks)
				existing.Forks = append(existing.Forks, block)
				existing.Forks[forkIdx].Fork = forkIdx
			}
		}

		if trusted && forkIdx >= 0 && !compareBlocks(existing.Block, existing.Forks[forkIdx]) {
			existing.Forks[forkIdx].Trusted = true
			existing.Block = existing.Forks[forkIdx]
		}
		block.Fork = forkIdx
		changed = true

	} else {
		if prev := h.prevMaxBlock(blockNum); prev != nil {
			block.Time = max64(block.Arrived-prev.Block.Arrived, 0)
			if blockNum < h.bestBlockNumber() {
				block.Time = max64((node.ToInt64(block.Timestamp)-node.ToInt64(prev.Block.Timestamp))*1000, 0)
			}
		}

		item := &HistoryItem{
			Height: blockNum,
			Block:  block,
			Forks:  []node.BlockInfo{block},
		}

		underCapacity := len(h.items) < MaxHistory
		atMax := len(h.items) == MaxHistory
		isNewer := blockNum > h.bestBlockNumber()
		isOlderBackfill := blockNum < h.bestBlockNumber() && addingHistory

		shouldAdd := len(h.items) == 0 ||
			(atMax && blockNum > h.worstBlockNumber()) ||
			(underCapacity && (isNewer || isOlderBackfill))

		slog.Debug("history.Add: new block decision",
			"node", nodeID,
			"blockNum", blockNum,
			"historyLen", len(h.items),
			"bestBlock", h.bestBlockNumber(),
			"worstBlock", h.worstBlockNumber(),
			"addingHistory", addingHistory,
			"shouldAdd", shouldAdd,
			"isNewer", isNewer,
			"isOlderBackfill", isOlderBackfill,
		)

		if shouldAdd {
			item.PropagTimes = []PropagTime{{
				Node: nodeID, Trusted: trusted, Fork: 0,
				Received: now, Propagation: block.Propagation,
			}}
			h.save(item)
			changed = true
		}
	}

	return &struct {
		Block   node.BlockInfo
		Changed bool
	}{block, changed}
}

func (h *History) save(item *HistoryItem) {
	h.items = append(h.items, item)
	sort.Slice(h.items, func(i, j int) bool {
		return h.items[i].Height > h.items[j].Height
	})
	if len(h.items) > MaxHistory {
		h.items = h.items[:MaxHistory]
	}
}

func (h *History) search(height int64) *HistoryItem {
	for _, item := range h.items {
		if item.Height == height {
			return item
		}
	}
	return nil
}

func (h *History) prevMaxBlock(height int64) *HistoryItem {
	for _, item := range h.items {
		if item.Height < height {
			return item
		}
	}
	return nil
}

func (h *History) BestBlock() *HistoryItem {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if len(h.items) == 0 {
		return nil
	}
	return h.items[0]
}

func (h *History) bestBlockNumber() int64 {
	if len(h.items) == 0 {
		return 0
	}
	return h.items[0].Height
}

func (h *History) BestBlockNumber() int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.bestBlockNumber()
}

func (h *History) worstBlockNumber() int64 {
	if len(h.items) == 0 {
		return 0
	}
	return h.items[len(h.items)-1].Height
}

func (h *History) RequiresUpdate() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.items) < MaxHistory
}

func (h *History) GetHistoryRequestRange() *struct {
	Max  int64   `json:"max"`
	Min  int64   `json:"min"`
	List []int64 `json:"list"`
} {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if len(h.items) < 2 {
		return nil
	}

	best := h.bestBlockNumber()
	rangeStart := int64(0)
	if best > MaxHistory {
		rangeStart = best - MaxHistory
	}

	have := make(map[int64]bool, len(h.items))
	for _, item := range h.items {
		have[item.Height] = true
	}

	var missing []int64
	for n := rangeStart; n <= best; n++ {
		if !have[n] {
			missing = append(missing, n)
		}
	}
	if len(missing) == 0 {
		return nil
	}

	maxMissing := missing[len(missing)-1]
	count := 50
	cap := MaxHistory - len(h.items) + 1
	if cap < count {
		count = cap
	}
	start := len(missing) - count
	if start < 0 {
		start = 0
	}
	list := missing[start:]
	minVal := maxMissing - int64(count) + 1
	if minVal < 0 {
		minVal = 0
	}
	return &struct {
		Max  int64   `json:"max"`
		Min  int64   `json:"min"`
		List []int64 `json:"list"`
	}{maxMissing, minVal, list}
}

func (h *History) GetNodePropagation(nodeID string) []int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()

	prop := make([]int64, MaxPeerPropagation)
	for i := range prop {
		prop[i] = -1
	}
	best := h.bestBlockNumber()
	lastBlocktime := nowMs()

	count := MaxPeerPropagation
	if len(h.items) < count {
		count = len(h.items)
	}

	for k := 0; k < count; k++ {
		item := h.items[k]
		idx := MaxPeerPropagation - 1 - int(best-item.Height)
		if idx < 0 {
			continue
		}
		found := false
		for _, p := range item.PropagTimes {
			if p.Node == nodeID {
				prop[idx] = p.Propagation
				lastBlocktime = item.Block.Arrived
				found = true
				break
			}
		}
		if !found {
			prop[idx] = max64(0, lastBlocktime-item.Block.Arrived)
		}
	}
	return prop
}

func (h *History) GetChartsData() ChartsData {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.buildChartsData()
}

func (h *History) buildChartsData() ChartsData {
	count := MaxBins
	if len(h.items) < count {
		count = len(h.items)
	}

	heights := make([]int64, count)
	blocktimes := make([]float64, count)
	difficulties := make([]interface{}, count)
	unclesCnt := make([]int, count)
	transactions := make([]int, count)
	gasSpending := make([]interface{}, count)
	gasLimit := make([]interface{}, count)

	for i := 0; i < count; i++ {
		ri := count - 1 - i
		item := h.items[i]
		heights[ri] = item.Height
		blocktimes[ri] = float64(item.Block.Time) / 1000.0
		difficulties[ri] = item.Block.Difficulty
		unclesCnt[ri] = len(item.Block.Uncles)
		transactions[ri] = len(item.Block.Transactions)
		gasSpending[ri] = item.Block.GasUsed
		gasLimit[ri] = item.Block.GasLimit
	}

	var totalBlocktime, totalTransactions float64
	for i := range blocktimes {
		totalBlocktime += blocktimes[i]
		totalTransactions += float64(transactions[i])
	}
	denom := float64(count)
	if denom == 0 {
		denom = 1
	}
	avgBlocktime := totalBlocktime / denom
	var avgTxRate float64
	if totalBlocktime > 0 {
		avgTxRate = totalTransactions / totalBlocktime
	}

	return ChartsData{
		Height:             heights,
		Blocktime:          blocktimes,
		AvgBlocktime:       avgBlocktime,
		AvgTransactionRate: avgTxRate,
		AvgHashrate:        h.getAvgHashrate(),
		Difficulty:         difficulties,
		Uncles:             unclesCnt,
		Transactions:       transactions,
		GasSpending:        gasSpending,
		GasLimit:           gasLimit,
		Miners:             h.getMinersCount(),
		Propagation:        h.getBlockPropagation(),
		UncleCount:         h.getUncleCount(),
	}
}

func (h *History) getAvgHashrate() float64 {
	if len(h.items) == 0 {
		return 0
	}
	count := 64
	if len(h.items) < count {
		count = len(h.items)
	}
	var sumTime float64
	for i := 0; i < count; i++ {
		sumTime += float64(h.items[i].Block.Time)
	}
	avgTime := sumTime / float64(count) / 1_000_000.0
	if avgTime == 0 {
		return 0
	}
	diff := node.ToFloat64(h.items[0].Block.Difficulty)
	return diff / avgTime
}

func (h *History) getMinersCount() []MinerCount {
	count := MaxBins
	if len(h.items) < count {
		count = len(h.items)
	}
	minerMap := make(map[string]int)
	for i := 0; i < count; i++ {
		m := h.items[i].Block.Miner
		if m != "" {
			minerMap[m]++
		}
	}
	result := make([]MinerCount, 0, len(minerMap))
	for miner, blocks := range minerMap {
		result = append(result, MinerCount{Miner: miner, Blocks: blocks})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Blocks > result[j].Blocks
	})
	if len(result) > 2 {
		result = result[:2]
	}
	return result
}

func (h *History) getBlockPropagation() PropagChart {
	var propagations []int64
	for _, item := range h.items {
		for _, p := range item.PropagTimes {
			v := p.Propagation
			if v < 0 {
				continue
			}
			if v > MaxPropagation {
				v = MaxPropagation
			}
			propagations = append(propagations, v)
		}
	}
	var avg int64
	if len(propagations) > 0 {
		var sum int64
		for _, v := range propagations {
			sum += v
		}
		avg = sum / int64(len(propagations))
	}
	return PropagChart{
		Histogram: buildHistogram(propagations, MinPropagation, MaxPropagation, MaxBins),
		Avg:       avg,
	}
}

func buildHistogram(data []int64, rangeMin, rangeMax int64, bins int) []PropagBin {
	if bins <= 0 {
		return nil
	}
	dx := float64(rangeMax-rangeMin) / float64(bins)
	counts := make([]int, bins)
	for _, v := range data {
		if v < rangeMin || v >= rangeMax {
			continue
		}
		idx := int(float64(v-rangeMin) / dx)
		if idx >= bins {
			idx = bins - 1
		}
		counts[idx]++
	}
	total := len(data)
	result := make([]PropagBin, bins)
	cumFreq := 0
	for i := 0; i < bins; i++ {
		cumFreq += counts[i]
		cumPct := 0.0
		if total > 0 {
			cumPct = float64(cumFreq) / float64(total)
		}
		density := 0.0
		if total > 0 && dx > 0 {
			density = float64(counts[i]) / float64(total) / dx
		}
		result[i] = PropagBin{
			X: float64(rangeMin) + float64(i)*dx, Dx: dx, Y: density,
			Frequency: counts[i], Cumulative: cumFreq, CumPercent: cumPct,
		}
	}
	return result
}

func (h *History) getUncleCount() []int {
	count := MaxUncles
	if len(h.items) < count {
		count = len(h.items)
	}
	uncleList := make([]int, count)
	for i := 0; i < count; i++ {
		uncleList[i] = len(h.items[i].Block.Uncles)
	}
	result := make([]int, MaxBins)
	for i := 0; i < MaxBins; i++ {
		start := i * MaxUnclesPerBin
		end := start + MaxUnclesPerBin
		if start >= len(uncleList) {
			break
		}
		if end > len(uncleList) {
			end = len(uncleList)
		}
		for _, v := range uncleList[start:end] {
			result[i] += v
		}
	}
	return result
}

func (h *History) GetMetricHistory(metric string, limit int) *MetricHistory {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if limit > MaxHistory {
		limit = MaxHistory
	}
	count := len(h.items)
	if count > limit {
		count = limit
	}

	heights := make([]int64, count)
	values := make([]float64, count)

	for i := 0; i < count; i++ {
		ri := count - 1 - i
		item := h.items[i]
		heights[ri] = item.Height
		switch metric {
		case "blocktime":
			values[ri] = float64(item.Block.Time) / 1000.0
		case "transactions":
			values[ri] = float64(len(item.Block.Transactions))
		case "gasUsed":
			values[ri] = node.ToFloat64(item.Block.GasUsed)
		default:
			return nil
		}
	}
	return &MetricHistory{Heights: heights, Values: values, Count: count}
}

func (h *History) Len() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.items)
}

func compareBlocks(b1, b2 node.BlockInfo) bool {
	return b1.Hash == b2.Hash &&
		b1.ParentHash == b2.ParentHash &&
		b1.SHA3Uncles == b2.SHA3Uncles &&
		b1.TransactionsRoot == b2.TransactionsRoot &&
		b1.StateRoot == b2.StateRoot &&
		b1.Miner == b2.Miner
}

func compareForks(item *HistoryItem, block node.BlockInfo) int {
	for i, f := range item.Forks {
		if compareBlocks(f, block) {
			return i
		}
	}
	return -1
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
