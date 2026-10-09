// Package contract implements the Contract Engine (spec §1):
// OpenAPI operationId cross-checks, route wiring, event/queue contract
// field checks, and DB schema/migration sync checks.
package contract

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"verificationengine/internal/core"
	"verificationengine/internal/parser"
)

// OpenAPI minimum contract check: parse paths + operationIds.
type openAPIDoc struct {
	Paths map[string]map[string]struct {
		OperationID string              `json:"operationId"`
		Responses   map[string]struct{} `json:"responses"`
	} `json:"paths"`
}

// CheckOpenAPI validates that every documented operation has operationId and
// at least one declared response, and that the route exists in code (by path).
func CheckOpenAPI(runID, root string, scan *parser.ScanResult) ([]core.Evidence, error) {
	var out []core.Evidence
	files, _ := filepath.Glob(filepath.Join(root, "**", "*openapi*.json"))
	files2, _ := filepath.Glob(filepath.Join(root, "openapi.json"))
	files = append(files, files2...)
	files3, _ := filepath.Glob(filepath.Join(root, "**", "*openapi*.yaml"))
	files = append(files, files3...)
	files = dedupe(files)
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		if strings.HasSuffix(strings.ToLower(f), ".json") {
			var doc openAPIDoc
			if err := json.Unmarshal(data, &doc); err != nil {
				out = append(out, ev(runID, f, "invalid OpenAPI JSON: "+err.Error(), core.SevHigh))
				continue
			}
			for path, ops := range doc.Paths {
				for method, op := range ops {
					target := fmt.Sprintf("api:%s %s", strings.ToUpper(method), path)
					if op.OperationID == "" {
						out = append(out, ev(runID, target, "operation without operationId", core.SevMedium))
					}
					if len(op.Responses) == 0 {
						out = append(out, ev(runID, target, "operation without responses contract", core.SevMedium))
					}
					// Route existence in code.
					if !routeRegistered(scan, path) {
						out = append(out, ev(runID, target, "documented route not found registered in code (UNCONNECTED)", core.SevHigh))
					}
				}
			}
		}
	}
	return out, nil
}

func routeRegistered(scan *parser.ScanResult, openAPIPath string) bool {
	for _, r := range scan.Routes {
		if normalizePath(r.Path) == normalizePath(openAPIPath) {
			return true
		}
	}
	return false
}

func normalizePath(p string) string {
	p = strings.TrimRight(p, "/")
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	re := regexp.MustCompile(`\{[^}]+\}`)
	p = re.ReplaceAllString(p, "{}")
	return p
}

func ev(runID, target, msg string, sev core.Severity) core.Evidence {
	e := core.Evidence{
		Kind: core.EvContract, Source: "contract-engine",
		Target: target, Message: msg, Severity: sev, Confidence: 0.9, RunID: runID,
	}
	e.SHA256 = e.Hash()
	return e
}

// ---------------------------------------------------------------------------
// Event/queue contract (spec §5 events/queues; AsyncAPI adapter later)
// ---------------------------------------------------------------------------

// EventContract defines required fields for an event payload.
type EventContract struct {
	Topic          string   `json:"topic"`
	RequiredFields []string `json:"required_fields"`
}

// CheckEventContracts validates producer code declares all required fields.
func CheckEventContracts(runID, root string, scan *parser.ScanResult) ([]core.Evidence, error) {
	var out []core.Evidence
	manifest := filepath.Join(root, "events.json")
	data, err := os.ReadFile(manifest)
	if err != nil {
		return nil, nil // no manifest: nothing to check
	}
	var contracts []EventContract
	if err := json.Unmarshal(data, &contracts); err != nil {
		out = append(out, ev(runID, "events.json", "invalid events manifest: "+err.Error(), core.SevHigh))
		return out, nil
	}
	for _, c := range contracts {
		// Producer must reference the topic and each required field near it.
		found := false
		for path := range scan.Files {
			raw, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			if strings.Contains(string(raw), c.Topic) {
				found = true
				src := string(raw)
				for _, field := range c.RequiredFields {
					if !strings.Contains(src, `"`+field+`"`) && !strings.Contains(src, field) {
						out = append(out, ev(runID, "event:"+c.Topic,
							fmt.Sprintf("required field %q not referenced by any producer of the topic", field), core.SevHigh))
					}
				}
				break
			}
		}
		if !found {
			out = append(out, ev(runID, "event:"+c.Topic, "no producer code references the topic (BROKEN event contract)", core.SevHigh))
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// DB schema/migration sync (spec §5 databases/schemas/migrations)
// ---------------------------------------------------------------------------

// CheckMigrationSync checks that every migration file declares both up and down
// sections, and that schema files reference every migration's tables.
func CheckMigrationSync(runID, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	migDir := filepath.Join(root, "migrations")
	entries, err := os.ReadDir(migDir)
	if err != nil {
		return nil, nil // no migrations dir: nothing to check
	}
	tablesFromMigrations := map[string]bool{}
	for _, e := range entries {
		if e.IsDir() || (!strings.HasSuffix(e.Name(), ".sql") && !strings.HasSuffix(e.Name(), ".go")) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(migDir, e.Name()))
		if err != nil {
			continue
		}
		src := string(data)
		// goose/dbmate style markers.
		hasUp := strings.Contains(src, "-- +goose Up") || strings.Contains(src, "-- migrate:up")
		hasDown := strings.Contains(src, "-- +goose Down") || strings.Contains(src, "-- migrate:down")
		if !hasUp || !hasDown {
			out = append(out, ev(runID, "migration:"+e.Name(),
				fmt.Sprintf("migration missing %s section", missingOf(hasUp, hasDown)), core.SevHigh))
		}
		for _, m := range createTableRe.FindAllStringSubmatch(src, -1) {
			tablesFromMigrations[strings.ToLower(m[1])] = true
		}
	}
	// Schema files must reference every migrated table.
	schemaDir := filepath.Join(root, "schema")
	if entries, err := os.ReadDir(schemaDir); err == nil {
		var schemaSrc strings.Builder
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			if data, err := os.ReadFile(filepath.Join(schemaDir, e.Name())); err == nil {
				schemaSrc.Write(data)
			}
		}
		lower := strings.ToLower(schemaSrc.String())
		for t := range tablesFromMigrations {
			if !strings.Contains(lower, t) {
				out = append(out, ev(runID, "schema:sync",
					fmt.Sprintf("table %q created in migrations but absent from schema files", t), core.SevMedium))
			}
		}
	}
	return out, nil
}

var createTableRe = regexp.MustCompile(`(?i)create\s+table\s+(?:if\s+not\s+exists\s+)?["'` + "`" + `]?(\w+)["'` + "`" + `]?`)

func missingOf(hasUp, hasDown bool) string {
	switch {
	case !hasUp && !hasDown:
		return "up and down"
	case !hasUp:
		return "up"
	default:
		return "down"
	}
}

func dedupe(paths []string) []string {
	seen := map[string]bool{}
	out := []string{}
	sort.Strings(paths)
	for _, p := range paths {
		if !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}
