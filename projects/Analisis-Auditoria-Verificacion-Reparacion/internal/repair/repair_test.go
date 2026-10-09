package repair

import (
	"os"
	"path/filepath"
	"testing"

	"verificationengine/internal/core"
)

func TestPlaceholderNeverAutoFixed(t *testing.T) {
	e := NewEngine(Config{}, "run-rep")
	out := e.RepairFindings(t.TempDir(), []core.Evidence{
		{Rule: "R0100", Target: "fake.go", Location: "fake.go:3"},
	})
	if len(out) != 1 {
		t.Fatalf("expected 1 repair, got %+v", out)
	}
	if out[0].Action != "annotated" || out[0].AppliedCode {
		t.Fatalf("placeholder repair must not touch code: %+v", out[0])
	}
}

func TestPlaceholderWithCodeFixesStillRefuses(t *testing.T) {
	e := NewEngine(Config{RepairCodeFixes: true}, "run-rep")
	out := e.RepairFindings(t.TempDir(), []core.Evidence{
		{Rule: "R0100", Target: "fake.go", Location: "fake.go:3"},
	})
	// Even with code fixes allowed, the engine refuses to implement features.
	if out[0].Action != "skipped_needs_code_fix" || out[0].AppliedCode {
		t.Fatalf("engine must never auto-implement features (EVIDENCE > CLAIM): %+v", out[0])
	}
}

func TestWeakTestGetsStub(t *testing.T) {
	root := t.TempDir()
	e := NewEngine(Config{}, "run-rep")
	out := e.RepairFindings(root, []core.Evidence{
		{Rule: "R0600", Target: "TestWeak", Location: "x_test.go:4"},
	})
	if len(out) != 1 || out[0].Action != "stub_test" {
		t.Fatalf("expected stub_test repair: %+v", out)
	}
	stub := filepath.Join(root, "internal", "repair", "teststubs", "stub_test.go")
	if _, err := os.Stat(stub); err != nil {
		t.Fatalf("stub file missing: %v", err)
	}
	// Idempotent: second pass does not duplicate.
	out2 := e.RepairFindings(root, []core.Evidence{
		{Rule: "R0600", Target: "TestWeak", Location: "x_test.go:4"},
	})
	if out2[0].Detail == "wrote test stub for TestWeak" {
		t.Fatal("stub must be idempotent")
	}
}

func TestDeadCodeReportOnly(t *testing.T) {
	e := NewEngine(Config{}, "run-rep")
	out := e.RepairFindings(t.TempDir(), []core.Evidence{
		{Rule: "R0200", Target: "unusedHelper", Location: "dead.go:3"},
	})
	if out[0].Action != "report" || out[0].AppliedCode {
		t.Fatalf("dead code needs human decision: %+v", out[0])
	}
}
