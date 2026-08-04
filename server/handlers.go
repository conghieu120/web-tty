package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"
)

var (
	errTerminalExists = errors.New("terminal already open")
	errNoTerminal     = errors.New("no terminal")
)

type loginRequest struct {
	Password string `json:"password"`
}

type inputRequest struct {
	Data string `json:"data"`
}

type resizeRequest struct {
	Rows uint16 `json:"rows"`
	Cols uint16 `json:"cols"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	var req loginRequest
	dec := json.NewDecoder(io.LimitReader(r.Body, 4<<10))
	if err := dec.Decode(&req); err != nil || req.Password == "" {
		s.loginFail(w, start)
		return
	}

	if !s.verifier.verify(req.Password) {
		s.loginFail(w, start)
		return
	}

	s.mu.Lock()
	s.destroyTerminalLocked()
	token, err := newSessionToken()
	if err != nil {
		s.mu.Unlock()
		s.waitLoginDelay(start)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	now := time.Now()
	s.auth = &AuthSession{Token: token, CreatedAt: now, LastActive: now}
	s.mu.Unlock()

	s.waitLoginDelay(start)
	s.setSessionCookie(w, token, 0)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) loginFail(w http.ResponseWriter, start time.Time) {
	s.waitLoginDelay(start)
	writeError(w, http.StatusUnauthorized, "invalid credentials")
}

func (s *Server) waitLoginDelay(start time.Time) {
	if rem := loginDelay - time.Since(start); rem > 0 {
		time.Sleep(rem)
	}
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	s.destroyTerminalLocked()
	s.auth = nil
	s.mu.Unlock()

	s.clearSessionCookie(w)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleTerminalOpen(w http.ResponseWriter, r *http.Request) {
	if err := s.openTerminal(); err != nil {
		if errors.Is(err, errTerminalExists) {
			writeError(w, http.StatusConflict, "terminal already open")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to open terminal")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleTerminalClose(w http.ResponseWriter, r *http.Request) {
	s.closeTerminal()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleTerminalInput(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, inputMaxBody)

	var req inputRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "body too large")
			return
		}
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	if err := s.writeTerminal([]byte(req.Data)); err != nil {
		if errors.Is(err, errNoTerminal) {
			writeError(w, http.StatusConflict, "no terminal")
			return
		}
		writeError(w, http.StatusInternalServerError, "write failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleTerminalResize(w http.ResponseWriter, r *http.Request) {
	var req resizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Rows == 0 || req.Cols == 0 {
		writeError(w, http.StatusBadRequest, "invalid size")
		return
	}

	if err := s.resizeTerminal(req.Rows, req.Cols); err != nil {
		if errors.Is(err, errNoTerminal) {
			writeError(w, http.StatusConflict, "no terminal")
			return
		}
		writeError(w, http.StatusInternalServerError, "resize failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleTerminalStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	s.mu.Lock()
	if s.term == nil {
		s.mu.Unlock()
		writeError(w, http.StatusConflict, "no terminal")
		return
	}
	if s.streaming {
		s.mu.Unlock()
		writeError(w, http.StatusConflict, "stream already active")
		return
	}
	termID := s.term.ID
	ptmx := s.term.ptmx
	s.streaming = true
	s.mu.Unlock()

	// Close only this terminal session when the stream ends (not a newer replacement).
	defer s.closeTerminalByID(termID)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()

	ctx := r.Context()
	readCh := make(chan readResult, 8)
	go func() {
		tmp := make([]byte, 4096)
		for {
			n, err := ptmx.Read(tmp)
			chunk := make([]byte, n)
			copy(chunk, tmp[:n])
			select {
			case readCh <- readResult{data: chunk, err: err}:
			case <-ctx.Done():
				return
			}
			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ping.C:
			if _, err := io.WriteString(w, "event: ping\ndata: {}\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case res := <-readCh:
			if len(res.data) > 0 {
				s.mu.Lock()
				if s.term != nil && s.term.ID == termID {
					s.term.LastActive = time.Now()
					if s.auth != nil {
						s.auth.LastActive = s.term.LastActive
					}
				}
				s.mu.Unlock()

				payload := base64.StdEncoding.EncodeToString(res.data)
				if _, err := io.WriteString(w, "event: output\ndata: "+payload+"\n\n"); err != nil {
					return
				}
				flusher.Flush()
			}
			if res.err != nil {
				return
			}
		}
	}
}

type readResult struct {
	data []byte
	err  error
}
