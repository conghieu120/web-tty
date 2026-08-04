package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"
)

const (
	cookieName   = "web_tty_session"
	idleTimeout  = 30 * time.Minute
	loginDelay   = 3 * time.Second
	argonTime    = 1
	argonMemory  = 64 * 1024
	argonThreads = 4
	argonKeyLen  = 32
	saltLen      = 16
	tokenLen     = 32
	inputMaxBody = 4 << 10
)

type AuthSession struct {
	Token      string
	CreatedAt  time.Time
	LastActive time.Time
}

type passwordVerifier struct {
	salt []byte
	hash []byte
}

func newPasswordVerifier(password string) (*passwordVerifier, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	hash := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return &passwordVerifier{salt: salt, hash: hash}, nil
}

func (v *passwordVerifier) verify(password string) bool {
	hash := argon2.IDKey([]byte(password), v.salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return subtle.ConstantTimeCompare(hash, v.hash) == 1
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
	cookieSecure bool
	streaming    bool
}

func NewServer(password string, cookieSecure bool) (*Server, error) {
	v, err := newPasswordVerifier(password)
	if err != nil {
		return nil, err
	}
	return &Server{
		verifier:     v,
		cookieSecure: cookieSecure,
	}, nil
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
