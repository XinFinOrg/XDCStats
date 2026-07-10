package service

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/XinFinOrg/XDCStats/backend/internal/discv4"
	"github.com/XinFinOrg/XDCStats/backend/internal/probe"
	"github.com/XinFinOrg/XDCStats/backend/internal/rlpx"
)

// BootnodeStatus is the UDP/TCP health result for one bootnode.
type BootnodeStatus struct {
	Index         int    `json:"index"`
	Enode         string `json:"enode"`
	Endpoint      string `json:"endpoint"`
	TcpEndpoint   string `json:"tcpEndpoint"`
	NodeID        string `json:"nodeId"`
	Healthy       bool   `json:"healthy"`
	RTTMs         int64  `json:"rttMs,omitempty"`
	Error         string `json:"error,omitempty"`
	ErrorKind     string `json:"errorKind,omitempty"`
	Probes        int    `json:"probes,omitempty"`
	ProbeFails    int    `json:"probeFails,omitempty"`
	TcpHealthy    bool   `json:"tcpHealthy"`
	TcpRTTMs      int64  `json:"tcpRttMs,omitempty"`
	TcpError      string `json:"tcpError,omitempty"`
	TcpErrorKind  string `json:"tcpErrorKind,omitempty"`
	TcpProbes     int    `json:"tcpProbes,omitempty"`
	TcpProbeFails int    `json:"tcpProbeFails,omitempty"`
	CheckedAt     string `json:"checkedAt"`
}

// BootnodeHealthReport is the latest bootnode probe snapshot.
type BootnodeHealthReport struct {
	Total        int              `json:"total"`
	Healthy      int              `json:"healthy"`
	Unhealthy    int              `json:"unhealthy"`
	TcpHealthy   int              `json:"tcpHealthy"`
	TcpUnhealthy int              `json:"tcpUnhealthy"`
	CheckedAt    string           `json:"checkedAt"`
	Duration     string           `json:"duration"`
	Bootnodes    []BootnodeStatus `json:"bootnodes"`
}

type workerClients struct {
	udp     *discv4.Client
	tcp     *rlpx.Client
	udpInit error
	tcpInit error
}

// BootnodeChecker periodically probes bootnodes over UDP discv4 and TCP RLPx.
type BootnodeChecker struct {
	loadNodes  func() ([]*discv4.Node, error)
	timeout    time.Duration
	parallel   int
	attempts   int
	minSuccess int

	mu      sync.RWMutex
	report  BootnodeHealthReport
	running bool
}

// NewBootnodeChecker creates a checker that reloads the bootnode list before each check.
func NewBootnodeChecker(loadNodes func() ([]*discv4.Node, error), timeout time.Duration, parallel int) *BootnodeChecker {
	if parallel < 1 {
		parallel = 1
	}
	return &BootnodeChecker{
		loadNodes:  loadNodes,
		timeout:    timeout,
		parallel:   parallel,
		attempts:   probe.DefaultAttempts,
		minSuccess: probe.DefaultMinSuccess,
	}
}

// Run starts the periodic checker until ctx is cancelled. It performs an
// immediate check on startup.
func (c *BootnodeChecker) Run(ctx context.Context, interval time.Duration) {
	c.checkAll()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.checkAll()
		}
	}
}

// CheckNow triggers a synchronous health check.
func (c *BootnodeChecker) CheckNow() {
	c.checkAll()
}

// Snapshot returns the latest health report.
func (c *BootnodeChecker) Snapshot() BootnodeHealthReport {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.report
}

func (c *BootnodeChecker) checkAll() {
	c.mu.Lock()
	if c.running {
		c.mu.Unlock()
		return
	}
	c.running = true
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		c.running = false
		c.mu.Unlock()
	}()

	nodes, err := c.loadNodes()
	if err != nil {
		slog.Error("load bootnodes failed", "err", err)
		return
	}
	if len(nodes) == 0 {
		slog.Warn("no bootnodes loaded")
		return
	}

	start := time.Now()
	results := make([]BootnodeStatus, len(nodes))

	type job struct {
		index int
		node  *discv4.Node
	}
	jobs := make(chan job)

	clients := make([]workerClients, c.parallel)
	for i := 0; i < c.parallel; i++ {
		clients[i].udp, clients[i].udpInit = discv4.NewClient()
		clients[i].tcp, clients[i].tcpInit = rlpx.NewClient()
	}
	defer func() {
		for _, wc := range clients {
			if wc.udp != nil {
				wc.udp.Close()
			}
			if wc.tcp != nil {
				wc.tcp.Close()
			}
		}
	}()

	var wg sync.WaitGroup
	worker := func(wc workerClients) {
		defer wg.Done()
		for j := range jobs {
			status := BootnodeStatus{
				Index:       j.index + 1,
				Enode:       j.node.Enode(),
				Endpoint:    j.node.Endpoint(),
				TcpEndpoint: j.node.TCPEndpoint(),
				NodeID:      formatNodeID(j.node.ID),
				CheckedAt:   time.Now().UTC().Format(time.RFC3339),
			}

			var probeWG sync.WaitGroup
			probeWG.Add(2)

			go func() {
				defer probeWG.Done()
				applyProbeSummary(&status, probeUDP(wc, j.node, c.timeout, c.attempts, c.minSuccess))
			}()

			go func() {
				defer probeWG.Done()
				applyTCPProbeSummary(&status, probeTCP(wc, j.node, c.timeout, c.attempts, c.minSuccess))
			}()

			probeWG.Wait()
			results[j.index] = status
		}
	}

	for i := 0; i < c.parallel; i++ {
		wg.Add(1)
		go worker(clients[i])
	}
	for i, n := range nodes {
		jobs <- job{index: i, node: n}
	}
	close(jobs)
	wg.Wait()

	c.storeReport(results, start)
}

func probeUDP(wc workerClients, n *discv4.Node, timeout time.Duration, attempts, minSuccess int) probe.Summary {
	if wc.udpInit != nil {
		return probe.LocalSummary(wc.udpInit)
	}

	tries := make([]probe.Attempt, 0, attempts)
	for i := 0; i < attempts; i++ {
		if i > 0 {
			time.Sleep(150 * time.Millisecond)
		}
		rtt, err := wc.udp.Ping(n)
		if err == nil {
			tries = append(tries, probe.Attempt{Outcome: probe.OutcomeOK, RTT: rtt})
			continue
		}
		tries = append(tries, probe.Attempt{Outcome: probe.OutcomeFail, Message: err.Error()})
	}
	return probe.Aggregate(tries, minSuccess)
}

func probeTCP(wc workerClients, n *discv4.Node, timeout time.Duration, attempts, minSuccess int) probe.Summary {
	if wc.tcpInit != nil {
		return probe.LocalSummary(wc.tcpInit)
	}
	perProbe := timeout / time.Duration(attempts)
	if perProbe < time.Second {
		perProbe = time.Second
	}

	tries := make([]probe.Attempt, 0, attempts)
	for i := 0; i < attempts; i++ {
		if i > 0 {
			time.Sleep(150 * time.Millisecond)
		}
		out := wc.tcp.Dial(n, perProbe)
		switch out.Outcome {
		case rlpx.OutcomeOK:
			tries = append(tries, probe.Attempt{
				Outcome: probe.OutcomeOK,
				RTT:     time.Duration(out.RTT) * time.Millisecond,
			})
		case rlpx.OutcomeWarning:
			tries = append(tries, probe.Attempt{
				Outcome: probe.OutcomeWarning,
				Message: out.Message,
			})
		default:
			tries = append(tries, probe.Attempt{
				Outcome: probe.OutcomeFail,
				Message: out.Message,
			})
		}
	}
	return probe.Aggregate(tries, minSuccess)
}

func applyProbeSummary(status *BootnodeStatus, s probe.Summary) {
	status.Healthy = s.Healthy
	status.RTTMs = s.RTTMs
	status.Error = s.Error
	status.ErrorKind = s.ErrorKind
	status.Probes = s.Probes
	status.ProbeFails = s.ProbeFails
}

func applyTCPProbeSummary(status *BootnodeStatus, s probe.Summary) {
	status.TcpHealthy = s.Healthy
	status.TcpRTTMs = s.RTTMs
	status.TcpError = s.Error
	status.TcpErrorKind = s.ErrorKind
	status.TcpProbes = s.Probes
	status.TcpProbeFails = s.ProbeFails
}

func (c *BootnodeChecker) storeReport(results []BootnodeStatus, start time.Time) {
	healthy := 0
	tcpHealthy := 0
	for _, r := range results {
		if r.Healthy {
			healthy++
		}
		if r.TcpHealthy {
			tcpHealthy++
		}
	}

	report := BootnodeHealthReport{
		Total:        len(results),
		Healthy:      healthy,
		Unhealthy:    len(results) - healthy,
		TcpHealthy:   tcpHealthy,
		TcpUnhealthy: len(results) - tcpHealthy,
		CheckedAt:    time.Now().UTC().Format(time.RFC3339),
		Duration:     time.Since(start).Round(time.Millisecond).String(),
		Bootnodes:    results,
	}

	c.mu.Lock()
	c.report = report
	c.mu.Unlock()

	slog.Info("bootnode health check complete",
		"total", report.Total,
		"udp_healthy", report.Healthy,
		"udp_unhealthy", report.Unhealthy,
		"tcp_healthy", report.TcpHealthy,
		"tcp_unhealthy", report.TcpUnhealthy,
		"duration", report.Duration,
	)
}

func formatNodeID(id discv4.NodeID) string {
	return fmtHex(id[:])
}

func fmtHex(b []byte) string {
	const hexdigits = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = hexdigits[v>>4]
		out[i*2+1] = hexdigits[v&0x0f]
	}
	return string(out)
}
