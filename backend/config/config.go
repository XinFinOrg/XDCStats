package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port            int
	WSSecrets       []string
	AdminSecret     string
	MongoDBURL      string
	EnableForensics bool
	MasterNodeURL   string
	GeoIPDBPath     string

	EnableBootnodeHealth bool
	BootnodeNetwork      string
	BootnodeListFile     string
	BootnodeInterval     time.Duration
	BootnodeTimeout      time.Duration
	BootnodeParallel     int
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

	enableBootnodeHealth := os.Getenv("ENABLE_BOOTNODE_HEALTH") != "false"
	bootnodeInterval := 60 * time.Second
	if v := os.Getenv("BOOTNODE_CHECK_INTERVAL"); v != "" {
		if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
			bootnodeInterval = time.Duration(secs) * time.Second
		}
	}
	bootnodeTimeout := 5 * time.Second
	if v := os.Getenv("BOOTNODE_CHECK_TIMEOUT"); v != "" {
		if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
			bootnodeTimeout = time.Duration(secs) * time.Second
		}
	}
	bootnodeParallel := 8
	if v := os.Getenv("BOOTNODE_CHECK_PARALLEL"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			bootnodeParallel = n
		}
	}
	bootnodeNetwork := os.Getenv("BOOTNODE_NETWORK")
	if bootnodeNetwork == "" {
		bootnodeNetwork = "mainnet"
	}

	return &Config{
		Port:            port,
		WSSecrets:       secrets,
		AdminSecret:     os.Getenv("ADMIN_SECRET"),
		MongoDBURL:      mongoURL,
		EnableForensics: os.Getenv("ENABLE_FORENSICS") == "true",
		MasterNodeURL:   masternodeURL,
		GeoIPDBPath:     os.Getenv("GEOIP_DB_PATH"),

		EnableBootnodeHealth: enableBootnodeHealth,
		BootnodeNetwork:      bootnodeNetwork,
		BootnodeListFile:     os.Getenv("BOOTNODE_LIST_FILE"),
		BootnodeInterval:     bootnodeInterval,
		BootnodeTimeout:      bootnodeTimeout,
		BootnodeParallel:     bootnodeParallel,
	}
}
