'use strict';

const { CurriculumGenerator } = require('../CurriculumGenerator');

describe('CurriculumGenerator', () => {
  let gen;
  beforeEach(() => { gen = new CurriculumGenerator(); });

  test('generate creates a curriculum with modules', () => {
    const c = gen.generate({
      goal: 'Learn JavaScript',
      knownTopics: ['variables'],
      targetTopics: ['closures', 'promises', 'async-await'],
      level: 'intermediate',
    });
    expect(c.id).toMatch(/^curr_/);
    expect(c.modules.length).toBeGreaterThan(0);
    expect(c.gaps).toContain('closures');
    expect(c.total_lessons).toBeGreaterThan(0);
    expect(c.estimated_hours).toBeGreaterThan(0);
  });

  test('known topics are excluded from gaps', () => {
    const c = gen.generate({
      goal: 'Learn Python',
      knownTopics: ['syntax', 'lists'],
      targetTopics: ['syntax', 'generators', 'decorators'],
    });
    expect(c.gaps).not.toContain('syntax');
    expect(c.gaps).toContain('generators');
  });

  test('get retrieves stored curriculum', () => {
    const c = gen.generate({ goal: 'Test', targetTopics: ['topic-a'] });
    expect(gen.get(c.id)).toBe(c);
  });

  test('get returns null for unknown id', () => {
    expect(gen.get('nonexistent')).toBeNull();
  });

  test('list returns all curricula', () => {
    gen.generate({ goal: 'C1', targetTopics: ['t1'] });
    gen.generate({ goal: 'C2', targetTopics: ['t2'] });
    expect(gen.list().length).toBe(2);
  });

  test('list filters by learner_id', () => {
    gen.generate({ goal: 'C1', targetTopics: ['t1'], learner_id: 'user-1' });
    gen.generate({ goal: 'C2', targetTopics: ['t2'], learner_id: 'user-2' });
    expect(gen.list({ learner_id: 'user-1' }).length).toBe(1);
  });

  test('completeLesson marks lesson and updates progress', () => {
    const c = gen.generate({ goal: 'G', targetTopics: ['a', 'b'], level: 'beginner' });
    const result = gen.completeLesson(c.id, 0, 0);
    expect(result.lesson.status).toBe('completed');
    expect(result.progress).toBeGreaterThan(0);
  });

  test('completeLesson throws for unknown curriculum', () => {
    expect(() => gen.completeLesson('bad-id', 0, 0)).toThrow();
  });

  test('adapt adds new modules for new gaps', () => {
    const c = gen.generate({ goal: 'Adapt test', targetTopics: ['x'] });
    const before = c.modules.length;
    gen.adapt(c.id, ['new-topic-1', 'new-topic-2']);
    expect(c.modules.length).toBeGreaterThan(before);
  });

  test('curriculum without known topics generates intro module', () => {
    const c = gen.generate({ goal: 'Intro', knownTopics: ['a', 'b'], targetTopics: ['a', 'b'] });
    expect(c.gaps.length).toBe(0);
    expect(c.modules.length).toBe(1);
    expect(c.modules[0].id).toBe('module_intro');
  });
});
