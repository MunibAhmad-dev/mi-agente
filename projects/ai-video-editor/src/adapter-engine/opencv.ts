/**
 * AI Creative OS - OpenCV Adapter
 * Vision, tracking, analysis, frames, color, comparison, preprocessing.
 * License: Apache 2.0
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";

export class OpenCVAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "python3";

  private _caps: AdapterCapability[] = [
    { name: "object_detection", supported: true, quality: 85, speed: 90 },
    { name: "optical_flow", supported: true, quality: 82, speed: 88 },
    { name: "frame_analysis", supported: true, quality: 88, speed: 92 },
    { name: "color_analysis", supported: true, quality: 90, speed: 95 },
    { name: "image_comparison", supported: true, quality: 85, speed: 90 },
    { name: "feature_matching", supported: true, quality: 88, speed: 85 },
    { name: "edge_detection", supported: true, quality: 90, speed: 95 },
    { name: "face_detection", supported: true, quality: 80, speed: 88 },
    { name: "background_subtraction", supported: true, quality: 82, speed: 85 },
  ];

  async detect(): Promise<boolean> {
    // Try python3 first, then python
    for (const py of ["python3", "python"]) {
      const result = await this.executeCommand(
        `${py} -c "import cv2; print(cv2.__version__)"`,
      );
      if (result.success && result.data) {
        this._installed = true;
        this._version = result.data.trim();
        this.logger.info(`OpenCV detected: v${this._version}`);
        return true;
      }
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["scripting"]; }

  async analyzeFrame(filePath: FilePath): Promise<AdapterResult<FrameAnalysis>> {
    const script = `
import cv2, json, sys
img = cv2.imread("${filePath}")
if img is None:
    print(json.dumps({"error": "Could not load image"}))
    sys.exit(1)
h, w = img.shape[:2]
mean = img.mean(axis=(0,1)).tolist()
print(json.dumps({"width": w, "height": h, "channels": img.shape[2], "mean_bgr": mean}))
`;
    const result = await this.executeCommand(
      `python3 -c "${script.replace(/\n/g, " ")}" 2>/dev/null || python -c "${script.replace(/\n/g, " ")}"`,
    );
    if (!result.success || !result.data) return { success: false, error: result.error, duration: result.duration, provider: result.provider };
    try { return { ...result, data: JSON.parse(result.data) as unknown as FrameAnalysis }; }
    catch { return { success: false, error: "Parse error", duration: result.duration, provider: result.provider }; }
  }

  async detectSceneChanges(videoPath: FilePath): Promise<AdapterResult<number[]>> {
    const script = `
import cv2, json
cap = cv2.VideoCapture("${videoPath}")
fps = cap.get(cv2.CAP_PROP_FPS) or 30
scenes = []
prev = None
while True:
    ret, frame = cap.read()
    if not ret: break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    if prev is not None:
        diff = cv2.absdiff(prev, gray)
        if diff.mean() > 25:
            scenes.append(round(cap.get(cv2.CAP_PROP_POS_MSEC) / 1000, 2))
    prev = gray
cap.release()
print(json.dumps(scenes))
`;
    const result = await this.executeCommand(
      `python3 -c "${script.replace(/\n/g, " ")}" 2>/dev/null || python -c "${script.replace(/\n/g, " ")}"`,
    );
    if (!result.success || !result.data) return { success: false, error: result.error, duration: result.duration, provider: result.provider };
    try { return { ...result, data: JSON.parse(result.data) as unknown as number[] }; }
    catch { return { success: false, error: "Parse error", duration: result.duration, provider: result.provider }; }
  }
}

interface FrameAnalysis { width: number; height: number; channels: number; mean_bgr: number[]; }
