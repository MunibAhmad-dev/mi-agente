// Package adapters implements core.ToolAdapter integrations. The engine core
// never couples to a tool directly — everything goes through these adapters.
package adapters

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"verificationengine/internal/core"
)

// ---------------------------------------------------------------------------
// Shared exec helper — bounded, timeouts, captures output
// ---------------------------------------------------------------------------

// execResult captures a tool run.
type execResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
	Duration time.Duration
}

func runTool(ctx *core.RunContext, name string, args ...string) (execResult, error) {
	if ctx.Timeout <= 0 {
		ctx.Timeout = 10 * time.Minute
	}
	cctx, cancel := context.WithTimeout(context.Background(), ctx.Timeout)
	defer cancel()
	cmd := exec.CommandContext(cctx, name, args...)
	cmd.Dir = ctx.ProjectRoot
	var out, errb strings.Builder
	cmd.Stdout = &out
	cmd.Stderr = &errb
	start := time.Now()
	err := cmd.Run()
	res := execResult{
		ExitCode: exitCodeOf(err),
		Stdout:   out.String(),
		Stderr:   errb.String(),
		Duration: time.Since(start),
	}
	if cctx.Err() == context.DeadlineExceeded {
		return res, fmt.Errorf("%s timed out after %s", name, ctx.Timeout)
	}
	return res, nil
}

func exitCodeOf(err error) int {
	if err == nil {
		return 0
	}
	if ee, ok := err.(*exec.ExitError); ok {
		return ee.ExitCode()
	}
	return -1
}

// goVersion returns the go toolchain version (best effort).
func goVersion() string {
	out, err := exec.Command("go", "env", "GOVERSION").Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(out))
}

// ---------------------------------------------------------------------------
// GoVetAdapter — R-series static analysis via go vet
// ---------------------------------------------------------------------------

// GoVetAdapter runs `go vet ./...`.
type GoVetAdapter struct{ res execResult }

func (a *GoVetAdapter) Name() string           { return "govet-adapter" }
func (a *GoVetAdapter) Version() string        { return goVersion() }
func (a *GoVetAdapter) Capabilities() []string { return []string{"static-analysis", "go"} }
func (a *GoVetAdapter) Detect(root string) bool {
	_, err := os.Stat(filepath.Join(root, "go.mod"))
	return err == nil
}
func (a *GoVetAdapter) ResourceProfile() core.ResourceProfile {
	return core.ResourceProfile{CPUImpact: "medium", MemoryMB: 256, Network: false, DiskMB: 10, Parallelism: 2}
}
func (a *GoVetAdapter) License() core.LicenseInfo {
	return core.LicenseInfo{Name: "go", SPDX: "BSD-3-Clause", TransitiveLicenseRisk: "none"}
}
func (a *GoVetAdapter) Prepare(ctx *core.RunContext) error { return nil }
func (a *GoVetAdapter) Cleanup(ctx *core.RunContext) error { return nil }

// Run executes go vet and parses its output.
func (a *GoVetAdapter) Run(ctx *core.RunContext) ([]core.Evidence, error) {
	res, err := runTool(ctx, "go", "vet", "./...")
	a.res = res
	if err != nil {
		return nil, err
	}
	return a.Parse([]byte(res.Stdout + "\n" + res.Stderr))
}

// Parse converts go vet output lines into evidence.
func (a *GoVetAdapter) Parse(raw []byte) ([]core.Evidence, error) {
	var out []core.Evidence
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasSuffix(line, "#") || strings.HasPrefix(line, "# ") {
			continue
		}
		if strings.Contains(line, ": ") {
			loc := line
			msg := line
			if i := strings.Index(line, ": "); i > 0 {
				loc = line[:i]
				msg = line[i+2:]
			}
			out = append(out, core.Evidence{
				Kind: core.EvStaticAnalysis, Source: a.Name(), ToolVersion: a.Version(),
				Target: loc, Location: loc, Message: msg, Severity: core.SevMedium,
				Confidence: 0.85,
			})
		}
	}
	return out, nil
}

// Normalize caps severity for style-only vet warnings.
func (a *GoVetAdapter) Normalize(evs []core.Evidence) []core.Evidence { return evs }

// ---------------------------------------------------------------------------
// GoTestAdapter — dynamic verification via go test -json (spec §14)
// ---------------------------------------------------------------------------

// GoTestAdapter runs `go test -json ./...`.
type GoTestAdapter struct{ res execResult }

func (a *GoTestAdapter) Name() string           { return "gotest-adapter" }
func (a *GoTestAdapter) Version() string        { return goVersion() }
func (a *GoTestAdapter) Capabilities() []string { return []string{"test", "go"} }
func (a *GoTestAdapter) Detect(root string) bool {
	_, err := os.Stat(filepath.Join(root, "go.mod"))
	return err == nil
}
func (a *GoTestAdapter) ResourceProfile() core.ResourceProfile {
	return core.ResourceProfile{CPUImpact: "high", MemoryMB: 512, Network: false, DiskMB: 50, Parallelism: 1}
}
func (a *GoTestAdapter) License() core.LicenseInfo {
	return core.LicenseInfo{Name: "go", SPDX: "BSD-3-Clause", TransitiveLicenseRisk: "none"}
}
func (a *GoTestAdapter) Prepare(ctx *core.RunContext) error { return nil }
func (a *GoTestAdapter) Cleanup(ctx *core.RunContext) error { return nil }

// Run executes go test -json ./...
func (a *GoTestAdapter) Run(ctx *core.RunContext) ([]core.Evidence, error) {
	// Exit code 1 with parseable output is normal (failing tests); parse anyway.
	res, _ := runTool(ctx, "go", "test", "-json", "./...")
	a.res = res
	return a.Parse([]byte(res.Stdout))
}

// goTestEvent mirrors `go test -json` lines.
type goTestEvent struct {
	Time        time.Time `json:"Time"`
	Action      string    `json:"Action"`
	Package     string    `json:"Package"`
	Test        string    `json:"Test,omitempty"`
	Output      string    `json:"Output,omitempty"`
	Elapsed     float64   `json:"Elapsed,omitempty"`
	FailedBuild string    `json:"FailedBuild,omitempty"`
}

// Parse converts go test -json events into evidence. Failing tests carry the
// last lines of their output in the payload (DETECT + EXPLAIN).
func (a *GoTestAdapter) Parse(raw []byte) ([]core.Evidence, error) {
	var out []core.Evidence
	outputs := map[string][]string{} // test -> recent output lines
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	for {
		var ev goTestEvent
		if err := dec.Decode(&ev); err != nil {
			break
		}
		if ev.Action == "output" && ev.Output != "" {
			key := ev.Test
			overview := outputs[key]
			overview = append(overview, ev.Output)
			if len(overview) > 50 {
				overview = overview[len(overview)-50:]
			}
			outputs[key] = overview
			continue
		}
		switch ev.Action {
		case "pass", "fail", "skip":
			if ev.Test == "" {
				continue
			}
			sev := core.SevInfo
			msg := fmt.Sprintf("test %s: %s (%.2fs)", ev.Action, ev.Test, ev.Elapsed)
			if ev.Action == "fail" {
				sev = core.SevHigh
				msg = fmt.Sprintf("test failed: %s (%.2fs)", ev.Test, ev.Elapsed)
			}
			payload := map[string]any{"action": ev.Action, "elapsed_s": ev.Elapsed, "package": ev.Package}
			if ev.Action == "fail" {
				payload["output_tail"] = outputs[ev.Test]
			}
			out = append(out, core.Evidence{
				Kind: core.EvTestRun, Source: a.Name(), ToolVersion: a.Version(),
				Target: fmt.Sprintf("test:%s", ev.Test), Location: ev.Package,
				Message: msg, Severity: sev, Confidence: 1.0,
				Payload: payload,
			})
		}
	}
	return out, nil
}

// Normalize groups by test, keeping worst severity.
func (a *GoTestAdapter) Normalize(evs []core.Evidence) []core.Evidence {
	seen := map[string]int{}
	var out []core.Evidence
	for _, ev := range evs {
		if idx, ok := seen[ev.Target]; ok {
			if ev.Severity.Rank() > out[idx].Severity.Rank() {
				out[idx] = ev
			}
		} else {
			seen[ev.Target] = len(out)
			out = append(out, ev)
		}
	}
	return out
}
