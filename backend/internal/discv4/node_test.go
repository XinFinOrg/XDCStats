package discv4

import "testing"

func TestParseNode(t *testing.T) {
	enode := "enode://efc710050d65cda5d563fc6c9520986a69bbed81036b427a5ad7a2079bc8ba421e78d291a9388a1bd10ff5d9afdc2a095900528f5c45942104d818feda37cf7a@154.12.116.170:30301"
	n, err := ParseNode(enode)
	if err != nil {
		t.Fatal(err)
	}
	if n.Endpoint() != "154.12.116.170:30301" {
		t.Fatalf("endpoint = %q, want 154.12.116.170:30301", n.Endpoint())
	}
	if n.UDP != 30301 || n.TCP != 30301 {
		t.Fatalf("ports udp=%d tcp=%d", n.UDP, n.TCP)
	}
	if n.TCPEndpoint() != "154.12.116.170:30301" {
		t.Fatalf("tcp endpoint = %q, want 154.12.116.170:30301", n.TCPEndpoint())
	}
}
