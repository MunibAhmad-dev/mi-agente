'use strict';

const { BoundingBoxExtractor, ELEMENT_TYPES } = require('../BoundingBoxExtractor');

describe('BoundingBoxExtractor', () => {
  let extractor;
  beforeEach(() => { extractor = new BoundingBoxExtractor(); });

  test('fromDOM converts DOM elements to bounding boxes', () => {
    const domElements = [
      { tag: 'button', text: 'Submit', rect: { x: 10, y: 20, width: 100, height: 40 } },
      { tag: 'input', text: '', rect: { x: 10, y: 70, width: 200, height: 30 } },
      { tag: 'div', text: '', rect: { x: 0, y: 0, width: 0, height: 0 } }, // zero size — filtered
    ];
    const boxes = extractor.fromDOM(domElements);
    expect(boxes.length).toBe(2);
    expect(boxes[0].type).toBe('button');
    expect(boxes[0].interactive).toBe(true);
    expect(boxes[1].type).toBe('input');
    expect(boxes[1].interactive).toBe(true);
  });

  test('fromDOM infers type from anchor tag', () => {
    const boxes = extractor.fromDOM([{ tag: 'a', text: 'Click me', rect: { x: 0, y: 0, width: 80, height: 20 } }]);
    expect(boxes[0].type).toBe('link');
    expect(boxes[0].interactive).toBe(true);
  });

  test('findOverlaps detects overlapping elements', () => {
    const elements = [
      { id: 'el_0', x: 0, y: 0, width: 100, height: 100 },
      { id: 'el_1', x: 50, y: 50, width: 100, height: 100 }, // overlaps with el_0
      { id: 'el_2', x: 200, y: 200, width: 50, height: 50 }, // no overlap
    ];
    const overlaps = extractor.findOverlaps(elements);
    expect(overlaps.length).toBe(1);
    expect(overlaps[0].element_a).toBe('el_0');
    expect(overlaps[0].element_b).toBe('el_1');
  });

  test('findOutOfBounds detects elements outside viewport', () => {
    const elements = [
      { id: 'el_0', x: 0, y: 0, width: 100, height: 100 },
      { id: 'el_1', x: 1200, y: 0, width: 200, height: 50 }, // extends beyond 1280px
    ];
    const outOfBounds = extractor.findOutOfBounds(elements, 1280, 800);
    expect(outOfBounds.length).toBe(1);
    expect(outOfBounds[0].id).toBe('el_1');
  });

  test('getHistory is initially empty', () => {
    expect(extractor.getHistory()).toEqual([]);
  });

  test('ELEMENT_TYPES contains expected types', () => {
    expect(ELEMENT_TYPES).toContain('button');
    expect(ELEMENT_TYPES).toContain('input');
    expect(ELEMENT_TYPES).toContain('link');
    expect(ELEMENT_TYPES).toContain('image');
  });
});
