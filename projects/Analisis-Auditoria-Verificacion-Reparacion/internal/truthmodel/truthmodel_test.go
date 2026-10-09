package truthmodel

import (
	"testing"

	"verificationengine/internal/core"
)

func TestModelAddAndLink(t *testing.T) {
	m := NewModel()
	if err := m.Add(&Entity{ID: "REQ-1", Type: EntityRequirement, Name: "provider switch"}); err != nil {
		t.Fatal(err)
	}
	if err := m.Add(&Entity{ID: "comp:api", Type: EntityComponent, Name: "api"}); err != nil {
		t.Fatal(err)
	}
	if err := m.Add(&Entity{ID: "func:Switch", Type: EntityFunction, Name: "Switch", Requirements: []string{"REQ-1"}}); err != nil {
		t.Fatal(err)
	}
	if err := m.Link("comp:api", "REQ-1"); err != nil {
		t.Fatal(err)
	}
	if err := m.Link("comp:api", "missing"); err == nil {
		t.Fatal("expected unknown dependency error")
	}
	if err := m.Add(&Entity{ID: "REQ-1", Type: EntityRequirement}); err == nil {
		t.Fatal("expected duplicate id error")
	}
}

func TestTraceMatrixStates(t *testing.T) {
	m := NewModel()
	_ = m.Add(&Entity{ID: "REQ-1", Type: EntityRequirement})
	// No component/code/tests/runtime/evidence -> MISSING.
	rows := m.TraceMatrix()
	if len(rows) != 1 || rows[0].State != core.TraceMissing {
		t.Fatalf("expected MISSING, got %+v", rows)
	}

	// Full chain -> VERIFIED.
	m2 := NewModel()
	_ = m2.Add(&Entity{ID: "REQ-2", Type: EntityRequirement})
	_ = m2.Add(&Entity{ID: "comp:api", Type: EntityComponent})
	_ = m2.Link("comp:api", "REQ-2")
	_ = m2.Add(&Entity{ID: "func:Do", Type: EntityFunction, Requirements: []string{"REQ-2"}})
	_ = m2.Add(&Entity{ID: "test:TestDo", Type: EntityTest, Requirements: []string{"REQ-2"}})
	req, _ := m2.Get("REQ-2")
	req.RuntimeObservations = []string{"EV-1"}
	req.Evidence = []string{"EV-1"}
	rows2 := m2.TraceMatrix()
	if len(rows2) != 1 || rows2[0].State != core.TraceVerified {
		t.Fatalf("expected VERIFIED, got %+v", rows2)
	}

	// Code but no tests -> PARTIAL.
	m3 := NewModel()
	_ = m3.Add(&Entity{ID: "REQ-3", Type: EntityRequirement})
	_ = m3.Add(&Entity{ID: "func:Part", Type: EntityFunction, Requirements: []string{"REQ-3"}})
	rows3 := m3.TraceMatrix()
	if len(rows3) != 1 || rows3[0].State != core.TracePartial {
		t.Fatalf("expected PARTIAL, got %+v", rows3)
	}
}

func TestReverseTraceDetectsUntraceable(t *testing.T) {
	m := NewModel()
	_ = m.Add(&Entity{ID: "func:Orphan", Type: EntityFunction, Name: "Orphan"})
	_ = m.Add(&Entity{ID: "func:Traced", Type: EntityFunction, Name: "Traced", Requirements: []string{"REQ-9"}})
	untrace := m.ReverseTrace()
	if len(untrace) != 1 || untrace[0].EntityID != "func:Orphan" {
		t.Fatalf("reverse trace mismatch: %+v", untrace)
	}
}

func TestAcceptanceVerificationParsing(t *testing.T) {
	if _, _, err := ParseAcceptanceVerification("probe:GET /health"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ParseAcceptanceVerification("noseparator"); err == nil {
		t.Fatal("expected error")
	}
}
