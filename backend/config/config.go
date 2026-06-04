package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port            int
	WSSecrets       []string
	AdminSecret     string
	MongoDBURL      string
	EnableForensics bool
	MasterNodeURL   string
	GeoIPDBPath     string
}

func Load() *Config {
	port := 2000
	if p := os.Getenv("PORT"); p != "" {
		if n, err := strconv.Atoi(p); err == nil {
			port = n
		}
	}

	wsSecret := os.Getenv("WS_SECRET")
	if wsSecret == "" {
		wsSecret = "xinfin_xdpos_hybrid_network_stats"
	}
	secrets := strings.Split(wsSecret, "|")

	mongoURL := os.Getenv("MONGODBURL")
	if mongoURL == "" {
		mongoURL = "localhost:27017"
	}

	masternodeURL := os.Getenv("MASTERNODE_URL")
	if masternodeURL == "" {
		masternodeURL = "https://master.xinfin.network/api"
	}

	return &Config{
		Port:            port,
		WSSecrets:       secrets,
		AdminSecret:     os.Getenv("ADMIN_SECRET"),
		MongoDBURL:      mongoURL,
		EnableForensics: os.Getenv("ENABLE_FORENSICS") == "true",
		MasterNodeURL:   masternodeURL,
		GeoIPDBPath:     os.Getenv("GEOIP_DB_PATH"),
	}
}
