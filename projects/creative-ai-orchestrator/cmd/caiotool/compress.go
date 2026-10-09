// ============================================================================
// File Compression
// ============================================================================
// Provides: gzip, gunzip, tar, untar
// ============================================================================

package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type CompressResult struct {
	Input       string `json:"input"`
	Output      string `json:"output"`
	InputSize   int64  `json:"inputSizeBytes"`
	OutputSize  int64  `json:"outputSizeBytes"`
	Ratio       string `json:"ratio"`
	DurationMs  int64  `json:"durationMs"`
}

func cmdCompress() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool compress <gzip|gunzip|tar|untar> [args...]")
		fmt.Println()
		fmt.Println("Commands:")
		fmt.Println("  compress gzip <file>           Compress file to .gz")
		fmt.Println("  compress gunzip <file.gz>      Decompress .gz file")
		fmt.Println("  compress tar <dir> <out.tar>   Create tar archive")
		fmt.Println("  compress untar <tar> <dir>     Extract tar archive")
		os.Exit(1)
	}

	switch os.Args[2] {
	case "gzip":
		cmdGzip()
	case "gunzip":
		cmdGunzip()
	case "tar":
		cmdTar()
	case "untar":
		cmdUntar()
	default:
		fmt.Fprintf(os.Stderr, "Unknown compress subcommand: %s\n", os.Args[2])
		os.Exit(1)
	}
}

func cmdGzip() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool compress gzip <input>")
		os.Exit(1)
	}
	inPath := os.Args[3]
	outPath := inPath + ".gz"

	start := time.Now()

	inFile, err := os.Open(inPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer inFile.Close()

	inInfo, _ := inFile.Stat()

	outFile, err := os.Create(outPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer outFile.Close()

	gz := gzip.NewWriter(outFile)
	n, _ := io.Copy(gz, inFile)
	gz.Close()

	outInfo, _ := os.Stat(outPath)

	result := CompressResult{
		Input:      inPath,
		Output:     outPath,
		InputSize:  inInfo.Size(),
		OutputSize: outInfo.Size(),
		Ratio:      fmt.Sprintf("%.1f%%", float64(outInfo.Size())/float64(inInfo.Size())*100),
		DurationMs: time.Since(start).Milliseconds(),
	}
	_ = n

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

func cmdGunzip() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool compress gunzip <input.gz>")
		os.Exit(1)
	}
	inPath := os.Args[3]
	outPath := strings.TrimSuffix(inPath, ".gz")
	if outPath == inPath {
		outPath = inPath + ".decompressed"
	}

	start := time.Now()

	inFile, err := os.Open(inPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer inFile.Close()

	inInfo, _ := inFile.Stat()
	gz, err := gzip.NewReader(inFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer gz.Close()

	outFile, err := os.Create(outPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer outFile.Close()

	io.Copy(outFile, gz)

	outInfo, _ := os.Stat(outPath)
	result := CompressResult{
		Input:      inPath,
		Output:     outPath,
		InputSize:  inInfo.Size(),
		OutputSize: outInfo.Size(),
		Ratio:      fmt.Sprintf("%.1f%%", float64(outInfo.Size())/float64(inInfo.Size())*100),
		DurationMs: time.Since(start).Milliseconds(),
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

func cmdTar() {
	if len(os.Args) < 5 {
		fmt.Println("Usage: caiotool compress tar <directory> <output.tar>")
		os.Exit(1)
	}
	dir := os.Args[3]
	outPath := os.Args[4]

	start := time.Now()

	outFile, err := os.Create(outPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer outFile.Close()

	tw := tar.NewWriter(outFile)
	defer tw.Close()

	fileCount := 0
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(dir, path)
		header, _ := tar.FileInfoHeader(info, "")
		header.Name = rel
		tw.WriteHeader(header)
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		io.Copy(tw, f)
		f.Close()
		fileCount++
		return nil
	})
	tw.Close()

	outInfo, _ := os.Stat(outPath)

	result := map[string]interface{}{
		"input":      dir,
		"output":     outPath,
		"files":      fileCount,
		"outputSize": outInfo.Size(),
		"durationMs": time.Since(start).Milliseconds(),
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

func cmdUntar() {
	if len(os.Args) < 5 {
		fmt.Println("Usage: caiotool compress untar <archive.tar> <output-directory>")
		os.Exit(1)
	}
	tarPath := os.Args[3]
	outDir := os.Args[4]

	start := time.Now()

	f, err := os.Open(tarPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer f.Close()

	tr := tar.NewReader(f)
	fileCount := 0
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}

		target := filepath.Join(outDir, header.Name)
		if header.FileInfo().IsDir() {
			os.MkdirAll(target, 0755)
			continue
		}
		os.MkdirAll(filepath.Dir(target), 0755)
		outFile, _ := os.Create(target)
		io.Copy(outFile, tr)
		outFile.Close()
		fileCount++
	}

	result := map[string]interface{}{
		"archive":   tarPath,
		"outputDir": outDir,
		"files":     fileCount,
		"durationMs": time.Since(start).Milliseconds(),
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}
