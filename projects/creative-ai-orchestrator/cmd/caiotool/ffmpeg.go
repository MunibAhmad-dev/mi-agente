// ============================================================================
// FFmpeg Wrapper
// ============================================================================
// Provides: probe, thumbnail, transcode, extract-audio, concat
// Requires ffmpeg installed on the system.
// ============================================================================

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type FFprobeInfo struct {
	File       string          `json:"file"`
	Duration   float64         `json:"durationSeconds"`
	Size       int64           `json:"sizeBytes"`
	Format     string          `json:"format"`
	Bitrate    int64           `json:"bitrate"`
	Streams    []StreamInfo    `json:"streams"`
	CreatedAt  string          `json:"createdAt"`
}

type StreamInfo struct {
	Index      int    `json:"index"`
	Type       string `json:"type"` // video, audio, subtitle
	Codec      string `json:"codec"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	FPS        float64 `json:"fps,omitempty"`
	SampleRate string `json:"sampleRate,omitempty"`
	Channels   int    `json:"channels,omitempty"`
	Bitrate    int64  `json:"bitrate,omitempty"`
}

type FFmpegResult struct {
	Command  string `json:"command"`
	Output   string `json:"output"`
	Duration int64  `json:"durationMs"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
}

func cmdFFmpeg() {
	if len(os.Args) < 3 {
		fmt.Println("Usage: caiotool ffmpeg <probe|thumbnail|transcode|concat> [args...]")
		fmt.Println()
		fmt.Println("Commands:")
		fmt.Println("  ffmpeg probe <file>              Probe media file info")
		fmt.Println("  ffmpeg thumbnail <file> <out>    Extract thumbnail at 1s")
		fmt.Println("  ffmpeg transcode <file> <out>    Transcode to H.264/AAC")
		fmt.Println("  ffmpeg concat <list> <out>       Concat files from text list")
		fmt.Println("  ffmpeg extract-audio <file> <out>  Extract audio track")
		os.Exit(1)
	}

	// Check ffmpeg is available
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		fmt.Fprintf(os.Stderr, "Error: ffmpeg not found in PATH\n")
		os.Exit(1)
	}

	switch os.Args[2] {
	case "probe":
		cmdFFprobe()
	case "thumbnail":
		cmdFFThumbnail()
	case "transcode":
		cmdFFTranscode()
	case "concat":
		cmdFFConcat()
	case "extract-audio":
		cmdFFExtractAudio()
	default:
		fmt.Fprintf(os.Stderr, "Unknown ffmpeg subcommand: %s\n", os.Args[2])
		os.Exit(1)
	}
}

func cmdFFprobe() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool ffmpeg probe <file>")
		os.Exit(1)
	}
	filePath := os.Args[3]

	// Get file info
	fi, err := os.Stat(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Run ffprobe
	out, err := exec.Command("ffprobe", "-v", "quiet",
		"-print_format", "json",
		"-show_format", "-show_streams",
		filePath).CombinedOutput()
	if err != nil {
		fmt.Fprintf(os.Stderr, "ffprobe error: %v\n%s\n", err, string(out))
		os.Exit(1)
	}

	var probe struct {
		Format struct {
			Filename string `json:"filename"`
			Duration string `json:"duration"`
			Size     string `json:"size"`
			Format   string `json:"format_name"`
			Bitrate  string `json:"bit_rate"`
		} `json:"format"`
		Streams []struct {
			Index     int    `json:"index"`
			CodecType string `json:"codec_type"`
			CodecName string `json:"codec_name"`
			Width     int    `json:"width"`
			Height    int    `json:"height"`
			RFrameRate string `json:"r_frame_rate"`
			SampleRate string `json:"sample_rate"`
			Channels  int    `json:"channels"`
			BitRate   string `json:"bit_rate"`
		} `json:"streams"`
	}

	if err := json.Unmarshal(out, &probe); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to parse ffprobe output: %v\n", err)
		os.Exit(1)
	}

	dur, _ := strconv.ParseFloat(probe.Format.Duration, 64)
	size, _ := strconv.ParseInt(probe.Format.Size, 10, 64)
	bitrate, _ := strconv.ParseInt(probe.Format.Bitrate, 10, 64)

	info := FFprobeInfo{
		File:      filePath,
		Duration:  dur,
		Size:      size,
		Format:    probe.Format.Format,
		Bitrate:   bitrate,
		CreatedAt: fi.ModTime().Format(time.RFC3339),
	}

	for _, s := range probe.Streams {
		stream := StreamInfo{
			Index: s.Index,
			Type:  s.CodecType,
			Codec: s.CodecName,
		}
		if s.CodecType == "video" {
			stream.Width = s.Width
			stream.Height = s.Height
			// Parse FPS from "30/1" or "24000/1001"
			parts := strings.Split(s.RFrameRate, "/")
			if len(parts) == 2 {
				num, _ := strconv.ParseFloat(parts[0], 64)
				den, _ := strconv.ParseFloat(parts[1], 64)
				if den > 0 {
					stream.FPS = num / den
				}
			}
		}
		if s.CodecType == "audio" {
			stream.SampleRate = s.SampleRate
			stream.Channels = s.Channels
		}
		if br, err := strconv.ParseInt(s.BitRate, 10, 64); err == nil {
			stream.Bitrate = br
		}
		info.Streams = append(info.Streams, stream)
	}

	output, _ := json.MarshalIndent(info, "", "  ")
	fmt.Println(string(output))
}

func cmdFFThumbnail() {
	if len(os.Args) < 5 {
		fmt.Println("Usage: caiotool ffmpeg thumbnail <file> <output.png>")
		os.Exit(1)
	}
	file, out := os.Args[3], os.Args[4]
	start := time.Now()

	cmd := exec.Command("ffmpeg", "-y", "-i", file,
		"-ss", "00:00:01", "-vframes", "1",
		"-vf", "scale=320:-1",
		out)

	_, err := cmd.CombinedOutput()
	result := FFmpegResult{
		Command:  fmt.Sprintf("ffmpeg -y -i %s -ss 1 -vframes 1 -vf scale=320:-1 %s", file, out),
		Duration: time.Since(start).Milliseconds(),
		Success:  err == nil,
	}
	if err != nil {
		result.Error = err.Error()
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

func cmdFFTranscode() {
	if len(os.Args) < 5 {
		fmt.Println("Usage: caiotool ffmpeg transcode <input> <output>")
		os.Exit(1)
	}
	file, out := os.Args[3], os.Args[4]
	start := time.Now()

	cmd := exec.Command("ffmpeg", "-y", "-i", file,
		"-c:v", "libx264", "-preset", "medium", "-crf", "23",
		"-c:a", "aac", "-b:a", "128k",
		"-movflags", "+faststart",
		out)

	_, err := cmd.CombinedOutput()
	result := FFmpegResult{
		Command:  fmt.Sprintf("ffmpeg -y -i %s -c:v libx264 -c:a aac %s", file, out),
		Output:   filepath.Base(out),
		Duration: time.Since(start).Milliseconds(),
		Success:  err == nil,
	}
	if err != nil {
		result.Error = err.Error()
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

func cmdFFConcat() {
	if len(os.Args) < 5 {
		fmt.Println("Usage: caiotool ffmpeg concat <filelist.txt> <output>")
		fmt.Println("filelist.txt: one 'file <path>' line per file")
		os.Exit(1)
	}
	listFile, out := os.Args[3], os.Args[4]
	start := time.Now()

	cmd := exec.Command("ffmpeg", "-y", "-f", "concat", "-safe", "0",
		"-i", listFile, "-c", "copy", out)

	_, err := cmd.CombinedOutput()
	result := FFmpegResult{
		Command:  fmt.Sprintf("ffmpeg -y -f concat -safe 0 -i %s -c copy %s", listFile, out),
		Output:   filepath.Base(out),
		Duration: time.Since(start).Milliseconds(),
		Success:  err == nil,
	}
	if err != nil {
		result.Error = err.Error()
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

func cmdFFExtractAudio() {
	if len(os.Args) < 5 {
		fmt.Println("Usage: caiotool ffmpeg extract-audio <input> <output.mp3>")
		os.Exit(1)
	}
	file, out := os.Args[3], os.Args[4]
	start := time.Now()

	cmd := exec.Command("ffmpeg", "-y", "-i", file,
		"-vn", "-acodec", "libmp3lame", "-q:a", "2",
		out)

	_, err := cmd.CombinedOutput()
	result := FFmpegResult{
		Command:  fmt.Sprintf("ffmpeg -y -i %s -vn -acodec libmp3lame %s", file, out),
		Output:   filepath.Base(out),
		Duration: time.Since(start).Milliseconds(),
		Success:  err == nil,
	}
	if err != nil {
		result.Error = err.Error()
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}
