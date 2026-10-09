// Package core defines the domain model of the verification engine:
// evidence, maturity, traceability states, the tool adapter contract and
// the append-only evidence store.
//
// Fundamental invariant (spec):
//
//	EVIDENCE > CLAIM
//	NO EVIDENCE = NO VERIFIED IMPLEMENTATION
package core

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	// Pure-Go SQLite driver (MIT) — no CGO, offline-capable evidence store.
	_ "modernc.org/sqlite"
)

// ---------------------------------------------------------------------------
// Maturity model (spec §9): L0..L8. Never "implemented=true".
// ---------------------------------------------------------------------------

type Maturity int

const (
	L0NotFound Maturity = iota // NOT_FOUND
	L1Declared                 // DECLARED
	L2Scaffolded
	L3Partial
	L4Implemented
	L5Integrated
	L6RuntimeVerified
	L7AdversariallyVerified
	L8ProductionVerified
)

func (m Maturity) String() string {
	names := []string{
		"L0 NOT_FOUND", "L1 DECLARED", "L2 SCAFFOLDED", "L3 PARTIAL",
		"L4 IMPLEMENTED", "L5 INTEGRATED", "L6 RUNTIME_VERIFIED",
		"L7 ADVERSARIALLY_VERIFIED", "L8 PRODUCTION_VERIFIED",
	}
	if m < L0NotFound || m > L8ProductionVerified {
		return "L? INVALID"
	}
	return names[m]
}

// ParseMaturity parses "L4", "L4 IMPLEMENTED" or the long name.
func ParseMaturity(s string) (Maturity, error) {
	s = strings.TrimSpace(strings.ToUpper(s))
	long := map[string]Maturity{
		"L0 NOT_FOUND": L0NotFound, "NOT_FOUND": L0NotFound,
		"L1 DECLARED": L1Declared, "DECLARED": L1Declared,
		"L2 SCAFFOLDED": L2Scaffolded, "SCAFFOLDED": L2Scaffolded,
		"L3 PARTIAL": L3Partial, "PARTIAL": L3Partial,
		"L4 IMPLEMENTED": L4Implemented, "IMPLEMENTED": L4Implemented,
		"L5 INTEGRATED": L5Integrated, "INTEGRATED": L5Integrated,
		"L6 RUNTIME_VERIFIED": L6RuntimeVerified, "RUNTIME_VERIFIED": L6RuntimeVerified,
		"L7 ADVERSARIALLY_VERIFIED": L7AdversariallyVerified, "ADVERSARIALLY_VERIFIED": L7AdversariallyVerified,
		"L8 PRODUCTION_VERIFIED": L8ProductionVerified, "PRODUCTION_VERIFIED": L8ProductionVerified,
	}
	if m, ok := long[s]; ok {
		return m, nil
	}
	if len(s) == 2 && s[0] == 'L' && s[1] >= '0' && s[1] <= '8' {
		return Maturity(s[1] - '0'), nil
	}
	return L0NotFound, fmt.Errorf("invalid maturity %q", s)
}

// Traceability states (spec §7).
type TraceState string

const (
	TraceVerified    TraceState = "VERIFIED"
	TracePartial     TraceState = "PARTIAL"
	TraceMissing     TraceState = "MISSING"
	TraceBroken      TraceState = "BROKEN"
	TraceUnconnected TraceState = "UNCONNECTED"
	TraceUnknown     TraceState = "UNKNOWN"
)

// Severity of a finding.
type Severity string

const (
	SevInfo     Severity = "INFO"
	SevLow      Severity = "LOW"
	SevMedium   Severity = "MEDIUM"
	SevHigh     Severity = "HIGH"
	SevCritical Severity = "CRITICAL"
)

var severityRank = map[Severity]int{SevInfo: 0, SevLow: 1, SevMedium: 2, SevHigh: 3, SevCritical: 4}

// Rank returns the ordering rank of a severity.
func (s Severity) Rank() int { return severityRank[s] }

// MaxSeverity returns the most severe of two severities.
func MaxSeverity(a, b Severity) Severity {
	if a.Rank() >= b.Rank() {
		return a
	}
	return b
}

// ---------------------------------------------------------------------------
// Evidence: the only currency the engine accepts. Never a builder claim.
// ---------------------------------------------------------------------------

// EvidenceKind classifies the provenance of evidence.
type EvidenceKind string

const (
	EvStaticAnalysis EvidenceKind = "STATIC_ANALYSIS"
	EvTestRun        EvidenceKind = "TEST_RUN"
	EvRuntimeProbe   EvidenceKind = "RUNTIME_PROBE"
	EvContract       EvidenceKind = "CONTRACT_CHECK"
	EvAdversarial    EvidenceKind = "ADVERSARIAL"
	EvSecurity       EvidenceKind = "SECURITY"
	EvPerformance    EvidenceKind = "PERFORMANCE"
	EvSemanticAudit  EvidenceKind = "SEMANTIC_AUDIT"
	EvRegression     EvidenceKind = "REGRESSION"
	EvRepair         EvidenceKind = "REPAIR"
	EvClaim          EvidenceKind = "CLAIM" // builder claim: recorded, never trusted
)

// Evidence is a single verifiable observation about the system under test.
type Evidence struct {
	ID          string         `json:"id"`
	Kind        EvidenceKind   `json:"kind"`
	Source      string         `json:"source"` // adapter/tool name, e.g. "gotest-adapter"
	ToolVersion string         `json:"tool_version,omitempty"`
	Rule        string         `json:"rule,omitempty"` // e.g. R0100, R0300
	Target      string         `json:"target"`         // entity: file, route, requirement id...
	Location    string         `json:"location,omitempty"`
	Message     string         `json:"message"`
	Severity    Severity       `json:"severity"`
	Confidence  float64        `json:"confidence"` // 0..1
	CWE         string         `json:"cwe,omitempty"`
	OSV         string         `json:"osv,omitempty"`
	Payload     map[string]any `json:"payload,omitempty"`
	SHA256      string         `json:"sha256"` // hash of canonical payload+message
	CreatedAt   time.Time      `json:"created_at"`
	RunID       string         `json:"run_id"`
}

// Hash computes the deterministic sha256 of the evidence content.
func (e *Evidence) Hash() string {
	canon := fmt.Sprintf("%s|%s|%s|%s|%s|%s|%s|%s|%.2f|%s|%s|%v",
		e.Kind, e.Source, e.ToolVersion, e.Rule, e.Target, e.Location,
		e.Message, e.Severity, e.Confidence, e.CWE, e.OSV, e.Payload)
	sum := sha256.Sum256([]byte(canon))
	return hex.EncodeToString(sum[:])
}

// ---------------------------------------------------------------------------
// ToolAdapter (spec §4): the core never couples to a tool.
// ---------------------------------------------------------------------------

// ResourceProfile describes expected resource cost of a tool.
type ResourceProfile struct {
	CPUImpact   string `json:"cpu_impact"` // low|medium|high
	MemoryMB    int    `json:"memory_mb"`  // approximate peak
	Network     bool   `json:"network"`
	DiskMB      int    `json:"disk_mb"`
	Parallelism int    `json:"parallelism"` // suggested parallel slots
}

// LicenseInfo captures licensing metadata (spec §3).
type LicenseInfo struct {
	Name                  string `json:"name"`
	SPDX                  string `json:"spdx"`
	TransitiveLicenseRisk string `json:"transitive_license_risk"` // none|low|medium|high
}

// ToolAdapter is the contract every tool integration must implement.
type ToolAdapter interface {
	Name() string
	Version() string
	Capabilities() []string
	Detect(projectRoot string) bool
	Prepare(ctx *RunContext) error
	Run(ctx *RunContext) ([]Evidence, error)
	Parse(raw []byte) ([]Evidence, error)
	Normalize(ev []Evidence) []Evidence
	Cleanup(ctx *RunContext) error
	ResourceProfile() ResourceProfile
	License() LicenseInfo
}

// RunContext carries per-run state to adapters.
type RunContext struct {
	RunID       string
	ProjectRoot string
	WorkDir     string // scratch dir for the adapter
	Out         *EvidenceStore
	MaxParallel int
	Timeout     time.Duration
	DryRun      bool
}

// ---------------------------------------------------------------------------
// Evidence store: SQLite + append-only JSONL. Deterministic, reproducible.
// ---------------------------------------------------------------------------

// EvidenceStore persists evidence. SQLite is the index; JSONL is the append-only log.
type EvidenceStore struct {
	db        *sql.DB
	jsonl     *os.File
	jsonlPath string
}

const schema = `
CREATE TABLE IF NOT EXISTS evidence (
	id TEXT PRIMARY KEY,
	run_id TEXT NOT NULL,
	kind TEXT NOT NULL,
	source TEXT NOT NULL,
	tool_version TEXT,
	rule TEXT,
	target TEXT NOT NULL,
	location TEXT,
	message TEXT NOT NULL,
	severity TEXT NOT NULL,
	confidence REAL NOT NULL,
	cwe TEXT,
	osv TEXT,
	payload TEXT,
	sha256 TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_run ON evidence(run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_target ON evidence(target);
CREATE INDEX IF NOT EXISTS idx_evidence_severity ON evidence(severity);
CREATE TABLE IF NOT EXISTS runs (
	run_id TEXT PRIMARY KEY,
	started_at TEXT NOT NULL,
	project_root TEXT NOT NULL,
	finished_at TEXT
);
`

// NewEvidenceStore opens (creating if needed) the evidence store under dir.
func NewEvidenceStore(dir string) (*EvidenceStore, error) {
	if err := os.MkdirAll(filepath.Join(dir, "artifacts"), 0o755); err != nil {
		return nil, fmt.Errorf("create store dir: %w", err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "evidence.db"))
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	// WAL + bounded connections for low memory.
	db.SetMaxOpenConns(4)
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("wal mode: %w", err)
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("schema: %w", err)
	}
	jf, err := os.OpenFile(filepath.Join(dir, "evidence.jsonl"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("open jsonl: %w", err)
	}
	return &EvidenceStore{db: db, jsonl: jf, jsonlPath: filepath.Join(dir, "evidence.jsonl")}, nil
}

// Close releases resources.
func (s *EvidenceStore) Close() error {
	if s.jsonl != nil {
		_ = s.jsonl.Close()
	}
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

// BeginRun registers a run.
func (s *EvidenceStore) BeginRun(runID, projectRoot string) error {
	_, err := s.db.Exec(`INSERT INTO runs(run_id, started_at, project_root) VALUES(?,?,?)`,
		runID, time.Now().UTC().Format(time.RFC3339Nano), projectRoot)
	return err
}

// FinishRun marks a run finished.
func (s *EvidenceStore) FinishRun(runID string) error {
	_, err := s.db.Exec(`UPDATE runs SET finished_at=? WHERE run_id=?`,
		time.Now().UTC().Format(time.RFC3339Nano), runID)
	return err
}

// Add persists one evidence item (SQLite + JSONL append). Never records duplicates by hash within a run.
func (s *EvidenceStore) Add(ev *Evidence) error {
	if ev.ID == "" {
		ev.ID = fmt.Sprintf("EV-%s", ev.Hash()[:12])
	}
	if ev.SHA256 == "" {
		ev.SHA256 = ev.Hash()
	}
	if ev.CreatedAt.IsZero() {
		ev.CreatedAt = time.Now().UTC()
	}
	payload, _ := json.Marshal(ev.Payload)
	_, err := s.db.Exec(`INSERT OR IGNORE INTO evidence
		(id, run_id, kind, source, tool_version, rule, target, location, message, severity, confidence, cwe, osv, payload, sha256, created_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		ev.ID, ev.RunID, string(ev.Kind), ev.Source, ev.ToolVersion, ev.Rule, ev.Target,
		ev.Location, ev.Message, string(ev.Severity), ev.Confidence, ev.CWE, ev.OSV,
		string(payload), ev.SHA256, ev.CreatedAt.Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("insert evidence: %w", err)
	}
	line, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("marshal evidence: %w", err)
	}
	if _, err := s.jsonl.Write(append(line, '\n')); err != nil {
		return fmt.Errorf("append jsonl: %w", err)
	}
	return nil
}

// AddAll persists many evidence items.
func (s *EvidenceStore) AddAll(evs []Evidence) error {
	for i := range evs {
		if err := s.Add(&evs[i]); err != nil {
			return err
		}
	}
	return nil
}

// Query filters evidence by run, target or severity (any may be empty).
func (s *EvidenceStore) Query(runID, target string, minSeverity Severity) ([]Evidence, error) {
	q := `SELECT id, run_id, kind, source, tool_version, rule, target, location, message, severity, confidence, cwe, osv, payload, sha256, created_at FROM evidence WHERE 1=1`
	var args []any
	if runID != "" {
		q += ` AND run_id=?`
		args = append(args, runID)
	}
	if target != "" {
		q += ` AND target=?`
		args = append(args, target)
	}
	if minSeverity != "" {
		// Severity ranking is a Go-side concern; filter after scan.
	}
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Evidence
	for rows.Next() {
		var ev Evidence
		var kind, severity, createdAt string
		var payload string
		var toolVersion, rule, location, cwe, osv sql.NullString
		if err := rows.Scan(&ev.ID, &ev.RunID, &kind, &ev.Source, &toolVersion, &rule,
			&ev.Target, &location, &ev.Message, &severity, &ev.Confidence,
			&cwe, &osv, &payload, &ev.SHA256, &createdAt); err != nil {
			return nil, err
		}
		ev.Kind = EvidenceKind(kind)
		ev.Severity = Severity(severity)
		ev.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdAt)
		if toolVersion.Valid {
			ev.ToolVersion = toolVersion.String
		}
		if rule.Valid {
			ev.Rule = rule.String
		}
		if location.Valid {
			ev.Location = location.String
		}
		if cwe.Valid {
			ev.CWE = cwe.String
		}
		if osv.Valid {
			ev.OSV = osv.String
		}
		if payload != "" {
			_ = json.Unmarshal([]byte(payload), &ev.Payload)
		}
		out = append(out, ev)
	}
	if minSeverity != "" {
		filtered := out[:0]
		for _, ev := range out {
			if ev.Severity.Rank() >= minSeverity.Rank() {
				filtered = append(filtered, ev)
			}
		}
		out = filtered
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Severity.Rank() != out[j].Severity.Rank() {
			return out[i].Severity.Rank() > out[j].Severity.Rank()
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

// MaxSeverityRun returns the highest severity recorded in a run (INFO if none).
func (s *EvidenceStore) MaxSeverityRun(runID string) Severity {
	evs, err := s.Query(runID, "", "")
	if err != nil {
		return SevInfo
	}
	max := SevInfo
	for i := range evs {
		max = MaxSeverity(max, evs[i].Severity)
	}
	return max
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// HashFile returns the sha256 of a file (artifact integrity).
func HashFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

// HashBytes returns the sha256 of bytes.
func HashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
