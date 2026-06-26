package rlpx

import (
	"errors"

	xdp2p "github.com/XinFinOrg/XDPoSChain/p2p"
)

// DialOutcome is the classified result of one TCP RLPx probe.
type DialOutcome struct {
	Outcome Outcome
	RTT     int64 // milliseconds; set when OutcomeOK
	Message string
}

// Outcome classifies a single dial attempt.
type Outcome int

const (
	OutcomeOK Outcome = iota
	OutcomeWarning
	OutcomeFail
)

func classifyDial(err error) DialOutcome {
	if err == nil {
		return DialOutcome{Outcome: OutcomeOK}
	}

	var reason xdp2p.DiscReason
	if !errors.As(err, &reason) {
		return DialOutcome{Outcome: OutcomeFail, Message: err.Error()}
	}

	switch reason {
	case xdp2p.DiscTooManyPeers,
		xdp2p.DiscUselessPeer,
		xdp2p.DiscRequested,
		xdp2p.DiscAlreadyConnected,
		xdp2p.DiscNonAllowlistedPeer,
		xdp2p.DiscPairPeerStop:
		return DialOutcome{Outcome: OutcomeOK, Message: reason.String()}

	case xdp2p.DiscQuitting,
		xdp2p.DiscIncompatibleVersion,
		xdp2p.DiscInvalidIdentity,
		xdp2p.DiscUnexpectedIdentity:
		return DialOutcome{Outcome: OutcomeWarning, Message: reason.String()}

	default:
		return DialOutcome{Outcome: OutcomeFail, Message: reason.String()}
	}
}
