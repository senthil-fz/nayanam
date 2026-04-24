// Flatten a paginated transaction list into an array of render items that
// interleave day-group headers and transaction rows. Keeps the single
// FlatList implementation simple while preserving the uppercase-mono day
// labels from the prototype.

import type { Transaction } from '@nayanam/core';
import { dayKey } from './format';

export type HeaderItem = { kind: 'header'; iso: string; key: string };
export type RowItem = { kind: 'row'; transaction: Transaction; key: string };
export type ListItem = HeaderItem | RowItem;

export function buildListItems(pages: { items: Transaction[] }[] | undefined): ListItem[] {
  const out: ListItem[] = [];
  let currentKey: string | null = null;
  for (const page of pages ?? []) {
    for (const t of page.items) {
      const k = dayKey(t.occurredAt);
      if (k !== currentKey) {
        currentKey = k;
        out.push({ kind: 'header', iso: t.occurredAt, key: `h-${k}` });
      }
      out.push({ kind: 'row', transaction: t, key: t.id });
    }
  }
  return out;
}
