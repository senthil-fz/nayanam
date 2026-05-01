import { describe, it, expect } from 'vitest';

import { canonicalJSON, canonicalize } from '../../src/common/canonicalize';

/**
 * Phase-11 task-014 — table-driven tests for `canonicalJSON` / `canonicalize`.
 *
 * These are pure-function checks with no DB or Nest container involvement.
 */
describe('canonicalize', () => {
  describe('key-order normalization', () => {
    it('produces identical output for objects with the same keys in different insertion order', () => {
      const ab = canonicalJSON({ a: 1, b: 2 });
      const ba = canonicalJSON({ b: 2, a: 1 });
      expect(ab).toBe(ba);
    });

    it('produces a stable, sorted key order', () => {
      const result = canonicalJSON({ z: 1, a: 2, m: 3 });
      expect(result).toBe('{"a":2,"m":3,"z":1}');
    });
  });

  describe('bigint coercion', () => {
    it('coerces bigint values to strings without throwing', () => {
      expect(() => canonicalJSON({ a: 1n })).not.toThrow();
    });

    it('serializes bigint as a string in the JSON output', () => {
      const result = canonicalJSON({ a: 1n });
      expect(result).toBe('{"a":"1"}');
    });

    it('coerces large bigint correctly', () => {
      const result = canonicalJSON({ amount: 999_999_999_999n });
      expect(result).toBe('{"amount":"999999999999"}');
    });
  });

  describe('nested objects', () => {
    it('sorts inner object keys recursively', () => {
      const result = canonicalJSON({ a: { z: 1, a: 2 } });
      expect(result).toBe('{"a":{"a":2,"z":1}}');
    });

    it('handles deeply nested objects', () => {
      const input = { outer: { b: { y: 'y', x: 'x' }, a: 1 } };
      const result = canonicalJSON(input);
      // outer keys: a, b; inner b keys: x, y
      expect(result).toBe('{"outer":{"a":1,"b":{"x":"x","y":"y"}}}');
    });
  });

  describe('arrays', () => {
    it('preserves insertion order — arrays are NOT sorted', () => {
      const result = canonicalJSON({ a: [3, 1, 2] });
      expect(result).toBe('{"a":[3,1,2]}');
    });

    it('does not reorder string arrays', () => {
      const result = canonicalJSON({ tags: ['zebra', 'apple', 'mango'] });
      expect(result).toBe('{"tags":["zebra","apple","mango"]}');
    });

    it('recursively canonicalizes objects inside arrays', () => {
      const result = canonicalJSON({ items: [{ b: 2, a: 1 }] });
      expect(result).toBe('{"items":[{"a":1,"b":2}]}');
    });
  });

  describe('null handling', () => {
    it('includes null values — does not strip them', () => {
      const result = canonicalJSON({ a: null, b: 1 });
      expect(result).toBe('{"a":null,"b":1}');
    });

    it('handles top-level null', () => {
      const result = canonicalJSON(null);
      expect(result).toBe('null');
    });
  });

  describe('output validity', () => {
    it('produces a string that round-trips through JSON.parse', () => {
      const input = { z: [1, 2], a: { b: 'hello', a: 42n } };
      const serialized = canonicalJSON(input);
      expect(() => JSON.parse(serialized)).not.toThrow();
      const parsed = JSON.parse(serialized) as unknown;
      expect(parsed).toEqual({ a: { a: '42', b: 'hello' }, z: [1, 2] });
    });

    it('returns a string (not undefined or null)', () => {
      expect(typeof canonicalJSON({})).toBe('string');
      expect(typeof canonicalJSON({ x: 1 })).toBe('string');
    });
  });

  describe('primitives at the top level', () => {
    it('serializes a number directly', () => {
      expect(canonicalJSON(42)).toBe('42');
    });

    it('serializes a string directly', () => {
      expect(canonicalJSON('hello')).toBe('"hello"');
    });

    it('serializes boolean directly', () => {
      expect(canonicalJSON(true)).toBe('true');
    });

    it('coerces top-level bigint to string', () => {
      expect(canonicalize(10n)).toBe('10');
    });
  });
});
