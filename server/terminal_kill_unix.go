//go:build unix

package main

import (
	"bytes"
	"os"
	"strconv"
	"syscall"
)

// killTerminalProcessTree SIGKILLs every process in the PTY session.
// creack/pty starts the shell with Setsid, so the shell PID is the session ID.
// Background jobs (e.g. "sleep 999 &") keep that session even in another
// process group — a plain Kill(shell) would miss them.
func killTerminalProcessTree(pid int) {
	if pid <= 0 {
		return
	}
	for _, p := range sessionPIDs(pid) {
		_ = syscall.Kill(p, syscall.SIGKILL)
	}
	// Negative PID = entire process group of the session leader.
	_ = syscall.Kill(-pid, syscall.SIGKILL)
	_ = syscall.Kill(pid, syscall.SIGKILL)
}

func sessionPIDs(sid int) []int {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil
	}
	out := make([]int, 0, 16)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		p, err := strconv.Atoi(e.Name())
		if err != nil || p <= 1 {
			continue
		}
		if procSessionID(p) == sid {
			out = append(out, p)
		}
	}
	return out
}

func procSessionID(pid int) int {
	data, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/stat")
	if err != nil {
		return -1
	}
	// /proc/pid/stat: pid (comm) state ppid pgrp session ...
	rparen := bytes.LastIndexByte(data, ')')
	if rparen < 0 || rparen+2 >= len(data) {
		return -1
	}
	fields := bytes.Fields(data[rparen+2:])
	if len(fields) < 4 {
		return -1
	}
	sess, err := strconv.Atoi(string(fields[3]))
	if err != nil {
		return -1
	}
	return sess
}
