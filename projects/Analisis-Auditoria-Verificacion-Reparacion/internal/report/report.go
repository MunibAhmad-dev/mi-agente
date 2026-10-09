// Package report writes the run artifacts: verdict.json, traceability.md,
// certificate.md (spec Governance) with integrity hashes.
package report

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"verificationengine/internal/core"
	"verificationengine/internal/gate"
	"verificationengine/internal/planner"
	"verificationengine/internal/repair"
	"verificationengine/internal/truthmodel"
)

// Verdict is the machine-readable run outcome.
type Verdict struct {
	RunID         string            `json:"run_id"`
	StartedAt     time.Time         `json:"started_at"`
	FinishedAt    time.Time         `json:"finished_at"`
	ProjectRoot   string            `json:"project_root"`
	Decision      gate.Decision     `json:"decision"`
	Reasons       []string          `json:"reasons"`
	TotalEvidence int               `json:"total_evidence"`
	MaxSeverity   core.Severity     `json:"max_severity"`
	PlanSteps     int               `json:"plan_steps"`
	Repairs       []repair.Repair   `json:"repairs,omitempty"`
	Artifacts     map[string]string `json:"artifacts"` // name -> sha256
}

// WriteAll persists verdict.json, traceability.md and certificate.md under outDir.
func WriteAll(outDir string, v *Verdict, evs []core.Evidence, model *truthmodel.Model, plan *planner.Plan) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	v.Artifacts = map[string]string{}

	// verdict.json
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(outDir, "verdict.json"), data, 0o644); err != nil {
		return err
	}
	v.Artifacts["verdict.json"] = hashBytes(data)

	// evidence.jsonl copy
	if len(evs) > 0 {
		var b strings.Builder
		for _, ev := range evs {
			line, _ := json.Marshal(ev)
			b.Write(line)
			b.WriteByte('\n')
		}
		if err := os.WriteFile(filepath.Join(outDir, "evidence.jsonl"), []byte(b.String()), 0o644); err != nil {
			return err
		}
		v.Artifacts["evidence.jsonl"] = hashBytes([]byte(b.String()))
	}

	// traceability.md
	trace := renderTraceability(model, plan)
	if err := os.WriteFile(filepath.Join(outDir, "traceability.md"), []byte(trace), 0o644); err != nil {
		return err
	}
	v.Artifacts["traceability.md"] = hashBytes([]byte(trace))

	// certificate.md (only meaningful content for PASS; otherwise explains failure)
	cert := renderCertificate(v, model)
	if err := os.WriteFile(filepath.Join(outDir, "certificate.md"), []byte(cert), 0o644); err != nil {
		return err
	}
	v.Artifacts["certificate.md"] = hashBytes([]byte(cert))
	return nil
}

func hashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func renderTraceability(model *truthmodel.Model, plan *planner.Plan) string {
	var b strings.Builder
	b.WriteString("# Traceability Matrix\n\n")
	b.WriteString("States: VERIFIED | PARTIAL | MISSING | BROKEN | UNCONNECTED | UNKNOWN\n\n")
	b.WriteString("| Requirement | Component | Code | API | Data | Tests | Runtime | State | Reason |\n")
	b.WriteString("|---|---|---|---|---|---|---|---|---|\n")
	for _, row := range model.TraceMatrix() {
		b.WriteString(fmt.Sprintf("| %s | %s | %s | %s | %s | %s | %s | %s | %s |\n",
			row.Requirement, row.Component, row.Code, row.API, row.Data,
			strings.Join(row.Tests, ","), strings.Join(row.Runtime, ","),
			row.State, row.Reason))
	}
	b.WriteString("\n## Reverse traceability (untraceable code)\n\n")
	untrace := model.ReverseTrace()
	if len(untrace) == 0 {
		b.WriteString("None — every code entity traces to a requirement.\n")
	} else {
		for _, u := range untrace {
			b.WriteString(fmt.Sprintf("- `%s` (%s) — %s %s\n", u.EntityID, u.Type, u.Kind, u.Location))
		}
	}
	if plan != nil {
		b.WriteString("\n## Verification plan\n\n")
		for _, s := range plan.Steps {
			b.WriteString(fmt.Sprintf("- %s %s", s.Kind, s.Target))
			if s.RequirementID != "" {
				b.WriteString(fmt.Sprintf(" (req %s)", s.RequirementID))
			}
			b.WriteString("\n")
		}
	}
	return b.String()
}

func renderCertificate(v *Verdict, model *truthmodel.Model) string {
	var b strings.Builder
	b.WriteString("# Verification Certificate\n\n")
	b.WriteString(fmt.Sprintf("- Run: `%s`\n", v.RunID))
	b.WriteString(fmt.Sprintf("- Project: `%s`\n", v.ProjectRoot))
	b.WriteString(fmt.Sprintf("- Finished: %s\n", v.FinishedAt.Format(time.RFC3339)))
	b.WriteString(fmt.Sprintf("- Decision: **%s**\n", v.Decision))
	b.WriteString(fmt.Sprintf("- Evidence items: %d (max severity %s)\n", v.TotalEvidence, v.MaxSeverity))
	b.WriteString("\nInvariant: EVIDENCE > CLAIM. No component is certified on builder claims; ")
	b.WriteString("every conclusion above is backed by hashed evidence artifacts.\n\n")
	if v.Decision != gate.Pass {
		b.WriteString("## Blocking reasons\n\n")
		for _, r := range v.Reasons {
			b.WriteString("- " + r + "\n")
		}
		b.WriteString("\nThis is NOT a certificate of completion. Repair → re-verify → re-audit required.\n")
	} else {
		b.WriteString("All gate criteria met: severity thresholds, maturity levels and full traceability.\n")
	}
	return b.String()
}
