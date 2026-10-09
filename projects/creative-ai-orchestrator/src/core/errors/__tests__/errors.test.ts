// ============================================================================
// Error Classification Tests
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyError, humanizeError, isTransient, retryDelay } from "../index.js";
import { ErrorCode } from "../../types/index.js";

describe("Error Classification", () => {
  it("classifies CUDA OOM as VRAM error", () => {
    const err = classifyError("CUDA out of memory");
    assert.equal(err.code, ErrorCode.VramError);
    assert.ok(err.userMessage);
    assert.ok(err.suggestion);
    assert.equal(err.recoverable, true);
  });

  it("classifies CUDA errors", () => {
    const err = classifyError("CUDA error: device-side assert triggered");
    assert.equal(err.code, ErrorCode.CudaError);
  });

  it("classifies Python errors", () => {
    const err = classifyError("pip install failed");
    assert.equal(err.code, ErrorCode.PythonError);
  });

  it("classifies network errors", () => {
    const err = classifyError("ECONNREFUSED 127.0.0.1:8188");
    assert.equal(err.code, ErrorCode.NetworkError);
    assert.equal(err.recoverable, true);
  });

  it("classifies not found errors", () => {
    const err = classifyError("ENOENT: no such file or directory");
    assert.equal(err.code, ErrorCode.NotFound);
  });

  it("classifies permission errors", () => {
    const err = classifyError("EACCES: permission denied");
    assert.equal(err.code, ErrorCode.PermissionDenied);
  });

  it("classifies license errors", () => {
    const err = classifyError("GPL license detected in dependency");
    assert.equal(err.code, ErrorCode.LicenseError);
  });

  it("classifies timeout errors", () => {
    const err = classifyError("request timed out");
    assert.equal(err.code, ErrorCode.Timeout);
    assert.equal(err.recoverable, true);
  });

  it("humanizeError produces readable message", () => {
    const err = classifyError("CUDA out of memory");
    const msg = humanizeError(err);
    assert.ok(msg.includes("GPU memory"));
    assert.ok(msg.includes("Suggestion"));
  });

  it("isTransient returns correct value", () => {
    const transient = classifyError("ECONNREFUSED");
    const permanent = classifyError("EACCES: permission denied");
    assert.equal(isTransient(transient), true);
    assert.equal(isTransient(permanent), false);
  });

  it("retryDelay returns exponential backoff", () => {
    assert.equal(retryDelay(0), 1000);
    assert.equal(retryDelay(1), 2000);
    assert.equal(retryDelay(2), 4000);
    assert.ok(retryDelay(10) <= 30000);
  });
});
