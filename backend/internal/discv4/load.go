package discv4

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	// MainnetBootnodesURL is the official XDC mainnet bootnode list in XinFin-Node.
	MainnetBootnodesURL = "https://raw.githubusercontent.com/XinFinOrg/XinFin-Node/master/mainnet/bootnodes.list"
	// TestnetBootnodesURL is the official XDC testnet (Apothem) bootnode list in XinFin-Node.
	TestnetBootnodesURL = "https://raw.githubusercontent.com/XinFinOrg/XinFin-Node/master/testnet/bootnodes.list"
)

// LoadNodesFromFile reads and parses a local bootnodes.list file.
func LoadNodesFromFile(path string) ([]*Node, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()
	return parseNodes(f, path)
}

// LoadNodesFromURL fetches and parses a bootnodes.list file from url.
func LoadNodesFromURL(url string) ([]*Node, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch %s: HTTP %s", url, resp.Status)
	}
	return parseNodes(resp.Body, url)
}

func parseNodes(r io.Reader, source string) ([]*Node, error) {
	var nodes []*Node
	sc := bufio.NewScanner(r)
	lineNo := 0
	for sc.Scan() {
		lineNo++
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		n, err := ParseNode(line)
		if err != nil {
			return nil, fmt.Errorf("%s:%d: %w", source, lineNo, err)
		}
		nodes = append(nodes, n)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if len(nodes) == 0 {
		return nil, fmt.Errorf("%s: no bootnodes found", source)
	}
	return nodes, nil
}
