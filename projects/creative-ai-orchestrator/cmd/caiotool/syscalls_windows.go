//go:build windows

package main

import (
	"os/exec"
	"strconv"
	"strings"
)

func getRAM() uint64 {
	out, err := exec.Command("powershell.exe", "-NoProfile", "-Command", "(Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize").CombinedOutput()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		if len(lines) > 0 {
			v, _ := strconv.ParseUint(strings.TrimSpace(lines[0]), 10, 64)
			return v / 1024
		}
	}
	return 0
}

func getFreeDisk() uint64 {
	out, err := exec.Command("powershell.exe", "-NoProfile", "-Command", "(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\").FreeSpace / 1MB").CombinedOutput()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		if len(lines) > 0 {
			v, _ := strconv.ParseFloat(strings.TrimSpace(lines[0]), 64)
			return uint64(v)
		}
	}
	return 0
}
