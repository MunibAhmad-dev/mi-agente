package pipeline

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func write(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestPipelineEndToEndFailsOnBrokenFixture(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "go.mod", "module fixture\n\ngo 1.24\n")
	write(t, dir, "main.go", "package main\n\nimport \"fmt\"\n\nfunc main() { fmt.Println(\"hi\") }\n\nfunc fakeFeature() {\n\tpanic(\"not implemented\")\n}\n")
	write(t, dir, "main_test.go", "package main\n\nimport \"testing\"\n\nfunc TestPass(t *testing.T) {\n\tif 1+1 != 2 {\n\t\tt.Fatal(\"math broken\")\n\t}\n}\n")
	write(t, dir, "secret.go", "package main\n\nconst apiKey = \"AKIAIOSFODNN7EXAMPLE\"\n")

	res, err := Run(Config{ProjectRoot: dir})
	if err != nil {
		t.Fatal(err)
	}
	if res.Verdict.Decision != "FAIL" {
		t.Fatalf("expected FAIL on broken fixture, got %s. reasons: %v", res.Verdict.Decision, res.Verdict.Reasons)
	}
	// Evidence must include the placeholder (R0100) and secret (R0400).
	foundPlaceholder, foundSecret := false, false
	for _, ev := range res.Evidence {
		if ev.Rule == "R0100" {
			foundPlaceholder = true
		}
		if ev.Rule == "R0400" {
			foundSecret = true
		}
	}
	if !foundPlaceholder || !foundSecret {
		t.Fatalf("missing expected evidence: placeholder=%v secret=%v", foundPlaceholder, foundSecret)
	}
	// Artifacts written.
	for _, name := range []string{"verdict.json", "traceability.md", "certificate.md", "evidence.jsonl"} {
		if _, err := os.Stat(filepath.Join(dir, "reports", name)); err != nil {
			t.Fatalf("artifact %s missing: %v", name, err)
		}
	}
	// Verdict parses and records evidence count.
	data, _ := os.ReadFile(filepath.Join(dir, "reports", "verdict.json"))
	var v map[string]any
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatal(err)
	}
	if v["total_evidence"].(float64) < 2 {
		t.Fatalf("total_evidence too low: %v", v["total_evidence"])
	}
}

func TestPipelineEmptyPlanGuard(t *testing.T) {
	// A project with no Go module still gets global static+security passes.
	dir := t.TempDir()
	write(t, dir, "notes.txt", "hello")
	res, err := Run(Config{ProjectRoot: dir})
	if err != nil {
		t.Fatal(err)
	}
	if res.Verdict.PlanSteps == 0 {
		t.Fatal("plan must never be empty")
	}
}
