package main

import (
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
)

type TerminalSession struct {
	ID         uint64
	ptmx       *os.File
	cmd        *exec.Cmd
	CreatedAt  time.Time
	LastActive time.Time
	streaming  bool
	writeMu    sync.Mutex
}

func (s *Server) destroyTerminalLocked(id uint64) {
	t, ok := s.terms[id]
	if !ok {
		return
	}
	delete(s.terms, id)

	if t.cmd != nil && t.cmd.Process != nil {
		// Wipe shell + background jobs in the PTY session (not Docker -d, etc.).
		killTerminalProcessTree(t.cmd.Process.Pid)
		_, _ = t.cmd.Process.Wait()
	}
	if t.ptmx != nil {
		_ = t.ptmx.Close()
	}
}

func (s *Server) destroyAllTerminalsLocked() {
	for id := range s.terms {
		s.destroyTerminalLocked(id)
	}
}

func (s *Server) openTerminal() (*TerminalSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.terms) >= s.cfg.MaxTerminals {
		return nil, errTooManyTerminals
	}

	cmd := exec.Command("/bin/bash")
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		cmd.Dir = home
	}

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	s.nextTermID++
	now := time.Now()
	t := &TerminalSession{
		ID:         s.nextTermID,
		ptmx:       ptmx,
		cmd:        cmd,
		CreatedAt:  now,
		LastActive: now,
	}
	s.terms[t.ID] = t
	if s.auth != nil {
		s.auth.LastActive = now
	}
	return t, nil
}

func (s *Server) writeTerminal(id uint64, data []byte) error {
	s.mu.Lock()
	t := s.terms[id]
	if t != nil {
		now := time.Now()
		t.LastActive = now
		if s.auth != nil {
			s.auth.LastActive = now
		}
	}
	s.mu.Unlock()

	if t == nil {
		return errNoTerminal
	}

	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	_, err := t.ptmx.Write(data)
	return err
}

func (s *Server) resizeTerminal(id uint64, rows, cols uint16) error {
	s.mu.Lock()
	t := s.terms[id]
	if t != nil {
		now := time.Now()
		t.LastActive = now
		if s.auth != nil {
			s.auth.LastActive = now
		}
	}
	s.mu.Unlock()

	if t == nil {
		return errNoTerminal
	}
	return pty.Setsize(t.ptmx, &pty.Winsize{Rows: rows, Cols: cols})
}

func (s *Server) closeTerminal(id uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.destroyTerminalLocked(id)
}
