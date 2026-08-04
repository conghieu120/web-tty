package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	password := os.Getenv("AUTH_PASSWORD")
	if password == "" {
		log.Fatal("AUTH_PASSWORD is required")
	}
	if os.Getenv("SESSION_SECRET") == "" {
		log.Fatal("SESSION_SECRET is required")
	}

	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	corsOrigins := parseOrigins(os.Getenv("CORS_ORIGINS"))
	if len(corsOrigins) == 0 {
		corsOrigins = []string{
			"http://localhost:5173",
			"http://localhost:5174",
			"http://127.0.0.1:5173",
			"http://127.0.0.1:5174",
		}
	}

	cfg := loadConfig()
	srv := NewServer(password, cfg)
	password = ""

	go srv.idleLoop(time.Minute)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/me", srv.requireAuth(srv.handleMe))
	mux.HandleFunc("POST /api/login", srv.handleLogin)
	mux.HandleFunc("POST /api/logout", srv.requireAuth(srv.handleLogout))
	mux.HandleFunc("POST /api/terminal/open", srv.requireAuth(srv.handleTerminalOpen))
	mux.HandleFunc("GET /api/terminal/{id}/stream", srv.requireAuth(srv.handleTerminalStream))
	mux.HandleFunc("POST /api/terminal/{id}/input", srv.requireAuth(srv.handleTerminalInput))
	mux.HandleFunc("POST /api/terminal/{id}/resize", srv.requireAuth(srv.handleTerminalResize))
	mux.HandleFunc("POST /api/terminal/{id}/close", srv.requireAuth(srv.handleTerminalClose))

	handler := withCORS(corsOrigins, withMaxBody(mux))

	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

func parseOrigins(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func withMaxBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
		}
		next.ServeHTTP(w, r)
	})
}

func withCORS(allowlist []string, next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowlist))
	for _, o := range allowlist {
		allowed[o] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := allowed[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			}
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
