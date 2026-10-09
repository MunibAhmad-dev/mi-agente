package planner

import (
	"testing"

	"verificationengine/internal/truthmodel"
)

func TestPlanForGeneratesBoundedPlan(t *testing.T) {
	reqs := []truthmodel.Requirement{
		{
			ID: "REQ-1", Kind: truthmodel.ReqUserDefined, Description: "health",
			Acceptance: []truthmodel.Acceptance{
				{ID: "A1", Description: "health returns 200", Verification: "probe:GET http://localhost:8080/health"},
				{ID: "A2", Description: "no placeholders", Verification: "static:project://all"},
				{ID: "A3", Verification: "bogus"}, // invalid → static fallback step
			},
		},
	}
	p := PlanFor("run-plan", reqs, true)
	if err := p.Validate(); err != nil {
		t.Fatal(err)
	}
	// Global passes present.
	kinds := map[StepKind]int{}
	for _, s := range p.Steps {
		kinds[s.Kind]++
	}
	for _, want := range []StepKind{StepStatic, StepVet, StepTest, StepProbe, StepSecurity} {
		if kinds[want] == 0 {
			t.Fatalf("plan missing %s steps: %+v", want, kinds)
		}
	}
}

func TestEmptyPlanRefused(t *testing.T) {
	p := &Plan{RunID: "run-empty"} // a caller-built empty plan
	if err := p.Validate(); err == nil {
		t.Fatal("empty plan must be refused (NO EVIDENCE = NO VERIFIED IMPLEMENTATION)")
	}
	// PlanFor always includes global static+security passes, never empty.
	pf := PlanFor("run-x", nil, false)
	if len(pf.Steps) == 0 {
		t.Fatal("PlanFor must always emit global passes")
	}
}
