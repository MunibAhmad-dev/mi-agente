// Package truthmodel implements the ProjectTruthModel (spec §5): a single
// graph of everything that exists, is claimed to exist, or must exist.
package truthmodel

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"verificationengine/internal/core"
)

// EntityType enumerates the node kinds of the truth model.
type EntityType string

const (
	EntityRequirement EntityType = "requirement"
	EntityFeature     EntityType = "feature"
	EntitySubfeature  EntityType = "subfeature"
	EntityComponent   EntityType = "component"
	EntityModule      EntityType = "module"
	EntityFunction    EntityType = "function"
	EntityClass       EntityType = "class"
	EntityRoute       EntityType = "route"
	EntityAPI         EntityType = "api"
	EntityEvent       EntityType = "event"
	EntityQueue       EntityType = "queue"
	EntityService     EntityType = "service"
	EntityDatabase    EntityType = "database"
	EntityTable       EntityType = "table"
	EntitySchema      EntityType = "schema"
	EntityMigration   EntityType = "migration"
	EntityProvider    EntityType = "provider"
	EntityExternal    EntityType = "external_system"
	EntityConfig      EntityType = "config"
	EntityEnvVar      EntityType = "env_var"
	EntityDependency  EntityType = "dependency"
	EntityTest        EntityType = "test"
	EntityE2E         EntityType = "e2e_flow"
	EntitySecurity    EntityType = "security_property"
	EntityPerf        EntityType = "performance_req"
	EntityAgentCap    EntityType = "agent_capability"
	EntityAgentPerm   EntityType = "agent_permission"
)

// Status of an entity in the model.
type Status string

const (
	StatusPlanned    Status = "PLANNED"
	StatusInProgress Status = "IN_PROGRESS"
	StatusDone       Status = "DONE"
	StatusBroken     Status = "BROKEN"
	StatusUnverified Status = "UNVERIFIED"
)

// Entity is a node of the truth model (spec §5 fields).
type Entity struct {
	ID                  string            `json:"id"`
	Type                EntityType        `json:"type"`
	Name                string            `json:"name"`
	Source              string            `json:"source"` // where the claim comes from: requirement, code, builder claim
	Location            string            `json:"location,omitempty"`
	Status              Status            `json:"status"`
	Maturity            core.Maturity     `json:"maturity"`
	Risk                string            `json:"risk,omitempty"`         // none|low|medium|high|critical
	Confidence          float64           `json:"confidence"`             // 0..1 in the model's own existence claim
	Evidence            []string          `json:"evidence,omitempty"`     // evidence IDs
	Requirements        []string          `json:"requirements,omitempty"` // requirement IDs this satisfies
	Dependencies        []string          `json:"dependencies,omitempty"`
	Dependents          []string          `json:"dependents,omitempty"`
	Tests               []string          `json:"tests,omitempty"`
	RuntimeObservations []string          `json:"runtime_observations,omitempty"`
	Meta                map[string]string `json:"meta,omitempty"`
	CreatedAt           time.Time         `json:"created_at"`
}

// Model is the ProjectTruthModel.
type Model struct {
	entities map[string]*Entity
	byType   map[EntityType][]string
}

// NewModel creates an empty model.
func NewModel() *Model {
	return &Model{entities: map[string]*Entity{}, byType: map[EntityType][]string{}}
}

// Add inserts an entity; duplicate IDs are rejected.
func (m *Model) Add(e *Entity) error {
	if e.ID == "" || e.Type == "" {
		return fmt.Errorf("entity requires id and type")
	}
	if _, exists := m.entities[e.ID]; exists {
		return fmt.Errorf("duplicate entity id %q", e.ID)
	}
	if e.Status == "" {
		e.Status = StatusPlanned
	}
	if e.CreatedAt.IsZero() {
		e.CreatedAt = time.Now().UTC()
	}
	m.entities[e.ID] = e
	m.byType[e.Type] = append(m.byType[e.Type], e.ID)
	return nil
}

// Get returns an entity by ID.
func (m *Model) Get(id string) (*Entity, bool) {
	e, ok := m.entities[id]
	return e, ok
}

// MustGet panics-free accessor used in tests.
func (m *Model) MustGet(id string) *Entity {
	return m.entities[id]
}

// All returns all entities sorted by ID (deterministic).
func (m *Model) All() []*Entity {
	out := make([]*Entity, 0, len(m.entities))
	for _, e := range m.entities {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// ByType returns entities of one type sorted by ID.
func (m *Model) ByType(t EntityType) []*Entity {
	ids := append([]string(nil), m.byType[t]...)
	sort.Strings(ids)
	out := make([]*Entity, 0, len(ids))
	for _, id := range ids {
		out = append(out, m.entities[id])
	}
	return out
}

// Link declares a dependency edge (dep -> dependent wiring is derived).
func (m *Model) Link(dependentID, dependencyID string) error {
	dep, ok := m.entities[dependentID]
	if !ok {
		return fmt.Errorf("unknown dependent %q", dependentID)
	}
	d, ok := m.entities[dependencyID]
	if !ok {
		return fmt.Errorf("unknown dependency %q", dependencyID)
	}
	dep.Dependencies = appendUnique(dep.Dependencies, dependencyID)
	d.Dependents = appendUnique(d.Dependents, dependentID)
	return nil
}

// LinkTests associates tests with an entity.
func (m *Model) LinkTests(entityID string, testIDs ...string) error {
	e, ok := m.entities[entityID]
	if !ok {
		return fmt.Errorf("unknown entity %q", entityID)
	}
	for _, t := range testIDs {
		e.Tests = appendUnique(e.Tests, t)
	}
	return nil
}

// AttachEvidence attaches evidence IDs to an entity and raises confidence.
func (m *Model) AttachEvidence(entityID string, evidenceIDs ...string) {
	e, ok := m.entities[entityID]
	if !ok {
		return
	}
	for _, id := range evidenceIDs {
		if !contains(e.Evidence, id) {
			e.Evidence = append(e.Evidence, id)
		}
	}
	n := len(e.Evidence)
	e.Confidence = 1 - 1/(float64(n)+1) // asymptotic confidence by evidence count
}

func appendUnique(s []string, v string) []string {
	if contains(s, v) {
		return s
	}
	return append(s, v)
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Requirement Engine (spec §6)
// ---------------------------------------------------------------------------

// RequirementKind classifies a requirement (spec §6 categories).
type RequirementKind string

const (
	ReqUserDefined   RequirementKind = "USER_DEFINED"
	ReqSystemDerived RequirementKind = "SYSTEM_DERIVED"
	ReqTechnical     RequirementKind = "TECHNICAL"
	ReqSecurity      RequirementKind = "SECURITY"
	ReqPerformance   RequirementKind = "PERFORMANCE"
	ReqReliability   RequirementKind = "RELIABILITY"
	ReqCompatibility RequirementKind = "COMPATIBILITY"
	ReqOperational   RequirementKind = "OPERATIONAL"
)

// Acceptance is one verifiable acceptance criterion.
type Acceptance struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	// Verification tells the planner how to verify: e.g. "static:R0100",
	// "test:TestX", "probe:GET /health", "contract:openapi", "manual".
	Verification string          `json:"verification"`
	State        core.TraceState `json:"state"`
	EvidenceIDs  []string        `json:"evidence_ids,omitempty"`
}

// Requirement is a structured requirement with acceptance criteria.
type Requirement struct {
	ID          string          `json:"id"`
	Kind        RequirementKind `json:"kind"`
	Description string          `json:"description"`
	Acceptance  []Acceptance    `json:"acceptance"`
	Maturity    core.Maturity   `json:"maturity"`
	Priority    int             `json:"priority"` // lower = more important
}

// ParseAcceptanceVerification parses "kind:detail" verification strings.
func ParseAcceptanceVerification(v string) (kind, detail string, err error) {
	parts := strings.SplitN(v, ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("verification %q must be kind:detail", v)
	}
	return parts[0], parts[1], nil
}

// ---------------------------------------------------------------------------
// Traceability (spec §7 + §8)
// ---------------------------------------------------------------------------

// TraceRow is one row of the traceability matrix:
// Requirement -> Design -> Component -> Code -> API -> Data -> External -> Test -> Runtime -> Evidence
type TraceRow struct {
	Requirement string          `json:"requirement"`
	Design      string          `json:"design"`
	Component   string          `json:"component"`
	Code        string          `json:"code"`
	API         string          `json:"api"`
	Data        string          `json:"data"`
	External    string          `json:"external"`
	Tests       []string        `json:"tests"`
	Runtime     []string        `json:"runtime"` // runtime observation evidence IDs
	Evidence    []string        `json:"evidence"`
	State       core.TraceState `json:"state"`
	Reason      string          `json:"reason,omitempty"`
}

// TraceMatrix computes the requirement traceability matrix for the model.
// A row is VERIFIED only when every mandatory link exists AND evidence exists.
func (m *Model) TraceMatrix() []TraceRow {
	reqs := m.ByType(EntityRequirement)
	rows := make([]TraceRow, 0, len(reqs))
	for _, r := range reqs {
		row := TraceRow{Requirement: r.ID, State: core.TraceVerified}
		missing := []string{}

		// Component via dependency edge (requirement depends_on component or is linked).
		comps := m.dependentsOfTypes(r.ID, EntityComponent, EntityFeature)
		if len(comps) == 0 {
			missing = append(missing, "component")
		} else {
			row.Component = strings.Join(comps, ",")
		}
		// Code: any function/class entity that lists this requirement.
		code := m.entitiesRequiring(r.ID, EntityFunction, EntityClass, EntityModule)
		if len(code) == 0 {
			missing = append(missing, "code")
		} else {
			row.Code = strings.Join(code, ",")
		}
		// API/routes (only if the model declares APIs; optional).
		apis := m.entitiesRequiring(r.ID, EntityAPI, EntityRoute)
		if len(apis) > 0 {
			row.API = strings.Join(apis, ",")
		}
		// Data entities (optional unless declared).
		data := m.entitiesRequiring(r.ID, EntityDatabase, EntityTable, EntitySchema, EntityMigration)
		if len(data) > 0 {
			row.Data = strings.Join(data, ",")
		}
		// External dependencies (optional).
		ext := m.entitiesRequiring(r.ID, EntityExternal, EntityProvider, EntityDependency)
		if len(ext) > 0 {
			row.External = strings.Join(ext, ",")
		}
		// Tests.
		tests := m.entitiesRequiring(r.ID, EntityTest, EntityE2E)
		if len(tests) == 0 {
			missing = append(missing, "tests")
		} else {
			row.Tests = tests
		}
		// Runtime observations.
		if len(r.RuntimeObservations) == 0 {
			missing = append(missing, "runtime")
		} else {
			row.Runtime = r.RuntimeObservations
		}
		// Evidence.
		if len(r.Evidence) == 0 {
			missing = append(missing, "evidence")
		} else {
			row.Evidence = r.Evidence
		}

		switch {
		case len(missing) == 0:
			row.State = core.TraceVerified
		case len(row.Evidence) > 0 || len(row.Code) > 0:
			row.State = core.TracePartial
		case contains(missing, "runtime") && len(missing) == 1:
			row.State = core.TracePartial
		default:
			row.State = core.TraceMissing
		}
		if row.State != core.TraceVerified {
			row.Reason = "missing: " + strings.Join(missing, ", ")
		}
		rows = append(rows, row)
	}
	return rows
}

// ReverseTrace finds code entities that trace to no requirement (spec §8):
// untraceable code, feature drift, dead functionality.
func (m *Model) ReverseTrace() []Untraceable {
	var out []Untraceable
	for _, e := range m.All() {
		switch e.Type {
		case EntityFunction, EntityClass, EntityModule, EntityRoute, EntityAPI:
			if len(e.Requirements) == 0 {
				out = append(out, Untraceable{
					EntityID: e.ID, Type: e.Type, Location: e.Location,
					Kind: kindOfUntraceable(e),
				})
			}
		}
	}
	return out
}

// Untraceable is a code entity with no requirement linkage.
type Untraceable struct {
	EntityID string     `json:"entity_id"`
	Type     EntityType `json:"type"`
	Location string     `json:"location,omitempty"`
	Kind     string     `json:"kind"` // UNTRACEABLE_CODE | FEATURE_DRIFT | DEAD_FUNCTIONALITY
}

func kindOfUntraceable(e *Entity) string {
	switch {
	case e.Status == StatusDone:
		return "FEATURE_DRIFT"
	case len(e.Tests) == 0 && len(e.Dependents) == 0:
		return "DEAD_FUNCTIONALITY"
	default:
		return "UNTRACEABLE_CODE"
	}
}

func (m *Model) dependentsOfTypes(id string, types ...EntityType) []string {
	var out []string
	if e, ok := m.Get(id); ok {
		for _, dep := range e.Dependents {
			if d, ok := m.Get(dep); ok {
				for _, t := range types {
					if d.Type == t {
						out = append(out, d.ID)
						break
					}
				}
			}
		}
	}
	sort.Strings(out)
	return out
}

func (m *Model) entitiesRequiring(reqID string, types ...EntityType) []string {
	var out []string
	for _, t := range types {
		for _, e := range m.ByType(t) {
			if contains(e.Requirements, reqID) {
				out = append(out, e.ID)
			}
		}
	}
	sort.Strings(out)
	return out
}
