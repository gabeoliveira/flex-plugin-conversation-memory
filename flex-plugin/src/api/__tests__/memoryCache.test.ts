import {
  memoryCacheKey,
  getCachedMemory,
  setCachedMemory,
  invalidateMemory,
  __clearMemoryCache,
} from '../memoryCache';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DATA = { profileId: 'p1', observations: [], summaries: [] } as any;

describe('memoryCache (C1)', () => {
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
    __clearMemoryCache();
  });

  it('keys on identifiers + limits (load-more misses)', () => {
    expect(memoryCacheKey('IDS', 10, 5)).toBe('IDS|o10|s5');
    expect(memoryCacheKey('IDS', 20, 5)).not.toBe(memoryCacheKey('IDS', 10, 5));
  });

  it('returns a hit within the TTL', () => {
    let t = 1000;
    Date.now = () => t;
    setCachedMemory('k', DATA);
    t += 59_000;
    expect(getCachedMemory('k')).toBe(DATA);
  });

  it('expires after the TTL', () => {
    let t = 1000;
    Date.now = () => t;
    setCachedMemory('k', DATA);
    t += 61_000;
    expect(getCachedMemory('k')).toBeUndefined();
  });

  it('invalidate(key) drops one; invalidate() clears all', () => {
    Date.now = () => 1000;
    setCachedMemory('a', DATA);
    setCachedMemory('b', DATA);
    invalidateMemory('a');
    expect(getCachedMemory('a')).toBeUndefined();
    expect(getCachedMemory('b')).toBe(DATA);
    invalidateMemory();
    expect(getCachedMemory('b')).toBeUndefined();
  });
});
