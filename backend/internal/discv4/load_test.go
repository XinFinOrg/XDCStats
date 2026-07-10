package discv4

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadNodesFromFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bootnodes.list")
	content := `# comment
enode://b5c052b3956a92ff3429e4f09e28e0a464ab7d0e690ab9854de8a3ab9f14715c93d22ef112264256bb844f710f06d7327a187a35e4ce2b5b111427e4b219cce2@10.43.197.209:30301
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	nodes, err := LoadNodesFromFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 {
		t.Fatalf("got %d nodes, want 1", len(nodes))
	}
	if nodes[0].Endpoint() != "10.43.197.209:30301" {
		t.Fatalf("endpoint: got %q, want 10.43.197.209:30301", nodes[0].Endpoint())
	}
}
