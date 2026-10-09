//go:build !windows

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
)

type WatchEvent struct {
	Type string    `json:"type"`
	Path string    `json:"path"`
	Time time.Time `json:"time"`
}

func cmdWatch() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool watch <directory> [--ext .png,.jpg,.json]")
		fmt.Println("Watches directory recursively, emits JSON events on stdout")
		os.Exit(1)
	}

	dir := os.Args[2]
	extensions := []string{}
	for i, arg := range os.Args[3:] {
		_ = i
		if arg == "--ext" && i+1 < len(os.Args)-3 {
			exts := os.Args[i+4]
			for _, e := range strings.Split(exts, ",") {
				extensions = append(extensions, strings.TrimSpace(e))
			}
		}
	}

	if _, err := os.Stat(dir); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "Directory does not exist: %s\n", dir)
		os.Exit(1)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating watcher: %v\n", err)
		os.Exit(1)
	}
	defer watcher.Close()

	// Walk directory and add all subdirectories
	err = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			// Skip hidden directories and node_modules
			if strings.HasPrefix(info.Name(), ".") || info.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return watcher.Add(path)
		}
		return nil
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error walking directory: %v\n", err)
		os.Exit(1)
	}

	// Emit started event
	startEvent, _ := json.Marshal(WatchEvent{
		Type: "watch:started",
		Path: dir,
		Time: time.Now(),
	})
	fmt.Println(string(startEvent))
	os.Stdout.Sync()

	// Event loop
	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			// Filter by extension if specified
			if len(extensions) > 0 {
				matched := false
				for _, ext := range extensions {
					if strings.HasSuffix(strings.ToLower(event.Name), strings.ToLower(ext)) {
						matched = true
						break
					}
				}
				if !matched {
					continue
				}
			}

			we := WatchEvent{
				Type: eventTypeToString(event.Op),
				Path: event.Name,
				Time: time.Now(),
			}
			out, _ := json.Marshal(we)
			fmt.Println(string(out))
			os.Stdout.Sync()

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			errEvent, _ := json.Marshal(WatchEvent{
				Type: "watch:error",
				Path: err.Error(),
				Time: time.Now(),
			})
			fmt.Println(string(errEvent))
			os.Stdout.Sync()
		}
	}
}

func eventTypeToString(op fsnotify.Op) string {
	switch {
	case op&fsnotify.Create == fsnotify.Create:
		return "file:created"
	case op&fsnotify.Write == fsnotify.Write:
		return "file:modified"
	case op&fsnotify.Remove == fsnotify.Remove:
		return "file:deleted"
	case op&fsnotify.Rename == fsnotify.Rename:
		return "file:renamed"
	case op&fsnotify.Chmod == fsnotify.Chmod:
		return "file:chmod"
	default:
		return "file:unknown"
	}
}
