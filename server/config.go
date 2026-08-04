package main

import (
	"log"
	"os"
	"strconv"
	"time"
)

type Config struct {
	IdleTimeout  time.Duration
	LoginDelay   time.Duration
	CookieMaxAge int // seconds; 0 = session cookie
	MaxTerminals int
}

func loadConfig() Config {
	cfg := Config{
		IdleTimeout:  envDuration("IDLE_TIMEOUT", 30*time.Minute),
		LoginDelay:   envDuration("LOGIN_DELAY", 3*time.Second),
		CookieMaxAge: envInt("COOKIE_MAX_AGE", 7*24*60*60), // 7 days
		MaxTerminals: envInt("MAX_TERMINALS", 5),
	}
	if cfg.MaxTerminals < 1 {
		log.Fatal("MAX_TERMINALS must be >= 1")
	}
	if cfg.CookieMaxAge < 0 {
		log.Fatal("COOKIE_MAX_AGE must be >= 0")
	}
	return cfg
}

func envDuration(key string, fallback time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	d, err := time.ParseDuration(raw)
	if err != nil || d <= 0 {
		log.Fatalf("%s: invalid duration %q (examples: 30m, 3s)", key, raw)
	}
	return d
}

func envInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		log.Fatalf("%s: invalid integer %q", key, raw)
	}
	return n
}
