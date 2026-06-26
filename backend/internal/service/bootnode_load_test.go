package service

import (
	"testing"

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
