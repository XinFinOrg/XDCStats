package service

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/XinFinOrg/XDCStats/backend/config"
	"github.com/XinFinOrg/XDCStats/backend/internal/discv4"
)

func TestBootnodesURLForNetwork(t *testing.T) {
	tests := []struct {
		network string
		want    string
	}{
		{"mainnet", discv4.MainnetBootnodesURL},
		{"", discv4.MainnetBootnodesURL},
		{"testnet", discv4.TestnetBootnodesURL},
	}
	for _, tt := range tests {
		got, err := BootnodesURLForNetwork(tt.network)
		if err != nil {
			t.Fatalf("network %q: %v", tt.network, err)
		}
		if got != tt.want {
			t.Fatalf("network %q: got %q, want %q", tt.network, got, tt.want)
		}
	}
	if _, err := BootnodesURLForNetwork("devnet"); err == nil {
		t.Fatal("expected error for devnet URL lookup")
	}

	nodes, err := loadDevnetBootnodes()
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 {
		t.Fatalf("devnet: got %d nodes, want 1", len(nodes))
	}
	if nodes[0].Endpoint() != "10.0.0.1:30303" {
		t.Fatalf("devnet endpoint: got %q, want 10.0.0.1:30303", nodes[0].Endpoint())
	}
}

func TestLoadBootnodesFromFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bootnodes.list")
	content := "enode://b5c052b3956a92ff3429e4f09e28e0a464ab7d0e690ab9854de8a3ab9f14715c93d22ef112264256bb844f710f06d7327a187a35e4ce2b5b111427e4b219cce2@10.43.197.209:30301\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	nodes, err := LoadBootnodes(&config.Config{
		EnableBootnodeHealth: true,
		BootnodeListFile:     path,
		BootnodeNetwork:      "mainnet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 {
		t.Fatalf("got %d nodes, want 1", len(nodes))
	}
	if nodes[0].Endpoint() != "10.43.197.209:30301" {
		t.Fatalf("endpoint: got %q, want 10.43.197.209:30301", nodes[0].Endpoint())
	}
}
