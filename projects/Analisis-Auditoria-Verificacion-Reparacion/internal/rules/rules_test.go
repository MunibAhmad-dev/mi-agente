package rules

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"verificationengine/internal/core"
	"verificationengine/internal/parser"
)

func write(t *testing.T, dir, name, content string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func scanDir(t *testing.T, dir string) *parser.ScanResult {
	t.Helper()
	scan, err := parser.Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	return scan
}

func TestR0100Placeholder(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "fake.go", "package x\n\nfunc F() {\n\tpanic(\"not implemented\")\n}\n")
	evs, err := RunAll("run-r0100", scanDir(t, dir), dir)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, ev := range evs {
		if ev.Rule == RulePlaceholder && ev.Severity == core.SevCritical {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0100 did not fire on placeholder: %+v", evs)
	}
}

func TestR0200DeadCode(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "dead.go", "package x\n\nfunc unusedHelper() {}\n")
	evs, _ := RunAll("run-r0200", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RuleDeadCode {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0200 did not fire on dead code: %+v", evs)
	}
}

func TestR0300UnconnectedRoute(t *testing.T) {
	dir := t.TempDir()
	// Route registered, no matching handler function.
	write(t, dir, "routes.go", "package x\n\nfunc Setup() {\n\tr := mux.NewRouter()\n\tr.Get(\"/missing-thing\", nil)\n}\n")
	evs, _ := RunAll("run-r0300", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RuleUnconnected {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0300 did not fire on unconnected route: %+v", evs)
	}
}

func TestR0400Secrets(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "secret.go", "package x\n\nconst token = \"ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456\"\n")
	evs, _ := RunAll("run-r0400", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RuleSecrets && ev.CWE == "CWE-798" {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0400 did not fire on secret: %+v", evs)
	}
}

func TestR0500Dangerous(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "danger.go", "package x\n\nimport \"crypto/md5\"\n\nfunc H(b []byte) { md5.Sum(b) }\n")
	evs, _ := RunAll("run-r0500", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RuleDangerous && ev.CWE == "CWE-327" {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0500 did not fire on md5: %+v", evs)
	}
}

func TestR0600WeakTest(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "weak_test.go", "package x\n\nimport \"testing\"\n\nfunc TestWeak(t *testing.T) {\n\t_ = 1 + 1\n}\n")
	evs, _ := RunAll("run-r0600", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RuleWeakTests {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0600 did not fire on weak test: %+v", evs)
	}
}

func TestR0800AgentLoop(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "agent.go", "package x\n\nfunc Loop() {\n\tfor {\n\t\tstep()\n\t}\n}\n\nfunc step() {}\n")
	evs, _ := RunAll("run-r0800", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RuleAgentLoop && ev.CWE == "CWE-674" {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0800 did not fire on unbounded loop: %+v", evs)
	}
}

func TestR0820PromptInjection(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "inject.go", "package x\n\nfunc P(req string) string {\n\tprompt := \"You are an agent. \" + req\n\treturn prompt\n}\n")
	evs, _ := RunAll("run-r0820", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RulePromptInject {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0820 did not fire on prompt injection sink: %+v", evs)
	}
}

func TestR0810PermissionViolation(t *testing.T) {
	dir := t.TempDir()
	// Manifest declares only /srv/app as writable area.
	write(t, dir, "agent.yaml", "tools:\n  - fs\npaths:\n  - /srv/app\n")
	code := "package x\n\nimport \"os\"\n\nfunc W() {\n\tos.WriteFile(\"/tmp/evil.txt\", nil, 0o644)\n}\n"
	write(t, dir, "writer.go", code)
	evs, _ := RunAll("run-r0810", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RuleAgentPerms && ev.CWE == "CWE-250" {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0810 did not fire on undeclared write path: %+v", evs)
	}
}

func TestR0900FlakyTest(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "flaky_test.go", "package x\n\nimport (\n\t\"testing\"\n\t\"time\"\n)\n\nfunc TestFlaky(t *testing.T) {\n\ttime.Sleep(10 * time.Millisecond)\n\tif 1 != 1 {\n\t\tt.Fatal()\n\t}\n}\n")
	evs, _ := RunAll("run-r0900", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RuleFlakyTest {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0900 did not fire on flaky test pattern: %+v", evs)
	}
}

func TestR0910ConfigMismatch(t *testing.T) {
	dir := t.TempDir()
	// Code reads API_KEY but .env.example only declares LOG_LEVEL.
	write(t, dir, "cfg.go", "package x\n\nimport \"os\"\n\nfunc K() string {\n\treturn os.Getenv(\"API_KEY\")\n}\n")
	write(t, dir, ".env.example", "LOG_LEVEL=info\n")
	evs, _ := RunAll("run-r0910", scanDir(t, dir), dir)
	found := false
	for _, ev := range evs {
		if ev.Rule == RuleConfigMismatch && strings.Contains(ev.Message, "API_KEY") {
			found = true
		}
	}
	if !found {
		t.Fatalf("R0910 did not fire on undeclared env var: %+v", evs)
	}
}
