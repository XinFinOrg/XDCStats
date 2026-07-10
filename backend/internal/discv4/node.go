package discv4

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strconv"
)

// NodeID is a marshaled secp256k1 public key (512 bits).
type NodeID [64]byte

// Node is a complete discv4 node endpoint.
type Node struct {
	IP       net.IP
	UDP, TCP uint16
	ID       NodeID
}

func (n *Node) UDPAddr() *net.UDPAddr {
	return &net.UDPAddr{IP: n.IP, Port: int(n.UDP)}
}

func (n *Node) Endpoint() string {
	if n.UDP == n.TCP {
		return fmt.Sprintf("%s:%d", n.IP, n.TCP)
	}
	return fmt.Sprintf("%s:%d", n.IP, n.UDP)
}

func (n *Node) TCPEndpoint() string {
	return fmt.Sprintf("%s:%d", n.IP, n.TCP)
}

func (n *Node) Enode() string {
	u := url.URL{Scheme: "enode"}
	addr := net.TCPAddr{IP: n.IP, Port: int(n.TCP)}
	u.User = url.User(fmt.Sprintf("%x", n.ID[:]))
	u.Host = addr.String()
	if n.UDP != n.TCP {
		u.RawQuery = "discport=" + strconv.Itoa(int(n.UDP))
	}
	return u.String()
}

func (n *Node) validate() error {
	if n.IP == nil {
		return errors.New("incomplete node")
	}
	if n.UDP == 0 || n.TCP == 0 {
		return errors.New("missing port")
	}
	if n.IP.IsMulticast() || n.IP.IsUnspecified() {
		return errors.New("invalid IP")
	}
	return nil
}

var incompleteNodeURL = regexp.MustCompile(`(?i)^(?:enode://)?([0-9a-f]+)$`)

// ParseNode parses an enode URL.
func ParseNode(rawurl string) (*Node, error) {
	if m := incompleteNodeURL.FindStringSubmatch(rawurl); m != nil {
		id, err := hexID(m[1])
		if err != nil {
			return nil, fmt.Errorf("invalid node ID: %w", err)
		}
		return &Node{ID: id}, nil
	}
	return parseComplete(rawurl)
}

func parseComplete(rawurl string) (*Node, error) {
	u, err := url.Parse(rawurl)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "enode" {
		return nil, errors.New(`invalid URL scheme, want "enode"`)
	}
	if u.User == nil {
		return nil, errors.New("does not contain node ID")
	}
	var id NodeID
	if id, err = hexID(u.User.String()); err != nil {
		return nil, fmt.Errorf("invalid node ID: %w", err)
	}
	host, port, err := net.SplitHostPort(u.Host)
	if err != nil {
		return nil, fmt.Errorf("invalid host: %w", err)
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return nil, errors.New("invalid IP address")
	}
	if ipv4 := ip.To4(); ipv4 != nil {
		ip = ipv4
	}
	tcpPort, err := strconv.ParseUint(port, 10, 16)
	if err != nil {
		return nil, errors.New("invalid port")
	}
	udpPort := tcpPort
	if qv := u.Query().Get("discport"); qv != "" {
		udpPort, err = strconv.ParseUint(qv, 10, 16)
		if err != nil {
			return nil, errors.New("invalid discport")
		}
	}
	n := &Node{ID: id, IP: ip, UDP: uint16(udpPort), TCP: uint16(tcpPort)}
	return n, n.validate()
}

func hexID(in string) (NodeID, error) {
	var id NodeID
	b, err := decodeHex(in)
	if err != nil {
		return id, err
	}
	if len(b) != len(id) {
		return id, fmt.Errorf("wrong length, want %d hex chars", len(id)*2)
	}
	copy(id[:], b)
	return id, nil
}

func decodeHex(in string) ([]byte, error) {
	if len(in)%2 != 0 {
		return nil, errors.New("odd length hex string")
	}
	out := make([]byte, len(in)/2)
	for i := 0; i < len(in); i += 2 {
		var b byte
		for j := 0; j < 2; j++ {
			c := in[i+j]
			switch {
			case c >= '0' && c <= '9':
				b = b<<4 | (c - '0')
			case c >= 'a' && c <= 'f':
				b = b<<4 | (c - 'a' + 10)
			case c >= 'A' && c <= 'F':
				b = b<<4 | (c - 'A' + 10)
			default:
				return nil, errors.New("invalid hex character")
			}
		}
		out[i/2] = b
	}
	return out, nil
}
