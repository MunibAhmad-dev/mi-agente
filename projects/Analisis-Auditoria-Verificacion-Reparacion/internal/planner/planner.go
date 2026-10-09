// Package planner implements the Verification Planner (spec §1):
// turns requirements/acceptance criteria into a concrete, bounded plan of
// verification steps executed by the pipeline.
package planner

import (
	"fmt"
	"sort"

	"verificationengine/internal/truthmodel"
)

// StepKind identifies the executor of a step.
type StepKind string

const (
	StepStatic     StepKind = "static"   // structural rules
	StepTest       StepKind = "test"     // go test adapter
	StepVet        StepKind = "vet"      // go vet adapter
	StepContract   StepKind = "contract" // contract engine
	StepProbe      StepKind = "probe"    // runtime probes
	StepSecurity   StepKind = "security" // scanners/secrets
	StepPerf       StepKind = "perf"     // budgets
	StepRegression StepKind = "regression"
)

// Step is one planned verification.
type Step struct {
	Kind          StepKind `json:"kind"`
	Target        string   `json:"target"`
	RequirementID string   `json:"requirement_id,omitempty"`
	Detail        string   `json:"detail,omitempty"`
}

// Plan is an ordered, deduplicated verification plan.
type Plan struct {
	RunID string `json:"run_id"`
	Steps []Step `json:"steps"`
}

// PlanFor builds the plan for a set of requirements plus global passes.
func PlanFor(runID string, reqs []truthmodel.Requirement, hasGoMod bool) *Plan {
	p := &Plan{RunID: runID}
	seen := map[Step]bool{}
	add := func(s Step) {
		if !seen[s] {
			seen[s] = true
			p.Steps = append(p.Steps, s)
		}
	}

	// Global passes always run (spec: never trust the builder).
	add(Step{Kind: StepStatic, Target: "project://all"})
	add(Step{Kind: StepSecurity, Target: "project://all"})
	if hasGoMod {
		add(Step{Kind: StepVet, Target: "project://all"})
		add(Step{Kind: StepTest, Target: "project://all"})
	}

	// Requirement acceptance criteria.
	for _, r := range reqs {
		for _, acc := range r.Acceptance {
			kind, detail, err := truthmodel.ParseAcceptanceVerification(acc.Verification)
			if err != nil {
				add(Step{Kind: StepStatic, Target: "acceptance:" + acc.ID,
					RequirementID: r.ID, Detail: "unverifiable acceptance: " + err.Error()})
				continue
			}
			st := Step{RequirementID: r.ID, Target: detail}
			switch kind {
			case "static":
				st.Kind = StepStatic
			case "test":
				st.Kind = StepTest
			case "probe":
				st.Kind = StepProbe
			case "contract":
				st.Kind = StepContract
			case "perf":
				st.Kind = StepPerf
			case "regression":
				st.Kind = StepRegression
			default:
				st.Kind = StepStatic
				st.Detail = fmt.Sprintf("unknown verification kind %q", kind)
			}
			add(st)
		}
	}
	sort.SliceStable(p.Steps, func(i, j int) bool {
		oi, oj := orderOf(p.Steps[i].Kind), orderOf(p.Steps[j].Kind)
		if oi != oj {
			return oi < oj
		}
		if p.Steps[i].Kind != p.Steps[j].Kind {
			return p.Steps[i].Kind < p.Steps[j].Kind
		}
		return p.Steps[i].Target < p.Steps[j].Target
	})
	return p
}

func orderOf(k StepKind) int {
	switch k {
	case StepStatic:
		return 0
	case StepVet:
		return 1
	case StepContract:
		return 2
	case StepTest:
		return 3
	case StepProbe:
		return 4
	case StepSecurity:
		return 5
	case StepPerf:
		return 6
	case StepRegression:
		return 7
	}
	return 8
}

// Validate ensures the plan is bounded (no zero steps, no duplicates).
func (p *Plan) Validate() error {
	if len(p.Steps) == 0 {
		return fmt.Errorf("empty verification plan — refusing to certify (NO EVIDENCE = NO VERIFIED IMPLEMENTATION)")
	}
	seen := map[Step]bool{}
	for _, s := range p.Steps {
		if seen[s] {
			return fmt.Errorf("duplicate step %v", s)
		}
		seen[s] = true
	}
	return nil
}
