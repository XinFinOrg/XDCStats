package service

import (
	"fmt"
	"strings"

	"github.com/XinFinOrg/XDCStats/backend/config"
	"github.com/XinFinOrg/XDCStats/backend/internal/discv4"
)

// BootnodesURLForNetwork returns the XinFin-Node bootnodes.list URL for a network.
func BootnodesURLForNetwork(network string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(network)) {
	case "mainnet", "":
		return discv4.MainnetBootnodesURL, nil
	case "testnet":
		return discv4.TestnetBootnodesURL, nil
	case "devnet":
		return "", fmt.Errorf("devnet uses hardcoded bootnode (see devnetBootnode in bootnode_load.go)")
	default:
		return "", fmt.Errorf("unknown BOOTNODE_NETWORK %q (use mainnet, testnet, or devnet)", network)
	}
}

// TODO: replace devnet bootnode IP/enode with the official devnet bootnode when available.
const devnetBootnode = "enode://efc710050d65cda5d563fc6c9520986a69bbed81036b427a5ad7a2079bc8ba421e78d291a9388a1bd10ff5d9afdc2a095900528f5c45942104d818feda37cf7a@10.0.0.1:30303"

func loadDevnetBootnodes() ([]*discv4.Node, error) {
	n, err := discv4.ParseNode(devnetBootnode)
	if err != nil {
		return nil, err
	}
	return []*discv4.Node{n}, nil
}

// LoadBootnodes loads bootnodes from BOOTNODE_LIST_FILE, devnet defaults, or XinFin-Node GitHub lists.
func LoadBootnodes(cfg *config.Config) ([]*discv4.Node, error) {
	if !cfg.EnableBootnodeHealth {
		return nil, fmt.Errorf("bootnode health disabled")
	}
	if path := strings.TrimSpace(cfg.BootnodeListFile); path != "" {
		return discv4.LoadNodesFromFile(path)
	}
	if strings.EqualFold(strings.TrimSpace(cfg.BootnodeNetwork), "devnet") {
		return loadDevnetBootnodes()
	}
	url, err := BootnodesURLForNetwork(cfg.BootnodeNetwork)
	if err != nil {
		return nil, err
	}
	return discv4.LoadNodesFromURL(url)
}
