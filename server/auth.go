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
	idleTimeout  = 30 * time.Minute
	loginDelay   = 3 * time.Second
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
	mu           sync.Mutex
	verifier     *passwordVerifier
	auth         *AuthSession
	term         *TerminalSession
	nextTermID   uint64
	cookieSecure bool
	streaming    bool
}

func NewServer(password string, cookieSecure bool) *Server {
	return &Server{
		verifier:     newPasswordVerifier(password),
		cookieSecure: cookieSecure,
	}
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   maxAge,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cookieSecure,
		SameSite: http.SameSiteStrictMode,
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
		idle := false
		if s.auth != nil && time.Since(s.auth.LastActive) > idleTimeout {
			idle = true
		}
		if s.term != nil && time.Since(s.term.LastActive) > idleTimeout {
			idle = true
		}
		if idle {
			s.destroyTerminalLocked()
			s.auth = nil
			s.streaming = false
		}
		s.mu.Unlock()
	}
}
