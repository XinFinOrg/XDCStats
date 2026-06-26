package discv4

import (
	"net"
	"time"

	"github.com/XinFinOrg/XDPoSChain/crypto"
	"github.com/XinFinOrg/XDPoSChain/p2p/discover"
	"github.com/XinFinOrg/XDPoSChain/p2p/enode"
)

// ErrTimeout is returned when no pong is received in time.
var ErrTimeout = discover.ErrTimeout

// Client sends XDC discv4 pings via the XDPoSChain discovery protocol.
type Client struct {
	tab  *discover.Table
	conn *net.UDPConn
	db   *enode.DB
}

// NewClient binds an ephemeral UDP socket for discovery probes.
func NewClient() (*Client, error) {
	key, err := crypto.GenerateKey()
	if err != nil {
		return nil, err
	}
	conn, err := net.ListenPacket("udp4", "0.0.0.0:0")
	if err != nil {
		return nil, err
	}
	udpConn := conn.(*net.UDPConn)
	db, err := enode.OpenDB("")
	if err != nil {
		conn.Close()
		return nil, err
	}
	ln := enode.NewLocalNode(db, key)
	tab, err := discover.ListenUDP(udpConn, ln, discover.Config{PrivateKey: key})
	if err != nil {
		conn.Close()
		db.Close()
		return nil, err
	}
	return &Client{tab: tab, conn: udpConn, db: db}, nil
}

// Close releases the UDP socket and discovery table.
func (c *Client) Close() error {
	c.tab.Close()
	c.conn.Close()
	c.db.Close()
	return nil
}

// Ping sends a single pingXDC to n and returns the RTT on success.
// The internal discovery timeout (500 ms) governs how long to wait for a pong.
func (c *Client) Ping(n *Node) (time.Duration, error) {
	if err := n.validate(); err != nil {
		return 0, err
	}
	target, err := enode.ParseV4(n.Enode())
	if err != nil {
		return 0, err
	}
	start := time.Now()
	if err := c.tab.Ping(target); err != nil {
		return 0, err
	}
	return time.Since(start), nil
}
