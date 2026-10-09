// ============================================================================
// Core Type Tests
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newId, createError, ErrorCode } from "../index.js";

describe("Core Types", () => {
  it("newId generates unique IDs", () => {
    const id1 = newId();
    const id2 = newId();
    assert.notEqual(id1, id2);
    assert.equal(typeof id1, "string");
    assert.ok(id1.length > 0);
  });

  it("createError creates classified errors", () => {
    const err = createError(ErrorCode.VramError, "CUDA OOM", {
      userMessage: "Not enough VRAM",
      suggestion: "Reduce resolution",
      recoverable: true,
    });

    assert.equal(err.code, ErrorCode.VramError);
    assert.equal(err.message, "CUDA OOM");
    assert.equal(err.userMessage, "Not enough VRAM");
    assert.equal(err.suggestion, "Reduce resolution");
    assert.equal(err.recoverable, true);
    assert.ok(err.timestamp instanceof Date);
  });

  it("createError defaults", () => {
    const err = createError(ErrorCode.NotFound, "file missing");
    assert.equal(err.recoverable, false);
    assert.equal(err.details, undefined);
  });
});
