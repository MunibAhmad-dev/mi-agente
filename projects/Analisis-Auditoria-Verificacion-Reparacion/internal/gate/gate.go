// Package gate implements the Quality Gate: PASS / FAIL / INCONCLUSIVE from
// evidence, severity thresholds and maturity requirements per category (spec §9).
package gate

import (
	"fmt"

	"verificationengine/internal/core"
	"verificationengine/internal/truthmodel"
)

// Config tunes the gate.
type Config struct {
	// MaxSeverity allowed for PASS (findings above this force FAIL).
	MaxSeverity core.Severity
	// RequireMaturity maps entity types to minimum maturity for PASS.
	RequireMaturity map[truthmodel.EntityType]core.Maturity
	// RequireTraceVerified forces every requirement row to be VERIFIED for PASS.
	RequireTraceVerified bool
}

// DefaultConfig returns a sane gate: no CRITICAL/HIGH, runtime-verified APIs.
func DefaultConfig() Config {
	return Config{
		MaxSeverity: core.SevMedium,
		RequireMaturity: map[truthmodel.EntityType]core.Maturity{
			truthmodel.EntityRoute: core.L6RuntimeVerified,
			truthmodel.EntityAPI:   core.L6RuntimeVerified,
		},
		RequireTraceVerified: true,
	}
}

// Decision is the gate outcome.
type Decision string

const (
	Pass         Decision = "PASS"
	Fail         Decision = "FAIL"
	Inconclusive Decision = "INCONCLUSIVE"
)

// Result of the gate evaluation.
type Result struct {
	Decision Decision        `json:"decision"`
	Reasons  []string        `json:"reasons"`
	Blocking []core.Evidence `json:"blocking,omitempty"`
}

// Evaluate applies the gate to evidence + truth model.
func Evaluate(cfg Config, evs []core.Evidence, model *truthmodel.Model) Result {
	res := Result{Decision: Pass}

	blockOn := func(ev core.Evidence, reason string) {
		if res.Decision != Fail {
			res.Decision = Fail
			res.Reasons = nil
		}
		res.Reasons = append(res.Reasons, reason)
		res.Blocking = append(res.Blocking, ev)
	}

	// 1. Severity threshold.
	for _, ev := range evs {
		if ev.Severity.Rank() > cfg.MaxSeverity.Rank() {
			blockOn(ev, fmt.Sprintf("%s finding %s exceeds gate severity %s: %s",
				ev.Severity, ev.ID, cfg.MaxSeverity, ev.Message))
		}
	}

	// 2. Maturity requirements.
	for etype, minM := range cfg.RequireMaturity {
		for _, e := range model.ByType(etype) {
			if e.Maturity < minM {
				blockOn(core.Evidence{ID: "GATE-" + e.ID, Target: e.ID, Message: e.Maturity.String()},
					fmt.Sprintf("%s %s at %s, requires %s", etype, e.ID, e.Maturity, minM))
			}
		}
	}

	// 3. Traceability completeness.
	if cfg.RequireTraceVerified {
		for _, row := range model.TraceMatrix() {
			if row.State != core.TraceVerified {
				blockOn(core.Evidence{ID: "GATE-TRACE-" + row.Requirement, Target: row.Requirement, Message: row.Reason},
					fmt.Sprintf("requirement %s trace state %s (%s)", row.Requirement, row.State, row.Reason))
			}
		}
	}

	// 4. Mandatory evidence — no evidence, no verified implementation.
	if len(evs) == 0 {
		res.Decision = Inconclusive
		res.Reasons = []string{"no evidence collected — NO EVIDENCE = NO VERIFIED IMPLEMENTATION"}
	}
	return res
}
