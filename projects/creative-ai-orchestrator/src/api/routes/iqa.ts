// ============================================================================
// IQA (Image Quality Assessment) API Routes
// ============================================================================

import { Router } from "express";
import { getIQAScorer } from "../../vision/iqa/scorer.js";

export const iqaRoutes = Router();

/**
 * POST /api/iqa/score — Score an image for quality
 * Body: { path: string, weights?: Partial<IQAWeights> }
 */
iqaRoutes.post("/score", async (req, res) => {
  try {
    const { path, weights } = req.body;
    if (!path) { res.status(400).json({ error: "path is required" }); return; }
    const scorer = getIQAScorer(weights);
    const result = await scorer.score(path);
    const suggestions = scorer.suggestImprovements(result);
    res.json({ ...result, suggestions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/iqa/compare — Compare two images for quality
 * Body: { img1: string, img2: string }
 */
iqaRoutes.post("/compare", async (req, res) => {
  try {
    const { img1, img2 } = req.body;
    if (!img1 || !img2) { res.status(400).json({ error: "img1 and img2 required" }); return; }
    const scorer = getIQAScorer();
    const result = await scorer.compare(img1, img2);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/iqa/batch — Score multiple images
 * Body: { paths: string[] }
 */
iqaRoutes.post("/batch", async (req, res) => {
  try {
    const { paths } = req.body;
    if (!paths || !Array.isArray(paths)) { res.status(400).json({ error: "paths array required" }); return; }
    const scorer = getIQAScorer();
    const results = await scorer.scoreBatch(paths);
    res.json({ count: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
