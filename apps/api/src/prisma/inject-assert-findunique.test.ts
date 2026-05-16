/**
 * Unit tests for `injectAndAssertFindUnique` (Finding 4 — exported helper).
 *
 * These tests drive the helper directly with a mock `query` function so they
 * are completely independent of AsyncLocalStorage / Prisma / database.
 * They verify the three behaviours:
 *
 *  1. Cross-tenant row → HOUSEHOLD_SCOPE_VIOLATION (full select + narrow select).
 *  2. Narrow select: `householdId` is injected into the query args before
 *     execution and stripped from the result when the caller didn't request it.
 *  3. Same-household success with full select → returns the row unmodified.
 *  4. Same-household success with narrow select → strips injected householdId.
 *  5. Null result (row not found) → returns null without throwing.
 *  6. Non-household-scoped model → no assertion, result returned as-is.
 */

import { describe, expect, it, vi } from 'vitest';
import { injectAndAssertFindUnique } from './prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a mock query that returns the given value regardless of args. */
function mockQuery(returnValue: unknown) {
  return vi.fn().mockResolvedValue(returnValue);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('injectAndAssertFindUnique', () => {
  // 1a. Cross-tenant — full select (householdId present in result naturally).
  it('throws HOUSEHOLD_SCOPE_VIOLATION when row.householdId !== ctxHh (full select)', async () => {
    const q = mockQuery({ id: 'row-1', householdId: 'HH-B', nickname: 'B acc' });
    await expect(
      injectAndAssertFindUnique(
        { where: { id: 'row-1' } },
        'HH-A', // caller is in household A
        true,
        q,
      ),
    ).rejects.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({ code: 'HOUSEHOLD_SCOPE_VIOLATION' }),
    });
    // Query was executed once (with original args — no injection needed).
    expect(q).toHaveBeenCalledTimes(1);
    expect(q.mock.calls[0]?.[0]).toEqual({ where: { id: 'row-1' } });
  });

  // 1b. Cross-tenant — narrow select omitting householdId.
  it('throws HOUSEHOLD_SCOPE_VIOLATION when row.householdId !== ctxHh (narrow select, injected)', async () => {
    // The mock returns what the DB would return after we injected householdId.
    const q = mockQuery({ id: 'row-1', nickname: 'B acc', householdId: 'HH-B' });
    await expect(
      injectAndAssertFindUnique(
        { where: { id: 'row-1' }, select: { id: true, nickname: true } },
        'HH-A',
        true,
        q,
      ),
    ).rejects.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({ code: 'HOUSEHOLD_SCOPE_VIOLATION' }),
    });
    // Query must have been called with householdId injected into select.
    expect(q).toHaveBeenCalledTimes(1);
    expect(q.mock.calls[0]?.[0]).toEqual({
      where: { id: 'row-1' },
      select: { id: true, nickname: true, householdId: true },
    });
  });

  // 2. Narrow select — same household → injected, asserted, then stripped.
  it('strips injected householdId from result when caller did not request it (same household)', async () => {
    const q = mockQuery({ id: 'row-1', nickname: 'My acc', householdId: 'HH-A' });
    const result = await injectAndAssertFindUnique(
      { where: { id: 'row-1' }, select: { id: true, nickname: true } },
      'HH-A',
      true,
      q,
    );
    // householdId should be absent from the returned object.
    expect(result).toEqual({ id: 'row-1', nickname: 'My acc' });
    expect((result as Record<string, unknown>).householdId).toBeUndefined();
  });

  // 3. Full select — same household → returns row unmodified.
  it('returns the full row unmodified when caller requested householdId (same household)', async () => {
    const row = { id: 'row-1', nickname: 'My acc', householdId: 'HH-A' };
    const q = mockQuery(row);
    const result = await injectAndAssertFindUnique(
      { where: { id: 'row-1' } }, // no select → full row
      'HH-A',
      true,
      q,
    );
    expect(result).toEqual(row);
    // Original args unchanged (no injection).
    expect(q.mock.calls[0]?.[0]).toEqual({ where: { id: 'row-1' } });
  });

  // 4. Full select explicitly including householdId — no injection, no strip.
  it('does not inject or strip when caller explicitly selected householdId', async () => {
    const row = { id: 'row-1', householdId: 'HH-A' };
    const q = mockQuery(row);
    const result = await injectAndAssertFindUnique(
      { where: { id: 'row-1' }, select: { id: true, householdId: true } },
      'HH-A',
      true,
      q,
    );
    expect(result).toEqual(row);
    // select was not modified.
    expect(q.mock.calls[0]?.[0]).toEqual({
      where: { id: 'row-1' },
      select: { id: true, householdId: true },
    });
  });

  // 5. Null result (row not found) → no assertion, null returned.
  it('returns null without throwing when query returns null', async () => {
    const q = mockQuery(null);
    const result = await injectAndAssertFindUnique(
      { where: { id: 'row-missing' } },
      'HH-A',
      true,
      q,
    );
    expect(result).toBeNull();
  });

  // 6. householdScoped = false → no ownership assertion, row returned as-is.
  it('skips assertion and returns row when householdScoped is false', async () => {
    const row = { id: 'row-1', householdId: 'HH-B' }; // would fail if scoped
    const q = mockQuery(row);
    const result = await injectAndAssertFindUnique(
      { where: { id: 'row-1' } },
      'HH-A',
      false, // not scoped
      q,
    );
    expect(result).toEqual(row);
  });

  // 7. Hard-fail: row exists but householdId is not a string (column absent).
  it('throws HOUSEHOLD_SCOPE_VIOLATION when row.householdId is not a string', async () => {
    // Model that lacks the column — householdId will be undefined.
    const q = mockQuery({ id: 'row-1' });
    await expect(
      injectAndAssertFindUnique(
        { where: { id: 'row-1' } },
        'HH-A',
        true,
        q,
      ),
    ).rejects.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({ code: 'HOUSEHOLD_SCOPE_VIOLATION' }),
    });
  });

  // 8. No args at all → treats as no select (full), passes through.
  it('handles undefined args gracefully when result is null', async () => {
    const q = mockQuery(null);
    const result = await injectAndAssertFindUnique(undefined, 'HH-A', true, q);
    expect(result).toBeNull();
  });
});
