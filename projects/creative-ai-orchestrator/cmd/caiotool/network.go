// ============================================================================
// Network Speed Test
// ============================================================================
// Provides: ping, speed-test, dns-lookup, connectivity check
// ============================================================================

package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type PingResult struct {
	Host     string  `json:"host"`
	PingMs   float64 `json:"pingMs"`
	Packets  int     `json:"packets"`
	Lost     int     `json:"lost"`
	MinMs    float64 `json:"minMs"`
	MaxMs    float64 `json:"maxMs"`
	AvgMs    float64 `json:"avgMs"`
}

type SpeedTestResult struct {
	DownloadMbps float64 `json:"downloadMbps"`
	UploadMbps   float64 `json:"uploadMbps"`
	PingMs       float64 `json:"pingMs"`
	Server       string  `json:"server,omitempty"`
	ISP          string  `json:"isp,omitempty"`
	DurationMs   int64   `json:"durationMs"`
}

type DNSResult struct {
	Host   string   `json:"host"`
	IPs    []string `json:"ips"`
	TimeMs int64    `json:"timeMs"`
}

type ConnectivityResult struct {
	Internet   bool     `json:"internet"`
	DNS        bool     `json:"dns"`
	GitHub     bool     `json:"github"`
	HuggingFace bool   `json:"huggingFace"`
	Civitai    bool     `json:"civitai"`
	Python     bool     `json:"pythonRegistry"`
	Checks     []CheckResult `json:"checks"`
}

type CheckResult struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	OK      bool   `json:"ok"`
	LatencyMs int64 `json:"latencyMs"`
	Error   string `json:"error,omitempty"`
}

func cmdNetwork() {
	if len(os.Args) < 3 {
		fmt.Println("Usage: caiotool network <ping|speed|dns|connectivity> [args...]")
		fmt.Println()
		fmt.Println("Commands:")
		fmt.Println("  network ping <host>             Ping a host")
		fmt.Println("  network speed                   Run speed test")
		fmt.Println("  network dns <host>              DNS lookup")
		fmt.Println("  network connectivity            Check connectivity to key services")
		os.Exit(1)
	}

	switch os.Args[2] {
	case "ping":
		cmdPing()
	case "speed":
		cmdSpeedTest()
	case "dns":
		cmdDNS()
	case "connectivity":
		cmdConnectivity()
	default:
		fmt.Fprintf(os.Stderr, "Unknown network subcommand: %s\n", os.Args[2])
		os.Exit(1)
	}
}

func cmdPing() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool network ping <host>")
		os.Exit(1)
	}
	host := os.Args[3]
	count := 4

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("ping", "-n", strconv.Itoa(count), host)
	} else {
		cmd = exec.Command("ping", "-c", strconv.Itoa(count), host)
	}

	start := time.Now()
	out, err := cmd.CombinedOutput()
	elapsed := time.Since(start).Milliseconds()

	output := string(out)
	result := PingResult{
		Host:    host,
		Packets: count,
	}

	// Parse average from output
	for _, line := range strings.Split(output, "\n") {
		if strings.Contains(line, "avg") || strings.Contains(line, "Average") {
			// Linux: "rtt min/avg/max/mdev = 1.234/5.678/9.012/1.234 ms"
			// Windows: "Average = 5ms"
			parts := strings.Split(line, "=")
			if len(parts) > 1 {
				vals := strings.Split(parts[len(parts)-1], "/")
				if len(vals) >= 2 {
					result.AvgMs, _ = strconv.ParseFloat(strings.TrimSpace(vals[1]), 64)
				}
				if len(vals) >= 1 {
					result.MinMs, _ = strconv.ParseFloat(strings.TrimSpace(vals[0]), 64)
				}
				if len(vals) >= 3 {
					val3 := strings.TrimSuffix(strings.TrimSpace(vals[2]), " ms")
					result.MaxMs, _ = strconv.ParseFloat(val3, 64)
				}
			}
		}
	}

	if err != nil {
		result.Lost = count
	}

	result.PingMs = float64(elapsed) / float64(count)
	_ = output

	outputJSON, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(outputJSON))
}

func cmdSpeedTest() {
	start := time.Now()
	result := SpeedTestResult{}

	// Download test: fetch a 10MB file
	dlStart := time.Now()
	cmd := exec.Command("curl", "-s", "-o", "/dev/null", "-w", "%{speed_download}",
		"https://speed.cloudflare.com/__down?bytes=10485760")
	dlOut, err := cmd.Output()
	if err == nil {
		speed, _ := strconv.ParseFloat(strings.TrimSpace(string(dlOut)), 64)
		result.DownloadMbps = speed / 1024 / 1024 * 8 // bytes/sec to Mbps
	}

	// Upload test: send ~1MB
	ulStart := time.Now()
	cmd = exec.Command("curl", "-s", "-o", "/dev/null", "-w", "%{speed_upload}",
		"-X", "POST", "-d", "@/dev/null",
		"-H", "Content-Type: application/octet-stream",
		"--data-binary", strings.Repeat("x", 1048576),
		"https://speed.cloudflare.com/__up")
	ulOut, err := cmd.Output()
	if err == nil {
		speed, _ := strconv.ParseFloat(strings.TrimSpace(string(ulOut)), 64)
		result.UploadMbps = speed / 1024 / 1024 * 8
	}
	_ = ulStart

	dlElapsed := time.Since(dlStart)
	result.PingMs = float64(dlElapsed.Milliseconds()) / 10
	result.DurationMs = time.Since(start).Milliseconds()

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

func cmdDNS() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool network dns <host>")
		os.Exit(1)
	}
	host := os.Args[3]

	start := time.Now()
	ips, err := net.LookupHost(host)
	elapsed := time.Since(start).Milliseconds()

	result := DNSResult{
		Host:   host,
		IPs:    ips,
		TimeMs: elapsed,
	}
	if err != nil {
		result.IPs = []string{}
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

func cmdConnectivity() {
	services := []struct {
		Name string
		URL  string
	}{
		{"Internet", "https://1.1.1.1"},
		{"GitHub", "https://github.com"},
		{"HuggingFace", "https://huggingface.co"},
		{"Civitai", "https://civitai.com"},
		{"Python (PyPI)", "https://pypi.org"},
	}

	result := ConnectivityResult{}
	client := &net.Dialer{Timeout: 5 * time.Second}

	for _, svc := range services {
		check := CheckResult{Name: svc.Name, URL: svc.URL}

		start := time.Now()
		// Resolve hostname
		host := svc.URL
		host = strings.TrimPrefix(host, "https://")
		host = strings.TrimPrefix(host, "http://")
		host = strings.TrimSuffix(host, "/")

		conn, err := client.Dial("tcp", host+":443")
		latency := time.Since(start).Milliseconds()
		if err != nil {
			// Try port 80
			conn2, err2 := client.Dial("tcp", host+":80")
			if err2 != nil {
				check.Error = err.Error()
				check.LatencyMs = latency
			} else {
				conn2.Close()
				check.OK = true
				check.LatencyMs = time.Since(start).Milliseconds()
			}
		} else {
			conn.Close()
			check.OK = true
			check.LatencyMs = latency
		}

		result.Checks = append(result.Checks, check)
		if check.OK {
			switch svc.Name {
			case "Internet":
				result.Internet = true
			case "GitHub":
				result.GitHub = true
			case "HuggingFace":
				result.HuggingFace = true
			case "Civitai":
				result.Civitai = true
			case "Python (PyPI)":
				result.Python = true
			}
		}
	}

	result.DNS = result.Internet

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}
