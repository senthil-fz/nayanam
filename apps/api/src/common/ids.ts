import { ulid } from 'ulid';

/** Project-wide id factory. All PKs are ULIDs. */
export function newId(): string {
  return ulid();
}
