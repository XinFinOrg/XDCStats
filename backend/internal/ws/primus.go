// Package ws implements the Primus wire protocol over gorilla/websocket.
// XDPoSChain nodes send {"emit":["event-name", payload]} and respond to
// {"primus::ping::": timestampMs} with {"primus::pong::": timestampMs}.
package ws

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	pingInterval  = 30 * time.Second
	writeDeadline = 10 * time.Second
	readLimit     = 15 * 1024 * 1024 // 15 MB
)

// Conn is a thread-safe wrapper around a gorilla WebSocket connection
// that speaks the Primus wire protocol.
type Conn struct {
	mu      sync.Mutex
	ws      *websocket.Conn
	latency int64 // RTT in ms, updated on pong
}

func NewConn(ws *websocket.Conn) *Conn {
	ws.SetReadLimit(readLimit)
	return &Conn{ws: ws}
}

// Emit sends a Primus-framed event.
// With payload:    {"emit":["name", payload]}
// Without payload: {"emit":["name"]}  ← XDPoSChain login expects exactly 1 element for "ready"
func (c *Conn) Emit(event string, payload interface{}) error {
	var emit []interface{}
	if payload != nil {
		emit = []interface{}{event, payload}
	} else {
		emit = []interface{}{event}
	}
	msg := map[string]interface{}{"emit": emit}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ws.SetWriteDeadline(time.Now().Add(writeDeadline))
	return c.ws.WriteMessage(websocket.TextMessage, data)
}

// ReadEvent reads one message and parses it as a Primus emit or ping/pong.
// Returns event name and raw payload bytes, or ("primus::ping::", nil) for heartbeat.
func (c *Conn) ReadEvent() (string, json.RawMessage, error) {
	_, data, err := c.ws.ReadMessage()
	if err != nil {
		return "", nil, err
	}

	// Try Primus ping/pong: {"primus::ping::": timestamp} or {"primus::pong::": timestamp}
	var pingMsg map[string]json.RawMessage
	if json.Unmarshal(data, &pingMsg) == nil {
		if ts, ok := pingMsg["primus::ping::"]; ok {
			return "primus::ping::", ts, nil
		}
		if ts, ok := pingMsg["primus::pong::"]; ok {
			return "primus::pong::", ts, nil
		}
	}

	// Try emit envelope: {"emit":["event", payload]}
	var env struct {
		Emit []json.RawMessage `json:"emit"`
	}
	if err := json.Unmarshal(data, &env); err != nil || len(env.Emit) < 1 {
		return "", nil, nil // silently skip unrecognised frames
	}

	var eventName string
	if err := json.Unmarshal(env.Emit[0], &eventName); err != nil {
		return "", nil, nil
	}

	var payload json.RawMessage
	if len(env.Emit) >= 2 {
		payload = env.Emit[1]
	}
	return eventName, payload, nil
}

// SendPong replies to a Primus ping with a matching pong.
func (c *Conn) SendPong(ts json.RawMessage) error {
	msg := map[string]json.RawMessage{"primus::pong::": ts}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ws.SetWriteDeadline(time.Now().Add(writeDeadline))
	return c.ws.WriteMessage(websocket.TextMessage, data)
}

// StartPing sends Primus pings at pingInterval and measures RTT latency.
// Call in a goroutine; stops when done is closed or write fails.
func (c *Conn) StartPing(done <-chan struct{}, onLatency func(ms int64)) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			sent := time.Now().UnixMilli()
			msg := map[string]int64{"primus::ping::": sent}
			data, _ := json.Marshal(msg)
			c.mu.Lock()
			c.ws.SetWriteDeadline(time.Now().Add(writeDeadline))
			err := c.ws.WriteMessage(websocket.TextMessage, data)
			c.mu.Unlock()
			if err != nil {
				return
			}
			// latency is updated when the read loop sees primus::pong::
			_ = onLatency
		}
	}
}

// Close closes the underlying WebSocket.
func (c *Conn) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ws.Close()
}

// RemoteAddr returns the peer address string.
func (c *Conn) RemoteAddr() string {
	return c.ws.RemoteAddr().String()
}
