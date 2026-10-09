'use strict';

/**
 * BoundingBoxExtractor — Face 9: extract and track bounding boxes from screenshots.
 *
 * Uses LLM vision to identify UI elements, labels, and interactive regions
 * in a screenshot, returning structured bounding box data.
 *
 * In production: integrate with Playwright's page.evaluate() for real DOM boxes.
 * This implementation uses LLM-based extraction for vision-only contexts.
 */

const ELEMENT_TYPES = ['button', 'input', 'link', 'text', 'image', 'form', 'nav', 'modal', 'table', 'other'];

class BoundingBoxExtractor {
  constructor() {
    this._extractions = [];
  }

  /**
   * Extract bounding boxes from a screenshot via LLM vision.
   * @param {object} opts
   * @param {string} opts.base64 - base64-encoded image
   * @param {string} opts.mimeType - e.g. 'image/png'
   * @param {number} [opts.viewportWidth] - actual viewport width in px
   * @param {number} [opts.viewportHeight] - actual viewport height in px
   * @returns {Promise<{elements: BoundingBox[], screenshot_size: object}>}
   */
  async extract({ base64, mimeType, viewportWidth = 1280, viewportHeight = 720 }) {
    const elements = await this._callVision(base64, mimeType, viewportWidth, viewportHeight);

    const record = {
      id: `bbox_${Date.now()}`,
      element_count: elements.length,
      viewport: { width: viewportWidth, height: viewportHeight },
      elements,
      extracted_at: new Date().toISOString(),
    };
    this._extractions.push(record);
    if (this._extractions.length > 50) this._extractions.shift();

    return { elements, screenshot_size: { width: viewportWidth, height: viewportHeight } };
  }

  /**
   * Extract bounding boxes from raw DOM data (Playwright-style).
   * @param {object[]} domElements - array of { tag, text, rect: {x,y,width,height} }
   * @returns {BoundingBox[]}
   */
  fromDOM(domElements) {
    return domElements
      .filter((el) => el.rect && el.rect.width > 0 && el.rect.height > 0)
      .map((el, i) => ({
        id: `dom_${i}`,
        type: this._inferTypeFromTag(el.tag),
        tag: el.tag,
        label: el.text || el.ariaLabel || '',
        x: Math.round(el.rect.x),
        y: Math.round(el.rect.y),
        width: Math.round(el.rect.width),
        height: Math.round(el.rect.height),
        interactive: ['button', 'a', 'input', 'select', 'textarea'].includes(el.tag?.toLowerCase()),
        confidence: 1.0,
      }));
  }

  /**
   * Find overlapping bounding boxes (potential layout issues).
   */
  findOverlaps(elements) {
    const overlaps = [];
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i];
        const b = elements[j];
        if (this._overlaps(a, b)) {
          overlaps.push({ element_a: a.id, element_b: b.id, overlap_area: this._overlapArea(a, b) });
        }
      }
    }
    return overlaps;
  }

  /**
   * Check if any elements fall outside the viewport.
   */
  findOutOfBounds(elements, viewportWidth, viewportHeight) {
    return elements.filter((el) =>
      el.x < 0 || el.y < 0 ||
      el.x + el.width > viewportWidth ||
      el.y + el.height > viewportHeight,
    );
  }

  async _callVision(base64, mimeType, vw, vh) {
    try {
      const { callLLM } = require('~/server/services/LLMGateway/LLMGateway');
      const prompt = `Analyze this screenshot (${vw}×${vh}px) and identify all visible UI elements.
For each element return a JSON array entry:
{"id": "el_N", "type": "${ELEMENT_TYPES.join('|')}", "label": "text or description", "x": pixels_from_left, "y": pixels_from_top, "width": pixels, "height": pixels, "interactive": true|false}

Estimate coordinates as accurately as possible based on visual layout.
Return ONLY a valid JSON array — no explanation.`;

      const raw = await callLLM(prompt, { imageBase64: base64, imageMimeType: mimeType });
      const match = (raw || '').match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      return parsed
        .filter((el) => el.x >= 0 && el.y >= 0 && el.width > 0 && el.height > 0)
        .map((el, i) => ({
          id: el.id || `el_${i}`,
          type: ELEMENT_TYPES.includes(el.type) ? el.type : 'other',
          label: String(el.label || ''),
          x: Math.round(Number(el.x) || 0),
          y: Math.round(Number(el.y) || 0),
          width: Math.round(Number(el.width) || 0),
          height: Math.round(Number(el.height) || 0),
          interactive: Boolean(el.interactive),
          confidence: 0.7,
        }));
    } catch {
      return [];
    }
  }

  _inferTypeFromTag(tag = '') {
    const t = tag.toLowerCase();
    if (t === 'button') return 'button';
    if (t === 'input' || t === 'textarea' || t === 'select') return 'input';
    if (t === 'a') return 'link';
    if (['img', 'svg', 'canvas'].includes(t)) return 'image';
    if (t === 'form') return 'form';
    if (['nav', 'header'].includes(t)) return 'nav';
    if (['table', 'thead', 'tbody'].includes(t)) return 'table';
    if (['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label'].includes(t)) return 'text';
    return 'other';
  }

  _overlaps(a, b) {
    return !(a.x + a.width <= b.x || b.x + b.width <= a.x ||
             a.y + a.height <= b.y || b.y + b.height <= a.y);
  }

  _overlapArea(a, b) {
    const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return xOverlap * yOverlap;
  }

  getHistory(limit = 10) {
    return this._extractions.slice(-limit).reverse();
  }
}

let _instance = null;
function getBoundingBoxExtractor() {
  if (!_instance) _instance = new BoundingBoxExtractor();
  return _instance;
}

module.exports = { BoundingBoxExtractor, getBoundingBoxExtractor, ELEMENT_TYPES };
