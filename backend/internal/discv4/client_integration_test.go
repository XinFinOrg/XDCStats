//go:build integration

package discv4

import (
	"testing"
)

func TestPingLiveBootnode(t *testing.T) {
	enode := "enode://efc710050d65cda5d563fc6c9520986a69bbed81036b427a5ad7a2079bc8ba421e78d291a9388a1bd10ff5d9afdc2a095900528f5c45942104d818feda37cf7a@154.12.116.170:30301"
	n, err := ParseNode(enode)
	if err != nil {
		t.Fatal(err)
	}
	client, err := NewClient()
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	rtt, err := client.Ping(n)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("pong RTT %v", rtt)
}
