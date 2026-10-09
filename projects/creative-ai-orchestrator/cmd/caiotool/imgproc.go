package main

import (
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	_ "image/gif"
	_ "image/jpeg"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/image/draw"
)

type ImageInfo struct {
	File       string       `json:"file"`
	Width      int          `json:"width"`
	Height     int          `json:"height"`
	Format     string       `json:"format"`
	SizeBytes  int64        `json:"sizeBytes"`
	Channels   int          `json:"channels"`
	TimeMs     int64        `json:"timeMs"`
	Histogram  *Histogram   `json:"histogram,omitempty"`
	Sharpness  float64      `json:"sharpness,omitempty"`
	MeanBright float64      `json:"meanBrightness,omitempty"`
	StdDev     float64      `json:"stdDev,omitempty"`
}

type Histogram struct {
	Red   [256]int `json:"red"`
	Green [256]int `json:"green"`
	Blue  [256]int `json:"blue"`
	Luma  [256]int `json:"luma"`
}

type ResizeResult struct {
	File   string `json:"file"`
	Output string `json:"output"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	TimeMs int64  `json:"timeMs"`
}

func cmdImg() {
	if len(os.Args) < 3 {
		fmt.Println("Usage: caiotool img <command> [args...]")
		fmt.Println()
		fmt.Println("Commands:")
		fmt.Println("  analyze <image>              Analyze image (dimensions, histogram, sharpness, brightness)")
		fmt.Println("  resize <input> <output> <W> <H>  Resize image")
		fmt.Println("  sharpen <input> <output>     Sharpen image")
		fmt.Println("  denoise <input> <output>     Simple denoise (box blur)")
		fmt.Println("  histogram <input>            Get histogram data")
		fmt.Println("  compare <img1> <img2>        Compare two images (MSE, SSIM-like)")
		os.Exit(1)
	}

	switch os.Args[2] {
	case "analyze":
		cmdImgAnalyze()
	case "resize":
		cmdImgResize()
	case "sharpen":
		cmdImgSharpen()
	case "denoise":
		cmdImgDenoise()
	case "histogram":
		cmdImgHistogram()
	case "compare":
		cmdImgCompare()
	default:
		fmt.Fprintf(os.Stderr, "Unknown image command: %s\n", os.Args[2])
		os.Exit(1)
	}
}

func loadImg(path string) (image.Image, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()

	img, format, err := image.Decode(f)
	if err != nil {
		return nil, "", err
	}
	return img, format, nil
}

// analyze: full image analysis
func cmdImgAnalyze() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool img analyze <image>")
		os.Exit(1)
	}

	path := os.Args[3]
	start := time.Now()

	img, format, err := loadImg(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading image: %v\n", err)
		os.Exit(1)
	}

	finfo, _ := os.Stat(path)
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()

	hist := computeHistogram(img)
	sharpness := computeSharpness(img)
	meanB, stdDev := computeBrightness(img)

	result := ImageInfo{
		File:       path,
		Width:      w,
		Height:     h,
		Format:     format,
		SizeBytes:  finfo.Size(),
		Channels:   3,
		TimeMs:     time.Since(start).Milliseconds(),
		Histogram:  &hist,
		Sharpness:  sharpness,
		MeanBright: meanB,
		StdDev:     stdDev,
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

// resize
func cmdImgResize() {
	if len(os.Args) < 7 {
		fmt.Println("Usage: caiotool img resize <input> <output> <width> <height>")
		os.Exit(1)
	}

	inPath := os.Args[3]
	outPath := os.Args[4]
	var newW, newH int
	fmt.Sscanf(os.Args[5], "%d", &newW)
	fmt.Sscanf(os.Args[6], "%d", &newH)

	start := time.Now()

	img, _, err := loadImg(inPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.NearestNeighbor.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Over, nil)

	if err := saveImg(outPath, dst); err != nil {
		fmt.Fprintf(os.Stderr, "Error saving: %v\n", err)
		os.Exit(1)
	}

	result := ResizeResult{
		File:   inPath,
		Output: outPath,
		Width:  newW,
		Height: newH,
		TimeMs: time.Since(start).Milliseconds(),
	}
	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

// sharpen: unsharp mask
func cmdImgSharpen() {
	if len(os.Args) < 5 {
		fmt.Println("Usage: caiotool img sharpen <input> <output>")
		os.Exit(1)
	}

	inPath := os.Args[3]
	outPath := os.Args[4]
	start := time.Now()

	img, _, err := loadImg(inPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	rgba := image.NewRGBA(bounds)

	// Simple sharpening kernel: center pixel weighted more
	kernel := [3][3]float64{
		{0, -1, 0},
		{-1, 5, -1},
		{0, -1, 0},
	}

	for y := 1; y < h-1; y++ {
		for x := 1; x < w-1; x++ {
			var r, g, b float64
			for ky := -1; ky <= 1; ky++ {
				for kx := -1; kx <= 1; kx++ {
					c := img.At(x+kx, y+ky)
					cr, cg, cb, _ := c.RGBA()
					weight := kernel[ky+1][kx+1]
					r += float64(cr>>8) * weight
					g += float64(cg>>8) * weight
					b += float64(cb>>8) * weight
				}
			}
			rgba.SetRGBA(x, y, color.RGBA{
				R: clampUint8(r),
				G: clampUint8(g),
				B: clampUint8(b),
				A: 255,
			})
		}
	}

	// Copy edges
	for x := 0; x < w; x++ {
		c0 := img.At(x, 0)
		r0, g0, b0, a0 := c0.RGBA()
		rgba.SetRGBA(x, 0, color.RGBA{R: uint8(r0 >> 8), G: uint8(g0 >> 8), B: uint8(b0 >> 8), A: uint8(a0 >> 8)})
		ch := img.At(x, h-1)
		rh, gh, bh, ah := ch.RGBA()
		rgba.SetRGBA(x, h-1, color.RGBA{R: uint8(rh >> 8), G: uint8(gh >> 8), B: uint8(bh >> 8), A: uint8(ah >> 8)})
	}
	for y := 0; y < h; y++ {
		cl := img.At(0, y)
		rl, gl, bl, al := cl.RGBA()
		rgba.SetRGBA(0, y, color.RGBA{R: uint8(rl >> 8), G: uint8(gl >> 8), B: uint8(bl >> 8), A: uint8(al >> 8)})
		cr := img.At(w-1, y)
		rr, gr, br, ar := cr.RGBA()
		rgba.SetRGBA(w-1, y, color.RGBA{R: uint8(rr >> 8), G: uint8(gr >> 8), B: uint8(br >> 8), A: uint8(ar >> 8)})
	}

	if err := saveImg(outPath, rgba); err != nil {
		fmt.Fprintf(os.Stderr, "Error saving: %v\n", err)
		os.Exit(1)
	}

	result := map[string]interface{}{
		"input":  inPath,
		"output": outPath,
		"method": "unsharp_mask",
		"timeMs": time.Since(start).Milliseconds(),
	}
	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

// denoise: 3x3 box blur
func cmdImgDenoise() {
	if len(os.Args) < 5 {
		fmt.Println("Usage: caiotool img denoise <input> <output>")
		os.Exit(1)
	}

	inPath := os.Args[3]
	outPath := os.Args[4]
	start := time.Now()

	img, _, err := loadImg(inPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	rgba := image.NewRGBA(bounds)

	// 3x3 box blur (denoise)
	for y := 1; y < h-1; y++ {
		for x := 1; x < w-1; x++ {
			var r, g, b int
			count := 0
			for ky := -1; ky <= 1; ky++ {
				for kx := -1; kx <= 1; kx++ {
					c := img.At(x+kx, y+ky)
					cr, cg, cb, _ := c.RGBA()
					r += int(cr >> 8)
					g += int(cg >> 8)
					b += int(cb >> 8)
					count++
				}
			}
			rgba.SetRGBA(x, y, color.RGBA{
				R: uint8(r / count),
				G: uint8(g / count),
				B: uint8(b / count),
				A: 255,
			})
		}
	}

	if err := saveImg(outPath, rgba); err != nil {
		fmt.Fprintf(os.Stderr, "Error saving: %v\n", err)
		os.Exit(1)
	}

	result := map[string]interface{}{
		"input":  inPath,
		"output": outPath,
		"method": "box_blur_3x3",
		"timeMs": time.Since(start).Milliseconds(),
	}
	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

// histogram only
func cmdImgHistogram() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: caiotool img histogram <image>")
		os.Exit(1)
	}

	img, _, err := loadImg(os.Args[3])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	hist := computeHistogram(img)
	output, _ := json.MarshalIndent(hist, "", "  ")
	fmt.Println(string(output))
}

// compare: MSE + simple SSIM approximation
func cmdImgCompare() {
	if len(os.Args) < 5 {
		fmt.Println("Usage: caiotool img compare <img1> <img2>")
		os.Exit(1)
	}

	img1, _, err := loadImg(os.Args[3])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading img1: %v\n", err)
		os.Exit(1)
	}
	img2, _, err := loadImg(os.Args[4])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading img2: %v\n", err)
		os.Exit(1)
	}

	b1 := img1.Bounds()
	b2 := img2.Bounds()
	w := min(b1.Dx(), b2.Dx())
	h := min(b1.Dy(), b2.Dy())

	var mse float64
	var diffSum float64
	var sumSqDiff float64
	var sumA, sumB float64
	var sumSqA, sumSqB float64
	n := float64(w * h)

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r1, g1, b1c, _ := img1.At(b1.Min.X+x, b1.Min.Y+y).RGBA()
			r2, g2, b2c, _ := img2.At(b2.Min.X+x, b2.Min.Y+y).RGBA()
			l1 := 0.299*float64(r1>>8) + 0.587*float64(g1>>8) + 0.114*float64(b1c>>8)
			l2 := 0.299*float64(r2>>8) + 0.587*float64(g2>>8) + 0.114*float64(b2c>>8)
			diff := l1 - l2
			mse += diff * diff
			diffSum += diff
			sumA += l1
			sumB += l2
			sumSqA += l1 * l1
			sumSqB += l2 * l2
			sumSqDiff += diff * diff
		}
	}

	mse /= n
	meanDiff := diffSum / n
	meanA := sumA / n
	meanB := sumB / n
	varA := sumSqA/n - meanA*meanA
	varB := sumSqB/n - meanB*meanB
	varDiff := sumSqDiff/n - meanDiff*meanDiff

	// Simple SSIM approximation
	ssimNum := (2*meanA*meanB + 0.01*255*0.01*255) * (2*math.Sqrt(math.Max(varA,0)*math.Max(varB,0)) + 0.01*255*0.01*255)
	ssimDen := (meanA*meanA + meanB*meanB + 0.01*255*0.01*255) * (varA + varB + 0.01*255*0.01*255)
	// Avoid division by zero
	var ssim float64
	if ssimDen > 0 {
		ssim = ssimNum / ssimDen
	} else {
		ssim = 1.0
	}
	_ = varDiff

	result := map[string]interface{}{
		"image1":     os.Args[3],
		"image2":     os.Args[4],
		"dimensions": fmt.Sprintf("%dx%d (compared %dx%d)", b1.Dx(), b1.Dy(), w, h),
		"mse":        math.Round(mse*1000) / 1000,
		"ssim":       math.Round(ssim*1000) / 1000,
		"psnr":       math.Round(10*math.Log10(255*255/math.Max(mse, 0.0001))*1000) / 1000,
	}
	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}

// === Helpers ===

func computeHistogram(img image.Image) Histogram {
	var hist Histogram
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			ri := int(r >> 8)
			gi := int(g >> 8)
			bi := int(b >> 8)
			if ri > 255 { ri = 255 }
			if gi > 255 { gi = 255 }
			if bi > 255 { bi = 255 }
			hist.Red[ri]++
			hist.Green[gi]++
			hist.Blue[bi]++
			luma := int(0.299*float64(ri) + 0.587*float64(gi) + 0.114*float64(bi))
			if luma > 255 { luma = 255 }
			hist.Luma[luma]++
		}
	}
	return hist
}

func computeSharpness(img image.Image) float64 {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w < 3 || h < 3 {
		return 0
	}

	var sum float64
	count := 0
	for y := 1; y < h-1; y++ {
		for x := 1; x < w-1; x++ {
			center := luma(img.At(x, y))
			top := luma(img.At(x, y-1))
			bottom := luma(img.At(x, y+1))
			left := luma(img.At(x-1, y))
			right := luma(img.At(x+1, y))
			// Laplacian
			laplacian := -4*center + top + bottom + left + right
			sum += laplacian * laplacian
			count++
		}
	}
	if count == 0 {
		return 0
	}
	return math.Round(math.Sqrt(sum/float64(count))*1000) / 1000
}

func computeBrightness(img image.Image) (float64, float64) {
	bounds := img.Bounds()
	n := float64(bounds.Dx() * bounds.Dy())
	var sum float64
	var sumSq float64

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			l := luma(img.At(x, y))
			sum += l
			sumSq += l * l
		}
	}

	mean := sum / n
	stdDev := math.Sqrt(sumSq/n - mean*mean)
	return math.Round(mean*1000) / 1000, math.Round(stdDev*1000) / 1000
}

func luma(c color.Color) float64 {
	r, g, b, _ := c.RGBA()
	return 0.299*float64(r>>8) + 0.587*float64(g>>8) + 0.114*float64(b>>8)
}

func clampUint8(v float64) uint8 {
	if v < 0 { return 0 }
	if v > 255 { return 255 }
	return uint8(v)
}

func saveImg(path string, img image.Image) error {
	ext := strings.ToLower(filepath.Ext(path))
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	switch ext {
	case ".jpg", ".jpeg":
		return fmt.Errorf("jpeg encoding not supported in Go stdlib, use .png output")
	default:
		return png.Encode(f, img)
	}
}
