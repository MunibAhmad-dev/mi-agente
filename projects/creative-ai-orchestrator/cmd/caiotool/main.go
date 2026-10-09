// ============================================================================
// CAIO Tool — High-performance helper binary for Creative AI Orchestrator
// ============================================================================
// Commands:
//   hw detect       — Detect GPU, VRAM, RAM, CPU, CUDA, disk
//   hash <file>     — Fast SHA256 file hashing
//   proc            — Process management
//   bench           — Quick system benchmark
//   watch <dir>     — File system watcher
//   img             — Image processing pipeline
//   ffmpeg          — FFmpeg wrapper
//   compress        — File compression
//   network         — Network diagnostics
// ============================================================================

package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)


type HardwareInfo struct {
	OS        string    `json:"os"`
	Arch      string    `json:"arch"`
	CPUCount  int       `json:"cpuCount"`
	CPUModel  string    `json:"cpuModel"`
	RAMMB     uint64    `json:"ramMb"`
	FreeDiskMB uint64   `json:"freeDiskMb"`
	GPUs      []GPUInfo `json:"gpus"`
	CUDA      bool      `json:"cuda"`
	CUDAVer   string    `json:"cudaVersion,omitempty"`
	ROCM      bool      `json:"rocm"`
	Python    string    `json:"python,omitempty"`
}

type GPUInfo struct {
	Name   string `json:"name"`
	VRAMMB int    `json:"vramMb"`
	Driver string `json:"driver,omitempty"`
}

type HashResult struct {
	File   string `json:"file"`
	Hash   string `json:"hash"`
	Size   int64  `json:"size"`
	TimeMs int64  `json:"timeMs"`
}

type ProcessInfo struct {
	PID     int    `json:"pid"`
	Name    string `json:"name"`
	Status  string `json:"status"`
	MemoryMB uint64 `json:"memoryMb"`
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "hw":
		cmdHW()
	case "hash":
		cmdHash()
	case "proc":
		cmdProc()
	case "bench":
		cmdBench()
	case "watch":
		cmdWatch()
	case "img":
		cmdImg()
	case "ffmpeg":
		cmdFFmpeg()
	case "compress":
		cmdCompress()
	case "network":
		cmdNetwork()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("CAIO Tool — Creative AI Orchestrator helper binary")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  hw detect          Detect hardware (GPU, VRAM, RAM, CPU, CUDA)")
	fmt.Println("  hash <file>        Fast SHA256 file hashing")
	fmt.Println("  proc start <cmd>   Start background process")
	fmt.Println("  proc status <pid>  Check process status")
	fmt.Println("  proc stop <pid>    Stop process")
	fmt.Println("  bench              System benchmark")
	fmt.Println("  watch <dir>        Watch directory (JSON events)")
	fmt.Println("  img <cmd>          Image processing (analyze/resize/sharpen/denoise/compare)")
	fmt.Println("  ffmpeg <cmd>       FFmpeg wrapper (probe/thumbnail/transcode/concat/extract-audio)")
	fmt.Println("  compress <cmd>     Compression (gzip/gunzip/tar/untar)")
	fmt.Println("  network <cmd>      Network (ping/speed/dns/connectivity)")
}

// ============================================================================
// hw detect
// ============================================================================

func cmdHW() {
	if len(os.Args) < 3 || os.Args[2] != "detect" {
		fmt.Println("Usage: caiotool hw detect")
		os.Exit(1)
	}

	hw := HardwareInfo{
		OS:       runtime.GOOS,
		Arch:     runtime.GOARCH,
		CPUCount: runtime.NumCPU(),
	}

	// RAM (platform-specific)
	hw.RAMMB = getRAM()
	if hw.RAMMB == 0 {
		hw.RAMMB = estimateRAM()
	}

	// CPU model (Linux)
	if data, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "model name") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					hw.CPUModel = strings.TrimSpace(parts[1])
				}
				break
			}
		}
	}

	// Free disk (platform-specific)
	hw.FreeDiskMB = getFreeDisk()

	// GPU detection
	hw.GPUs = detectGPUs()

	// CUDA detection
	if out, err := exec.Command("nvcc", "--version").CombinedOutput(); err == nil {
		hw.CUDA = true
		for _, line := range strings.Split(string(out), "\n") {
			if strings.Contains(line, "release") {
				parts := strings.Split(line, "release")
				if len(parts) > 1 {
					hw.CUDAVer = strings.TrimSpace(strings.Split(parts[1], ",")[0])
				}
			}
		}
	}

	// Python detection
	for _, py := range []string{"python3", "python"} {
		if path, err := exec.LookPath(py); err == nil {
			hw.Python = path
			break
		}
	}

	// Windows: also check common paths
	if hw.OS == "windows" && hw.Python == "" {
		for _, p := range []string{
			`C:\Python312\python.exe`,
			`C:\Python311\python.exe`,
			`C:\Python310\python.exe`,
			filepath.Join(os.Getenv("LOCALAPPDATA"), `Programs\Python\Python312\python.exe`),
		} {
			if _, err := os.Stat(p); err == nil {
				hw.Python = p
				break
			}
		}
	}

	output, _ := json.MarshalIndent(hw, "", "  ")
	fmt.Println(string(output))
}

func detectGPUs() []GPUInfo {
	gpus := []GPUInfo{}

	// NVIDIA via nvidia-smi
	if out, err := exec.Command("nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits").CombinedOutput(); err == nil {
		for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			if line == "" {
				continue
			}
			parts := strings.Split(line, ",")
			if len(parts) >= 3 {
				vram, _ := strconv.Atoi(strings.TrimSpace(parts[1]))
				gpus = append(gpus, GPUInfo{
					Name:   strings.TrimSpace(parts[0]),
					VRAMMB: vram,
					Driver: strings.TrimSpace(parts[2]),
				})
			}
		}
	}

	// macOS: Apple Silicon
	if runtime.GOOS == "darwin" {
		if out, err := exec.Command("system_profiler", "SPDisplaysDataType").CombinedOutput(); err == nil {
			if strings.Contains(string(out), "Apple") {
				gpus = append(gpus, GPUInfo{Name: "Apple Silicon (MPS)", VRAMMB: -1})
			}
		}
	}

	// Windows: WMI fallback (basic)
	if runtime.GOOS == "windows" && len(gpus) == 0 {
		if out, err := exec.Command("wmic", "path", "win32_videocontroller", "get", "name,AdapterRAM", "/format:list").CombinedOutput(); err == nil {
			lines := strings.Split(string(out), "\n")
			var name string
			var vram int
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "Name=") {
					name = strings.TrimPrefix(line, "Name=")
				}
				if strings.HasPrefix(line, "AdapterRAM=") {
					v, _ := strconv.Atoi(strings.TrimPrefix(line, "AdapterRAM="))
					vram = v / (1024 * 1024)
				}
				if name != "" && vram > 0 {
					gpus = append(gpus, GPUInfo{Name: name, VRAMMB: vram})
					name = ""
					vram = 0
				}
			}
		}
	}

	return gpus
}

func estimateRAM() uint64 {
	// Windows: use wmic
	if runtime.GOOS == "windows" {
		if out, err := exec.Command("wmic", "os", "get", "TotalVisibleMemorySize", "/value").CombinedOutput(); err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if strings.HasPrefix(line, "TotalVisibleMemorySize=") {
					v, _ := strconv.ParseUint(strings.TrimPrefix(line, "TotalVisibleMemorySize="), 10, 64)
					return v / 1024
				}
			}
		}
	}
	return 0
}



// ============================================================================
// hash
// ============================================================================

func cmdHash() {
	if len(os.Args) < 3 {
		fmt.Println("Usage: caiotool hash <file>")
		os.Exit(1)
	}

	filePath := os.Args[2]
	start := time.Now()

	f, err := os.Open(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer f.Close()

	h := sha256.New()
	written, err := io.Copy(h, f)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	elapsed := time.Since(start).Milliseconds()

	result := HashResult{
		File:   filePath,
		Hash:   fmt.Sprintf("%x", h.Sum(nil)),
		Size:   written,
		TimeMs: elapsed,
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

// ============================================================================
// proc
// ============================================================================

func cmdProc() {
	if len(os.Args) < 3 {
		fmt.Println("Usage: caiotool proc <start|status|stop> [args...]")
		os.Exit(1)
	}

	switch os.Args[2] {
	case "start":
		cmdProcStart()
	case "status":
		cmdProcStatus()
	case "stop":
		cmdProcStop()
	default:
		fmt.Fprintf(os.Stderr, "Unknown proc subcommand: %s\n", os.Args[2])
		os.Exit(1)
	}
}

func cmdProcStart() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool proc start <command> [args...]")
		os.Exit(1)
	}

	args := os.Args[3:]
	cmd := exec.Command(args[0], args[1:]...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Error starting process: %v\n", err)
		os.Exit(1)
	}

	info := ProcessInfo{
		PID:    cmd.Process.Pid,
		Name:   filepath.Base(args[0]),
		Status: "running",
	}

	output, _ := json.MarshalIndent(info, "", "  ")
	fmt.Println(string(output))
}

func cmdProcStatus() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool proc status <pid>")
		os.Exit(1)
	}

	pid, err := strconv.Atoi(os.Args[3])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Invalid PID: %s\n", os.Args[3])
		os.Exit(1)
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Process not found: %d\n", pid)
		os.Exit(1)
	}

	// Try to signal 0 to check if alive
	err = process.Signal(syscall.Signal(0))
	status := "running"
	if err != nil {
		status = "stopped"
	}

	info := ProcessInfo{
		PID:    pid,
		Status: status,
	}

	output, _ := json.MarshalIndent(info, "", "  ")
	fmt.Println(string(output))
}

func cmdProcStop() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool proc stop <pid>")
		os.Exit(1)
	}

	pid, err := strconv.Atoi(os.Args[3])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Invalid PID: %s\n", os.Args[3])
		os.Exit(1)
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Process not found: %d\n", pid)
		os.Exit(1)
	}

	if err := process.Signal(syscall.SIGTERM); err != nil {
		fmt.Fprintf(os.Stderr, "Error stopping process: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf(`{"pid":%d,"status":"stopped"}\n`, pid)
}

// ============================================================================
// bench
// ============================================================================

func cmdBench() {
	fmt.Println("Running benchmark...")

	// CPU benchmark: hash a 10MB buffer
	start := time.Now()
	data := make([]byte, 10*1024*1024)
	for i := range data {
		data[i] = byte(i % 256)
	}
	h := sha256.New()
	h.Write(data)
	_ = h.Sum(nil)
	cpuTime := time.Since(start)

	// Memory allocation test
	start = time.Now()
	allocs := make([][]byte, 1000)
	for i := range allocs {
		allocs[i] = make([]byte, 1024*1024) // 1MB each
	}
	_ = allocs
	memTime := time.Since(start)

	result := map[string]interface{}{
		"cpuHashTimeMs": cpuTime.Milliseconds(),
		"memAllocTimeMs": memTime.Milliseconds(),
		"cpuCores":       runtime.NumCPU(),
		"os":             runtime.GOOS,
		"arch":           runtime.GOARCH,
		"goVersion":      runtime.Version(),
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}
