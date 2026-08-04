//go:build windows

package main

// killTerminalProcessTree is a no-op on Windows; the server targets Linux (/bin/bash).
func killTerminalProcessTree(pid int) {}
