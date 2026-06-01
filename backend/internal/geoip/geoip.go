// Package geoip provides optional IP geolocation via a MaxMind GeoLite2 database.
// If no DB path is configured, all lookups return nil.
package geoip

import (
	"log/slog"
	"net"

	"github.com/oschwald/geoip2-golang"

	"github.com/XinFinOrg/XDCStats/backend/internal/node"
)

type Lookup struct {
	db *geoip2.Reader
}

// Open loads the GeoLite2-City.mmdb at the given path.
// Returns a no-op Lookup if path is empty.
func Open(path string) *Lookup {
	if path == "" {
		return &Lookup{}
	}
	db, err := geoip2.Open(path)
	if err != nil {
		slog.Warn("geoip: failed to open DB, geo lookup disabled", "path", path, "err", err)
		return &Lookup{}
	}
	slog.Info("geoip: loaded", "path", path)
	return &Lookup{db: db}
}

// Close releases the database file handle.
func (l *Lookup) Close() {
	if l.db != nil {
		l.db.Close()
	}
}

// Lookup returns geo data for the given IP, or nil if unavailable.
func (l *Lookup) Lookup(ip string) node.NodeGeo {
	if l.db == nil {
		return nil
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return nil
	}
	record, err := l.db.City(parsed)
	if err != nil {
		return nil
	}
	geo := node.NodeGeo{
		"lat":     record.Location.Latitude,
		"lng":     record.Location.Longitude,
		"city":    record.City.Names["en"],
		"country": record.Country.IsoCode,
	}
	return geo
}
