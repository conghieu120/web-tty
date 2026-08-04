package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"sync"
	"time"
)

const (
	cookieName   = "web_tty_session"
	tokenLen     = 32
	inputMaxBody = 4 << 10
)

type AuthSession struct {
	Token      string
	CreatedAt  time.Time
	LastActive time.Time
}

type passwordVerifier struct {
	password []byte
}

func newPasswordVerifier(password string) *passwordVerifier {
	return &passwordVerifier{password: []byte(password)}
}

func (v *passwordVerifier) verify(password string) bool {
	return subtle.ConstantTimeCompare(v.password, []byte(password)) == 1
}

func newSessionToken() (string, error) {
	b := make([]byte, tokenLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

type Server struct {
	mu         sync.Mutex
	cfg        Config
	verifier   *passwordVerifier
	auth       *AuthSession
	terms      map[uint64]*TerminalSession
	nextTermID uint64
}

func NewServer(password string, cfg Config) *Server {
	return &Server{
		cfg:      cfg,
		verifier: newPasswordVerifier(password),
		terms:    make(map[uint64]*TerminalSession),
	}
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		MaxAge:   s.cfg.CookieMaxAge,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		MaxAge:   -1,
	})
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(cookieName)
		if err != nil || c.Value == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		s.mu.Lock()
		ok := s.auth != nil && s.auth.Token == c.Value
		if ok {
			s.auth.LastActive = time.Now()
		}
		s.mu.Unlock()

		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next(w, r)
	}
}

func (s *Server) idleLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		idleAuth := s.auth != nil && now.Sub(s.auth.LastActive) > s.cfg.IdleTimeout

		for id, t := range s.terms {
			if now.Sub(t.LastActive) > s.cfg.IdleTimeout {
				s.destroyTerminalLocked(id)
			}
		}

		if idleAuth {
			s.destroyAllTerminalsLocked()
			s.auth = nil
		}
		s.mu.Unlock()
	}
}
