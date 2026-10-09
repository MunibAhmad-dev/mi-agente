/**
 * EntityResolver Unit Tests
 * ==========================
 */

const EntityResolver = require('../entityResolution/EntityResolver');

describe('EntityResolver', () => {
  let resolver;

  beforeEach(() => {
    resolver = new EntityResolver();
  });

  describe('registerAccount', () => {
    test('creates new entity for first account', () => {
      const account = { username: 'johndoe', displayName: 'John Doe', platform: 'reddit', bio: 'Ceramic artist', followers: 100 };
      const entity = resolver.registerAccount(account);
      expect(entity).toBeDefined();
      expect(entity.id).toMatch(/^ent_/);
      expect(entity.accounts.length).toBe(1);
      expect(entity.accounts[0].platform).toBe('reddit');
    });

    test('merges same username across platforms', () => {
      const reddit = { username: 'johndoe', displayName: 'John Doe', platform: 'reddit', bio: 'Ceramic artist', followers: 100 };
      const bluesky = { username: 'johndoe', displayName: 'John Doe', platform: 'bluesky', bio: 'Ceramic artist', followers: 200 };
      const entity1 = resolver.registerAccount(reddit);
      const entity2 = resolver.registerAccount(bluesky);
      expect(entity1.id).toBe(entity2.id);
      expect(entity2.accounts.length).toBe(2);
    });

    test('creates separate entities for different users', () => {
      const user1 = { username: 'alice', displayName: 'Alice', platform: 'reddit', bio: 'Artist', followers: 50 };
      const user2 = { username: 'bob', displayName: 'Bob', platform: 'reddit', bio: 'Developer', followers: 200 };
      const entity1 = resolver.registerAccount(user1);
      const entity2 = resolver.registerAccount(user2);
      expect(entity1.id).not.toBe(entity2.id);
    });
  });

  describe('findEntities', () => {
    test('finds entity by exact username', () => {
      resolver.registerAccount({ username: 'johndoe', displayName: 'John', platform: 'reddit', bio: '', followers: 0 });
      const results = resolver.findEntities('johndoe');
      expect(results.length).toBe(1);
      expect(results[0].matchType).toBe('exact_username');
    });

    test('finds entity by display name', () => {
      resolver.registerAccount({ username: 'jd123', displayName: 'John Doe', platform: 'reddit', bio: '', followers: 0 });
      const results = resolver.findEntities('John Doe');
      expect(results.length).toBeGreaterThan(0);
    });

    test('returns empty for no matches', () => {
      const results = resolver.findEntities('nonexistent_user_xyz');
      expect(results.length).toBe(0);
    });
  });

  describe('getSummary', () => {
    test('returns correct summary', () => {
      resolver.registerAccount({ username: 'a', platform: 'reddit', followers: 0 });
      resolver.registerAccount({ username: 'a', platform: 'bluesky', followers: 0 });
      resolver.registerAccount({ username: 'b', platform: 'github', followers: 0 });
      const summary = resolver.getSummary();
      expect(summary.totalEntities).toBe(2);
      expect(summary.multiPlatform).toBe(1);
    });
  });
});
