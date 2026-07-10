package probe

import "time"

// Error kinds surfaced in API responses.
const (
	KindLocal       = "local"       // probe client failed (bind, init, etc.)
	KindUnreachable = "unreachable" // bootnode did not respond
	KindWarning     = "warning"     // reachable but degraded (e.g. protocol mismatch)
)

const (
	DefaultAttempts   = 3
	DefaultMinSuccess = 2
)

// Outcome is the result of one probe attempt.
type Outcome int

const (
	OutcomeOK Outcome = iota
	OutcomeWarning
	OutcomeFail
)

// Attempt holds one probe try.
type Attempt struct {
	Outcome Outcome
	RTT     time.Duration
	Message string
}

// Summary is the aggregated result across multiple attempts.
type Summary struct {
	Healthy    bool
	RTTMs      int64
	Error      string
	ErrorKind  string
	Probes     int
	ProbeFails int
}

// Aggregate applies a "minSuccess of attempts" rule (default: 2 of 3).
func Aggregate(attempts []Attempt, minSuccess int) Summary {
	if minSuccess < 1 {
		minSuccess = 1
	}
	n := len(attempts)
	if n == 0 {
		return Summary{ErrorKind: KindUnreachable, Error: "no probe attempts"}
	}

	var ok, warn, fail int
	var rttSum time.Duration
	for _, a := range attempts {
		switch a.Outcome {
		case OutcomeOK:
			ok++
			rttSum += a.RTT
		case OutcomeWarning:
			warn++
		case OutcomeFail:
			fail++
		}
	}

	s := Summary{
		Probes:     n,
		ProbeFails: fail + warn,
	}

	if ok >= minSuccess {
		s.Healthy = true
		if ok > 0 {
			s.RTTMs = (rttSum / time.Duration(ok)).Milliseconds()
		}
		return s
	}

	// Unhealthy — pick the most representative error message.
	if warn >= minSuccess {
		s.ErrorKind = KindWarning
		s.Error = lastMessage(attempts, OutcomeWarning)
		return s
	}
	s.ErrorKind = KindUnreachable
	s.Error = lastMessage(attempts, OutcomeFail)
	if s.Error == "" {
		s.Error = lastMessage(attempts, OutcomeWarning)
	}
	if s.Error == "" {
		s.Error = "probe failed"
	}
	return s
}

// LocalSummary reports a probe infrastructure failure.
func LocalSummary(err error) Summary {
	return Summary{
		ErrorKind: KindLocal,
		Error:     err.Error(),
	}
}

func lastMessage(attempts []Attempt, want Outcome) string {
	for i := len(attempts) - 1; i >= 0; i-- {
		if attempts[i].Outcome == want && attempts[i].Message != "" {
			return attempts[i].Message
		}
	}
	return ""
}
