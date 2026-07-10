package rlpx

import (
	"errors"
	"fmt"
	"net"
	"strconv"
	"syscall"
	"time"

	"github.com/XinFinOrg/XDCStats/backend/internal/discv4"
	"github.com/XinFinOrg/XDPoSChain/crypto"
	xdp2p "github.com/XinFinOrg/XDPoSChain/p2p"
	"github.com/XinFinOrg/XDPoSChain/p2p/enode"
)

// Client probes bootnodes over TCP using the RLPx handshake.
type Client struct {
	srv *xdp2p.Server
}

// NewClient starts a minimal p2p server used for outbound RLPx probes.
func NewClient() (*Client, error) {
	key, err := crypto.GenerateKey()
	if err != nil {
		return nil, err
	}
	srv := &xdp2p.Server{
		Config: xdp2p.Config{
			PrivateKey:  key,
			MaxPeers:    1,
			Name:        "xdcstats-probe",
			ListenAddr:  ":0",
			NoDiscovery: true,
		},
	}
	if err := srv.Start(); err != nil {
		return nil, err
	}
	return &Client{srv: srv}, nil
}

// Close stops the probe server.
func (c *Client) Close() {
	c.srv.Stop()
}

// Dial connects to n over TCP, performs an RLPx handshake probe, and classifies the result.
func (c *Client) Dial(n *discv4.Node, timeout time.Duration) DialOutcome {
	target, err := enode.ParseV4(n.Enode())
	if err != nil {
		return DialOutcome{Outcome: OutcomeFail, Message: err.Error()}
	}

	start := time.Now()
	addr := net.JoinHostPort(n.IP.String(), strconv.Itoa(int(n.TCP)))
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return DialOutcome{Outcome: OutcomeFail, Message: formatDialError(err).Error()}
	}
	defer conn.Close()

	remaining := timeout - time.Since(start)
	if remaining <= 0 {
		return DialOutcome{Outcome: OutcomeFail, Message: "timeout"}
	}
	_ = conn.SetDeadline(time.Now().Add(remaining))

	err = c.srv.SetupConn(conn, 0, target)
	out := classifyDial(err)
	if out.Outcome == OutcomeOK {
		out.RTT = time.Since(start).Milliseconds()
		if err == nil {
			for _, p := range c.srv.Peers() {
				p.Disconnect(xdp2p.DiscQuitting)
			}
		}
	}
	return out
}

func formatDialError(err error) error {
	if errors.Is(err, syscall.ECONNREFUSED) {
		return fmt.Errorf("connection refused")
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return fmt.Errorf("timeout")
	}
	return err
}
