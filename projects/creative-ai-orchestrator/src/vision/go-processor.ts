// ============================================================================
// Go Image Processor Integration
// ============================================================================
// Calls caiotool img commands for fast image analysis, resize, sharpen, etc.
// Falls back to sharp when Go binary is unavailable.
// ============================================================================

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

function getGoBinary(): string {
  const base = path.join(process.cwd(), "dist");
  const ext = process.platform === "win32" ? ".exe" : "";
  const binPath = path.join(base, `caiotool${ext}`);
  if (existsSync(binPath)) return binPath;
  // Try project root
  const rootPath = path.join(process.cwd(), "..", "dist", `caiotool${ext}`);
  if (existsSync(rootPath)) return rootPath;
  return "";
}

export interface GoImageInfo {
  file: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
  channels: number;
  timeMs: number;
  histogram?: {
    red: number[];
    green: number[];
    blue: number[];
    luma: number[];
  };
  sharpness: number;
  meanBrightness: number;
  stdDev: number;
}

export interface GoCompareResult {
  image1: string;
  image2: string;
  mse: number;
  ssim: number;
  psnr: number;
  dimensions: string;
}

export interface GoResizeResult {
  file: string;
  output: string;
  width: number;
  height: number;
  timeMs: number;
}

export interface GoImageOpResult {
  input: string;
  output: string;
  method: string;
  timeMs: number;
}

/**
 * Analyze image using Go binary (fast, no native deps needed)
 */
export async function analyzeImageGo(imagePath: string): Promise<GoImageInfo> {
  const bin = getGoBinary();
  if (!bin) throw new Error("Go binary not found — run: cd cmd/caiotool && go build");

  const { stdout } = await execFileAsync(bin, ["img", "analyze", imagePath], {
    timeout: 30_000,
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

/**
 * Resize image using Go binary
 */
export async function resizeImageGo(
  input: string,
  output: string,
  width: number,
  height: number,
): Promise<GoResizeResult> {
  const bin = getGoBinary();
  if (!bin) throw new Error("Go binary not found");

  const { stdout } = await execFileAsync(
    bin,
    ["img", "resize", input, output, String(width), String(height)],
    { timeout: 60_000 },
  );
  return JSON.parse(stdout);
}

/**
 * Sharpen image using Go binary
 */
export async function sharpenImageGo(
  input: string,
  output: string,
): Promise<GoImageOpResult> {
  const bin = getGoBinary();
  if (!bin) throw new Error("Go binary not found");

  const { stdout } = await execFileAsync(bin, ["img", "sharpen", input, output], {
    timeout: 60_000,
  });
  return JSON.parse(stdout);
}

/**
 * Denoise image using Go binary
 */
export async function denoiseImageGo(
  input: string,
  output: string,
): Promise<GoImageOpResult> {
  const bin = getGoBinary();
  if (!bin) throw new Error("Go binary not found");

  const { stdout } = await execFileAsync(bin, ["img", "denoise", input, output], {
    timeout: 60_000,
  });
  return JSON.parse(stdout);
}

/**
 * Compare two images using Go binary (MSE + SSIM)
 */
export async function compareImagesGo(
  img1: string,
  img2: string,
): Promise<GoCompareResult> {
  const bin = getGoBinary();
  if (!bin) throw new Error("Go binary not found");

  const { stdout } = await execFileAsync(bin, ["img", "compare", img1, img2], {
    timeout: 30_000,
  });
  return JSON.parse(stdout);
}

/**
 * Check if Go binary is available
 */
export function isGoBinaryAvailable(): boolean {
  return getGoBinary() !== "";
}
