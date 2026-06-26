package probe

import (
	"testing"
	"time"
)

func TestAggregate_twoOfThree(t *testing.T) {
	attempts := []Attempt{
		{Outcome: OutcomeFail, Message: "timeout"},
		{Outcome: OutcomeOK, RTT: 100 * time.Millisecond},
		{Outcome: OutcomeOK, RTT: 200 * time.Millisecond},
	}
	s := Aggregate(attempts, 2)
	if !s.Healthy {
		t.Fatal("expected healthy with 2/3 successes")
	}
	if s.RTTMs != 150 {
		t.Fatalf("rttMs = %d, want 150", s.RTTMs)
	}
	if s.Probes != 3 || s.ProbeFails != 1 {
		t.Fatalf("probes=%d fails=%d", s.Probes, s.ProbeFails)
	}
}

func TestAggregate_twoOfThreeUnhealthy(t *testing.T) {
	attempts := []Attempt{
		{Outcome: OutcomeFail, Message: "timeout"},
		{Outcome: OutcomeFail, Message: "timeout"},
		{Outcome: OutcomeOK, RTT: 50 * time.Millisecond},
	}
	s := Aggregate(attempts, 2)
	if s.Healthy {
		t.Fatal("expected unhealthy with 2/3 failures")
	}
	if s.ErrorKind != KindUnreachable {
		t.Fatalf("errorKind = %q", s.ErrorKind)
	}
}

func TestAggregate_warningMajority(t *testing.T) {
	attempts := []Attempt{
		{Outcome: OutcomeWarning, Message: "incompatible p2p protocol version"},
		{Outcome: OutcomeWarning, Message: "incompatible p2p protocol version"},
		{Outcome: OutcomeFail, Message: "timeout"},
	}
	s := Aggregate(attempts, 2)
	if s.Healthy {
		t.Fatal("expected unhealthy")
	}
	if s.ErrorKind != KindWarning {
		t.Fatalf("errorKind = %q, want warning", s.ErrorKind)
	}
}
