package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"verificationengine/internal/core"
	"verificationengine/internal/gate"
	"verificationengine/internal/planner"
	"verificationengine/internal/truthmodel"
)

func TestWriteAllArtifacts(t *testing.T) {
	out := t.TempDir()
	m := truthmodel.NewModel()
	_ = m.Add(&truthmodel.Entity{ID: "REQ-1", Type: truthmodel.EntityRequirement})
	_ = m.Add(&truthmodel.Entity{ID: "comp:api", Type: truthmodel.EntityComponent})
	_ = m.Link("comp:api", "REQ-1")
	_ = m.Add(&truthmodel.Entity{ID: "func:Do", Type: truthmodel.EntityFunction, Requirements: []string{"REQ-1"}})
	_ = m.Add(&truthmodel.Entity{ID: "test:TestDo", Type: truthmodel.EntityTest, Requirements: []string{"REQ-1"}})
	req, _ := m.Get("REQ-1")
	req.RuntimeObservations = []string{"EV-1"}
	req.Evidence = []string{"EV-1"}

	plan := planner.PlanFor("run-rep", nil, true)
	v := &Verdict{
		RunID: "run-rep", StartedAt: time.Now().Add(-time.Second), FinishedAt: time.Now(),
		ProjectRoot: "/fixture", Decision: gate.Pass, Reasons: nil,
		TotalEvidence: 3, MaxSeverity: core.SevInfo, PlanSteps: len(plan.Steps),
	}
	evs := []core.Evidence{{ID: "EV-1", Kind: core.EvRuntimeProbe, Target: "probe:http:health", Severity: core.SevInfo}}

	if err := WriteAll(out, v, evs, m, plan); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"verdict.json", "traceability.md", "certificate.md", "evidence.jsonl"} {
		data, err := os.ReadFile(filepath.Join(out, name))
		if err != nil {
			t.Fatalf("%s missing: %v", name, err)
		}
		if len(data) == 0 {
			t.Fatalf("%s empty", name)
		}
		if v.Artifacts[name] == "" {
			t.Fatalf("%s hash not recorded", name)
		}
	}
	cert, _ := os.ReadFile(filepath.Join(out, "certificate.md"))
	if !strings.Contains(string(cert), "EVIDENCE > CLAIM") {
		t.Fatal("certificate must state the invariant")
	}
	trace, _ := os.ReadFile(filepath.Join(out, "traceability.md"))
	if !strings.Contains(string(trace), "REQ-1") {
		t.Fatal("traceability must contain requirement row")
	}
}
