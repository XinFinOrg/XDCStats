package rlpx

import (
	"testing"

	xdp2p "github.com/XinFinOrg/XDPoSChain/p2p"
)

func TestClassifyDial(t *testing.T) {
	tests := []struct {
		err      error
		want     Outcome
		contains string
	}{
		{nil, OutcomeOK, ""},
		{xdp2p.DiscTooManyPeers, OutcomeOK, "too many peers"},
		{xdp2p.DiscUselessPeer, OutcomeOK, "useless peer"},
		{xdp2p.DiscQuitting, OutcomeWarning, "quitting"},
		{xdp2p.DiscIncompatibleVersion, OutcomeWarning, "incompatible"},
		{xdp2p.DiscInvalidIdentity, OutcomeWarning, "invalid node identity"},
		{xdp2p.DiscNetworkError, OutcomeFail, "network error"},
		{xdp2p.DiscReadTimeout, OutcomeFail, "read timeout"},
	}
	for _, tt := range tests {
		got := classifyDial(tt.err)
		if got.Outcome != tt.want {
			t.Fatalf("classifyDial(%v) outcome = %d, want %d", tt.err, got.Outcome, tt.want)
		}
		if tt.contains != "" && got.Message == "" {
			t.Fatalf("classifyDial(%v) empty message", tt.err)
		}
	}
}
