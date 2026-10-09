//go:build !windows

package main

import "syscall"

func getRAM() uint64 {
	var sys syscall.Sysinfo_t
	if err := syscall.Sysinfo(&sys); err == nil {
		return uint64(sys.Totalram) * uint64(sys.Unit) / (1024 * 1024)
	}
	return 0
}

func getFreeDisk() uint64 {
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err == nil {
		return (stat.Bavail * uint64(stat.Bsize)) / (1024 * 1024)
	}
	return 0
}
