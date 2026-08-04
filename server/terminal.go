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
	writeMu    sync.Mutex
}

func (s *Server) destroyTerminalLocked() {
	if s.term == nil {
		return
	}
	t := s.term
	s.term = nil
	s.streaming = false

	if t.cmd != nil && t.cmd.Process != nil {
		// Wipe shell + background jobs in the PTY session (not Docker -d, etc.).
		killTerminalProcessTree(t.cmd.Process.Pid)
		_, _ = t.cmd.Process.Wait()
	}
	if t.ptmx != nil {
		_ = t.ptmx.Close()
	}
}

func (s *Server) openTerminal() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.term != nil {
		return errTerminalExists
	}

	cmd := exec.Command("/bin/bash")
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return err
	}

	s.nextTermID++
	now := time.Now()
	s.term = &TerminalSession{
		ID:         s.nextTermID,
		ptmx:       ptmx,
		cmd:        cmd,
		CreatedAt:  now,
		LastActive: now,
	}
	return nil
}

func (s *Server) writeTerminal(data []byte) error {
	s.mu.Lock()
	t := s.term
	if t != nil {
		t.LastActive = time.Now()
		if s.auth != nil {
			s.auth.LastActive = t.LastActive
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

func (s *Server) resizeTerminal(rows, cols uint16) error {
	s.mu.Lock()
	t := s.term
	if t != nil {
		t.LastActive = time.Now()
		if s.auth != nil {
			s.auth.LastActive = t.LastActive
		}
	}
	s.mu.Unlock()

	if t == nil {
		return errNoTerminal
	}
	return pty.Setsize(t.ptmx, &pty.Winsize{Rows: rows, Cols: cols})
}

func (s *Server) closeTerminal() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.destroyTerminalLocked()
}

// closeTerminalByID destroys the terminal only if it is still the same session.
// Safe for stream defer when a newer terminal may already have replaced it.
func (s *Server) closeTerminalByID(id uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.term == nil || s.term.ID != id {
		return
	}
	s.destroyTerminalLocked()
}
