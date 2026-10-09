/**
 * AI Creative OS - Built-in Provider Registration
 * 
 * Registers real, detectable providers with their capabilities,
 * hardware requirements, license info, and automation methods.
 */

import type { Provider } from "../types/index.js";

export function createBuiltinProviders(): Provider[] {
  return [
    // ─── FFmpeg ─────────────────────────────────────────────────────
    {
      id: "provider.ffmpeg",
      name: "FFmpeg",
      version: "6.x",
      source: ["cli"],
      license: {
        softwareLicense: "LGPL-2.1",
        softwareLicenseScope: "weak_copyleft",
        commercialUse: true,
        redistribution: true,
        modification: true,
        restrictions: ["GPL components may be present depending on build configuration"],
      },
      capabilities: [
        "cap.timeline_editing", "cap.speed_ramping", "cap.transitions",
        "cap.audio_editing", "cap.audio_mixing", "cap.render",
        "cap.color_correction", "cap.subtitles", "cap.thumbnail",
        "cap.scene_detection", "cap.optical_flow",
      ],
      installation: { installed: false, autoInstallable: true, testCommand: "ffmpeg -version" },
      hardware: { minRAM: 512 * 1024 * 1024 },
      quality: 90, speed: 98, automationScore: 100, stability: 95, maintenanceScore: 95,
      fallbacks: [],
      dependencies: [],
      status: "missing",
      health: "missing",
    },

    // ─── OpenCV ─────────────────────────────────────────────────────
    {
      id: "provider.opencv",
      name: "OpenCV",
      version: "4.x",
      source: ["scripting"],
      license: {
        softwareLicense: "Apache-2.0",
        softwareLicenseScope: "permissive",
        commercialUse: true, redistribution: true, modification: true,
      },
      capabilities: [
        "cap.scene_detection", "cap.optical_flow", "cap.img_segmentation",
      ],
      installation: { installed: false, autoInstallable: true, testCommand: "python3 -c \"import cv2; print(cv2.__version__)\"" },
      hardware: { minRAM: 256 * 1024 * 1024 },
      quality: 85, speed: 90, automationScore: 85, stability: 90, maintenanceScore: 90,
      fallbacks: [], dependencies: [], status: "missing", health: "missing",
    },

    // ─── Whisper ────────────────────────────────────────────────────
    {
      id: "provider.whisper",
      name: "Whisper",
      version: "1.x",
      source: ["scripting"],
      license: {
        softwareLicense: "MIT",
        softwareLicenseScope: "permissive",
        commercialUse: true, redistribution: true, modification: true,
      },
      capabilities: ["cap.stt", "cap.subtitles"],
      installation: { installed: false, autoInstallable: true, testCommand: "python3 -c \"import whisper; print(whisper.__version__)\"" },
      hardware: { gpu: true, minVRAM: 2 * 1024 * 1024 * 1024, minRAM: 2 * 1024 * 1024 * 1024 },
      quality: 92, speed: 85, automationScore: 85, stability: 88, maintenanceScore: 85,
      fallbacks: [], dependencies: [], status: "missing", health: "missing",
    },

    // ─── PySceneDetect ──────────────────────────────────────────────
    {
      id: "provider.pyscenedetect",
      name: "PySceneDetect",
      version: "0.6.x",
      source: ["cli", "scripting"],
      license: {
        softwareLicense: "BSD-3-Clause",
        softwareLicenseScope: "permissive",
        commercialUse: true, redistribution: true, modification: true,
      },
      capabilities: ["cap.scene_detection"],
      installation: { installed: false, autoInstallable: true, testCommand: "scenedetect --version" },
      hardware: { minRAM: 256 * 1024 * 1024 },
      quality: 90, speed: 88, automationScore: 88, stability: 90, maintenanceScore: 85,
      fallbacks: ["provider.opencv", "provider.ffmpeg"],
      dependencies: [], status: "missing", health: "missing",
    },

    // ─── Blender ────────────────────────────────────────────────────
    {
      id: "provider.blender",
      name: "Blender",
      version: "4.x",
      source: ["scripting", "cli"],
      license: {
        softwareLicense: "GPL-2.0",
        softwareLicenseScope: "copyleft",
        commercialUse: true, redistribution: true, modification: true,
        restrictions: ["Derivative works must be GPL-licensed"],
      },
      capabilities: [
        "cap.compositing", "cap.tracking", "cap.particles",
        "cap.titles", "cap.motion_paths", "cap.render",
      ],
      installation: { installed: false, autoInstallable: true, testCommand: "blender --version" },
      hardware: { minRAM: 4 * 1024 * 1024 * 1024, gpu: true },
      quality: 92, speed: 75, automationScore: 80, stability: 88, maintenanceScore: 90,
      fallbacks: ["provider.ffmpeg", "provider.natron"],
      dependencies: [], status: "missing", health: "missing",
    },

    // ─── ComfyUI ────────────────────────────────────────────────────
    {
      id: "provider.comfyui",
      name: "ComfyUI",
      version: "latest",
      source: ["scripting", "ipc"],
      license: {
        softwareLicense: "GPL-3.0",
        softwareLicenseScope: "copyleft",
        commercialUse: true, redistribution: true, modification: true,
        restrictions: ["GPL-3.0 obligations apply"],
      },
      capabilities: [
        "cap.img_gen", "cap.t2v", "cap.i2v", "cap.v2v",
        "cap.img_upscale", "cap.video_interp",
      ],
      installation: { installed: false, autoInstallable: false, testCommand: "curl -s http://127.0.0.1:8188/system_stats" },
      hardware: { gpu: true, minVRAM: 4 * 1024 * 1024 * 1024, minRAM: 8 * 1024 * 1024 * 1024 },
      quality: 88, speed: 80, automationScore: 85, stability: 80, maintenanceScore: 85,
      fallbacks: [], dependencies: [], status: "missing", health: "missing",
    },

    // ─── Wan ────────────────────────────────────────────────────────
    {
      id: "provider.wan",
      name: "Wan 2.2",
      version: "2.2",
      source: ["scripting"],
      license: {
        softwareLicense: "Apache-2.0",
        softwareLicenseScope: "permissive",
        commercialUse: true, redistribution: true, modification: true,
      },
      capabilities: ["cap.t2v", "cap.i2v", "cap.v2v", "cap.video_interp"],
      installation: { installed: false, autoInstallable: false },
      hardware: { gpu: true, minVRAM: 8 * 1024 * 1024 * 1024, minRAM: 16 * 1024 * 1024 * 1024 },
      quality: 88, speed: 60, automationScore: 70, stability: 75, maintenanceScore: 80,
      fallbacks: ["provider.comfyui"],
      dependencies: [],
      status: "missing",
      health: "missing",
    },

    // ─── DaVinci Resolve ────────────────────────────────────────────
    {
      id: "provider.davinci",
      name: "DaVinci Resolve",
      version: "19.x",
      source: ["scripting", "project_file"],
      license: {
        softwareLicense: "proprietary",
        softwareLicenseScope: "proprietary",
        commercialUse: true, redistribution: false, modification: false,
        restrictions: ["Free version available; Studio requires license"],
      },
      capabilities: [
        "cap.timeline_editing", "cap.color_correction", "cap.color_grading",
        "cap.color_scopes", "cap.audio_editing", "cap.audio_mixing",
        "cap.compositing", "cap.transitions", "cap.multicam",
        "cap.noise_reduction", "cap.render",
      ],
      installation: { installed: false, autoInstallable: false },
      hardware: { gpu: true, minVRAM: 4 * 1024 * 1024 * 1024, minRAM: 16 * 1024 * 1024 * 1024 },
      quality: 98, speed: 90, automationScore: 85, stability: 92, maintenanceScore: 95,
      fallbacks: ["provider.kdenlive", "provider.ffmpeg"],
      dependencies: [],
      status: "missing",
      health: "missing",
    },

    // ─── Kdenlive ───────────────────────────────────────────────────
    {
      id: "provider.kdenlive",
      name: "Kdenlive",
      version: "24.x",
      source: ["cli", "project_file"],
      license: {
        softwareLicense: "GPL-2.0",
        softwareLicenseScope: "copyleft",
        commercialUse: true, redistribution: true, modification: true,
      },
      capabilities: [
        "cap.timeline_editing", "cap.transitions", "cap.audio_editing",
        "cap.subtitles", "cap.render",
      ],
      installation: { installed: false, autoInstallable: true, testCommand: "kdenlive --version" },
      hardware: { minRAM: 2 * 1024 * 1024 * 1024 },
      quality: 80, speed: 88, automationScore: 75, stability: 85, maintenanceScore: 80,
      fallbacks: ["provider.ffmpeg"],
      dependencies: [],
      status: "missing",
      health: "missing",
    },

    // ─── Natron ─────────────────────────────────────────────────────
    {
      id: "provider.natron",
      name: "Natron",
      version: "2.x",
      source: ["scripting", "cli", "project_file"],
      license: {
        softwareLicense: "GPL-2.0",
        softwareLicenseScope: "copyleft",
        commercialUse: true, redistribution: true, modification: true,
      },
      capabilities: ["cap.compositing", "cap.tracking", "cap.keying"],
      installation: { installed: false, autoInstallable: true, testCommand: "natron --version" },
      hardware: { minRAM: 2 * 1024 * 1024 * 1024 },
      quality: 78, speed: 75, automationScore: 70, stability: 80, maintenanceScore: 65,
      fallbacks: ["provider.blender", "provider.ffmpeg"],
      dependencies: [],
      status: "missing",
      health: "missing",
    },

    // ─── OpenTimelineIO ─────────────────────────────────────────────
    {
      id: "provider.opentimelineio",
      name: "OpenTimelineIO",
      version: "0.16.x",
      source: ["scripting", "cli"],
      license: {
        softwareLicense: "Apache-2.0",
        softwareLicenseScope: "permissive",
        commercialUse: true, redistribution: true, modification: true,
      },
      capabilities: [], // Utility, not a production capability
      installation: { installed: false, autoInstallable: true, testCommand: "python3 -c \"import opentimelineio\"" },
      hardware: {},
      quality: 85, speed: 90, automationScore: 90, stability: 88, maintenanceScore: 85,
      fallbacks: [],
      dependencies: [],
      status: "missing",
      health: "missing",
    },
  ];
}
