/**
 * Deterministic JSON serialization with recursively sorted object keys, so
 * `{a:1,b:2}` and `{b:2,a:1}` produce identical hashes. Arrays preserve order
 * (order is semantically significant). bigint is coerced to string to match
 * our money-over-wire convention.
 */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? value.toString() : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v));
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = canonicalize(obj[k]);
  }
  return out;
}
