package contract

import (
	"os"
	"path/filepath"
	"testing"

	"verificationengine/internal/core"
	"verificationengine/internal/parser"
)

func scanOf(t *testing.T, dir string) *parser.ScanResult {
	t.Helper()
	scan, err := parser.Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	return scan
}

func TestOpenAPIDetectsUnconnectedRoute(t *testing.T) {
	dir := t.TempDir()
	doc := `{"paths": {"/pets": {"get": {"operationId": "listPets", "responses": {"200": {}}}}}}`
	if err := os.WriteFile(filepath.Join(dir, "openapi.json"), []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	evs, err := CheckOpenAPI("run-oapi", dir, scanOf(t, dir))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, ev := range evs {
		if ev.Severity == core.SevHigh && ev.Target == "api:GET /pets" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected UNCONNECTED documented route: %+v", evs)
	}
}

func TestOpenAPIConnectedRoutePasses(t *testing.T) {
	dir := t.TempDir()
	doc := `{"paths": {"/pets": {"get": {"operationId": "listPets", "responses": {"200": {}}}}}}`
	if err := os.WriteFile(filepath.Join(dir, "openapi.json"), []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "routes.go"), []byte("package x\n\nfunc Setup() {\n\tr.Get(\"/pets\", listPetsHandler)\n}\n\nfunc listPetsHandler() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	evs, err := CheckOpenAPI("run-oapi2", dir, scanOf(t, dir))
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range evs {
		if ev.Target == "api:GET /pets" && ev.Severity == core.SevHigh {
			t.Fatalf("connected route flagged: %+v", evs)
		}
	}
}

func TestEventContractMissingField(t *testing.T) {
	dir := t.TempDir()
	manifest := `[{"topic":"order.created","required_fields":["order_id","total"]}]`
	if err := os.WriteFile(filepath.Join(dir, "events.json"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	// Producer references topic but only one of the required fields.
	code := "package x\n\nfunc P() {\n\tPublish(\"order.created\", map[string]any{\"order_id\": 1})\n}\n"
	if err := os.WriteFile(filepath.Join(dir, "producer.go"), []byte(code), 0o644); err != nil {
		t.Fatal(err)
	}
	evs, err := CheckEventContracts("run-ev", dir, scanOf(t, dir))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, ev := range evs {
		if ev.Target == "event:order.created" && ev.Severity == core.SevHigh {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected missing-field evidence: %+v", evs)
	}
}

func TestMigrationSyncMissingDown(t *testing.T) {
	dir := t.TempDir()
	mig := filepath.Join(dir, "migrations")
	if err := os.MkdirAll(mig, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(mig, "001_users.sql"), []byte("-- +goose Up\nCREATE TABLE users(id INT);"), 0o644); err != nil {
		t.Fatal(err)
	}
	evs, err := CheckMigrationSync("run-mig", dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 || evs[0].Target != "migration:001_users.sql" {
		t.Fatalf("expected missing-down evidence: %+v", evs)
	}
}
