// ============================================================================
// Error Classification & Recovery
// ============================================================================
// Every error in the system gets classified. No "Unknown error" ever.
// ============================================================================

import { CaioError, createError, ErrorCode } from "../types/index.js";

/**
 * Map a raw error (from any source) into a classified CaioError.
 * This is the central error intake — nothing should bubble up unclassified.
 */
export function classifyError(raw: unknown, context?: string): CaioError {
  if (raw && typeof raw === "object" && "code" in raw && "message" in raw) {
    return raw as CaioError;
  }

  const msg = raw instanceof Error ? raw.message : String(raw);
  const lower = msg.toLowerCase();

  // Classify by pattern matching
  if (lower.includes("cuda out of memory") || lower.includes("out of memory")) {
    return createError(ErrorCode.VramError, msg, {
      userMessage:
        "Not enough GPU memory for this operation. Consider reducing resolution, enabling offloading, or using a smaller model.",
      suggestion: "Reduce resolution or use a model with lower VRAM requirements.",
      recoverable: true,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("cuda") && (lower.includes("error") || lower.includes("not found"))) {
    return createError(ErrorCode.CudaError, msg, {
      userMessage: "CUDA runtime error detected. Check GPU drivers and CUDA installation.",
      suggestion: "Reinstall CUDA toolkit or update GPU drivers.",
      recoverable: false,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("enoent") || lower.includes("no such file")) {
    return createError(ErrorCode.NotFound, msg, {
      userMessage: "A required file or directory was not found.",
      recoverable: false,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("econnrefused") || lower.includes("econnreset") || lower.includes("fetch failed")) {
    return createError(ErrorCode.NetworkError, msg, {
      userMessage: "Network connection failed. The target service may be offline.",
      suggestion: "Check your internet connection and verify the service is running.",
      recoverable: true,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("python") || lower.includes("pip") || lower.includes("venv")) {
    return createError(ErrorCode.PythonError, msg, {
      userMessage: "Python environment error detected.",
      suggestion: "Verify Python installation and virtual environment.",
      recoverable: true,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("node") && lower.includes("not found")) {
    return createError(ErrorCode.NodeError, msg, {
      userMessage: "A required workflow node is missing.",
      suggestion: "Install the missing custom node through the Runtime Manager.",
      recoverable: true,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("model") && (lower.includes("not found") || lower.includes("missing"))) {
    return createError(ErrorCode.ModelError, msg, {
      userMessage: "A required model file is missing.",
      suggestion: "Install the missing model through the Model Manager.",
      recoverable: true,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("permission") || lower.includes("access denied") || lower.includes("eacces")) {
    return createError(ErrorCode.PermissionDenied, msg, {
      userMessage: "Permission denied for this operation.",
      suggestion: "Check file permissions or run with appropriate privileges.",
      recoverable: false,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("license") || lower.includes("gpl") || lower.includes("copyleft")) {
    return createError(ErrorCode.LicenseError, msg, {
      userMessage: "License compatibility issue detected.",
      suggestion: "Review the license terms before proceeding.",
      recoverable: false,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return createError(ErrorCode.Timeout, msg, {
      userMessage: "Operation timed out.",
      suggestion: "The operation took too long. Try again or increase timeout settings.",
      recoverable: true,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("gpu") || lower.includes("graphics")) {
    return createError(ErrorCode.GpuError, msg, {
      userMessage: "GPU error detected.",
      suggestion: "Check GPU drivers and availability.",
      recoverable: true,
      details: context ? { context } : undefined,
    });
  }

  if (lower.includes("disk") || lower.includes("no space") || lower.includes("enomem")) {
    return createError(ErrorCode.ResourceError, msg, {
      userMessage: "Insufficient disk space.",
      suggestion: "Free up disk space or change the storage location.",
      recoverable: true,
      details: context ? { context } : undefined,
    });
  }

  // Default: unknown pattern, classify as resource error
  return createError(ErrorCode.ResourceError, msg, {
    userMessage: msg,
    recoverable: false,
    details: context ? { context } : undefined,
  });
}

/**
 * Generate a user-friendly error message from a CaioError.
 * This is what the GUI should display.
 */
export function humanizeError(error: CaioError): string {
  let message = error.userMessage || error.message;
  if (error.suggestion) {
    message += `\n\nSuggestion: ${error.suggestion}`;
  }
  if (error.recoverable) {
    message += "\n\nThis error may be recoverable. The system can attempt automatic repair.";
  }
  return message;
}

/**
 * Determine if an error is transient (worth retrying) or permanent.
 */
export function isTransient(error: CaioError): boolean {
  return error.recoverable;
}

/**
 * Calculate retry delay with exponential backoff.
 */
export function retryDelay(attempt: number, baseMs: number = 1000): number {
  return Math.min(baseMs * Math.pow(2, attempt), 30000);
}
