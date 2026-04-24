# Phase 8 — Attachments & Notifications In-App

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-24
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-801..F-804; [Phase 0](./2026-04-23-phase-0-foundation.md) (MinIO, S3 envs); [Phase 1](./2026-04-23-phase-1-identity-tenancy.md) (`notification_tokens`); [Phase 3](./2026-04-24-phase-3-categories-transactions.md) (Transaction owner of attachments); [Phase 4](./2026-04-24-phase-4-home-screen.md) (notifications table + bell stub + `/notifications/unread-count`); [Phase 5](./2026-04-24-phase-5-bills.md) (`bill.*` notification writes, push plumbing); [Phase 6](./2026-04-24-phase-6-budgets.md) (`budget.threshold_fired`, `budget.auto_archived` writes); prototype `~/Downloads/Expense manager/components/screen-home.jsx`.

## Problem

Two orthogonal gaps block earlier phases from feeling complete:

1. **Attachments.** CLAUDE.md §Attachments commits us to S3-compatible storage with signed URLs and an `Attachment` table, but nothing is wired. Users who add a transaction cannot attach a receipt. No S3 client, no presign endpoints, no table, no upload UI.
2. **Notification center.** Phase 4 shipped the `notifications` table and the unread-count endpoint, and the Home bell currently toasts "Notification center arrives in Phase 8." Phases 5 and 6 write real rows (`bill.due_soon`, `bill.overdue`, `bill.paid`, `budget.threshold_fired`, `budget.auto_archived`) that nobody can read. F-803 + F-804 finish the loop.

Both land together because they share the "you've got mail" metaphor (bell + paperclip), both are cross-phase glue, and both are small on their own.

## Goals

- `attachments` table + Prisma model + S3/MinIO wiring via a new `StorageModule`.
- Presign-upload → client-direct-PUT → finalize flow with server-side HEAD verification and inline thumbnail generation for images.
- MIME allowlist (JPEG, PNG, HEIC, WebP, PDF) + size caps (images 10 MB, PDF 25 MB) enforced at presign AND finalize.
- Attachment endpoints for list / get / download-url refresh / delete / restore.
- Transaction add/edit UI on web + mobile gains an attachments strip (thumbnails, add, delete, preview).
- Notifications endpoints: list (cursor paginated), mark-read, mark-unread, mark-all-read, soft-delete. Adds `deleted_at` column to `notifications`.
- Notification center UI: popover on web, bottom sheet on mobile. Filter chips, grouped by day, tap-through routing by `type`, mark-all-read header action.
- Shared Zod schemas + TanStack Query hooks in `packages/core/attachments` and extended `packages/core/notifications`.
- A daily cron that reaps `PENDING` attachments older than 24h.

## Non-goals

- Receipt OCR / text extraction. `Attachment.key` supports it later.
- Image cropping / rotation editor pre-upload.
- Attachments on bills, budgets, accounts, categories, household logos, user avatars. `owner_type` column is typed permissively but Phase 8 only exercises `transaction`.
- Offline upload queue. Network failures fail fast with a Retry affordance on the failed tile.
- Push notifications for receipt-upload. Bills and budgets already mint their own pushes.
- Per-category mute / notification preferences (Phase 9).
- Search / filter inside the notification center beyond category chips. Text search deferred.
- Email digests (Phase 9).
- Web push service-worker wiring — unchanged from Phase 1 status.
- Auto-cleanup of old read notifications (> 90 days). Defer.
- Notifications full-page route on web (the popover is self-sufficient for v1).
- `react-native-pdf` native dep on mobile. Phase 8 opens PDFs via `expo-web-browser`.

## User stories

**Attachments:**

1. As a MEMBER on mobile I add an expense and attach a photo of the receipt via the camera. Upload progress is visible; on success the transaction row shows a paperclip with the thumbnail count.
2. As a MEMBER on web I edit a prior transaction, drop in a PDF from my desktop, and the file appears in the attachments strip.
3. As a MEMBER I tap/click any attachment thumbnail to open a full-screen preview (image) or open the PDF in a new tab / in-app browser.
4. As a MEMBER I delete an attachment from a transaction; the thumbnail disappears immediately (optimistic) and the S3 object is removed server-side.
5. As an ADMIN I can delete any attachment in my household (not only my own).
6. The system rejects a 30 MB image upload with `ATTACHMENT_TOO_LARGE` before the user wastes bandwidth.
7. The system rejects a `.zip` selection with `ATTACHMENT_MIME_NOT_ALLOWED`.
8. As a VIEWER I can see attached receipts on transactions but cannot add or delete.

**Notification center:**

9. As any member I tap the Home bell and a panel opens listing my recent notifications grouped by day with unread indicators.
10. Tapping a `bill.due_soon` item closes the panel and navigates to the relevant bill; tapping a `budget.threshold_fired` item navigates to the Budgets screen with the budget highlighted.
11. I tap "Mark all read" and every unread item in my current filter becomes read; the bell dot disappears.
12. I long-press (mobile) / open the overflow menu (web) on a row to mark it unread or delete it.
13. I filter the list with chips: All, Bills, Budgets, Transactions.
14. On a brand-new household I see a friendly empty state.

## Scope by surface

- **Backend (`apps/api`):**
  - New `StorageModule` + `StorageService` wrapping AWS SDK v3 S3 client (works against MinIO locally).
  - New `AttachmentsModule` (controller, service, DTOs, role-guard).
  - Extend `NotificationsModule` (already exists with `/unread-count` only): add list/mark-read/mark-unread/mark-all-read/soft-delete endpoints and a `NotificationsService.softDelete` method.
  - Liquibase changelog `20260424-008-phase-8-attachments.yaml`: creates `attachments` table + indexes + CHECK constraint on `owner_type`.
  - Liquibase changelog `20260424-008-phase-8-notifications-deleted-at.yaml`: adds `deleted_at timestamptz null` to `notifications` + a partial index `(user_id, read_at) WHERE deleted_at IS NULL` to replace / augment the Phase 4 index.
  - Register `Attachment` in `HOUSEHOLD_SCOPED_MODELS` and `SOFT_DELETE_MODELS` in `apps/api/src/prisma/prisma.service.ts`. `Notification` remains user-scoped (unchanged); the service layer applies the `deleted_at IS NULL` filter explicitly on reads rather than globally, because Phase 4's scoping for notifications is by `userId` not `householdId` (and Prisma middleware's tenant-scoping applies to the household-scoped set).
  - New daily `@Cron(CronExpression.EVERY_DAY_AT_2AM)` scheduled job `AttachmentReaperService` with advisory lock key `0xA77AC41`: marks any `attachments` row with `status=PENDING` and `created_at < now()-24h` as `FAILED`, attempts an S3 delete on the object (ignore 404), does not soft-delete the row so audit is preserved.
  - New deps (latest stable): `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `sharp`. Declared in `apps/api/package.json` only; installation is the user's step.
- **Web (`apps/web`):**
  - New feature folder `apps/web/src/features/attachments/` with `AttachmentStrip.tsx`, `AttachmentTile.tsx`, `AttachmentPreview.tsx`, `AttachmentPickerButton.tsx`, `useAttachmentUpload.ts`.
  - Wire the strip into existing `AddTransactionDialog.tsx` + `EditTransactionDialog.tsx` under `apps/web/src/features/transactions/`.
  - Rewrite `apps/web/src/features/home/NotificationBell.tsx`: replace the Phase 4 toast stub with a Radix/shadcn popover hosting `NotificationCenter`.
  - New files under `apps/web/src/features/notifications/`: `NotificationCenter.tsx`, `NotificationList.tsx`, `NotificationRow.tsx`, `NotificationFilterChips.tsx`, `EmptyNotificationCenter.tsx`.
- **Mobile (`apps/mobile`):**
  - New feature folder `apps/mobile/src/features/attachments/` with `AttachmentStrip.tsx`, `AttachmentTile.tsx`, `AttachmentPickerActionSheet.tsx`, `AttachmentPreviewScreen.tsx`, `useAttachmentUpload.ts`.
  - Wire strip into `AddTransactionSheet.tsx` + `EditTransactionSheet.tsx` from Phase 3.
  - Rewrite `apps/mobile/src/features/home/NotificationBell.tsx`: replace the Phase 4 alert stub with a `@gorhom/bottom-sheet` opener.
  - New files under `apps/mobile/src/features/notifications/`: `NotificationCenterSheet.tsx`, `NotificationList.tsx`, `NotificationRow.tsx`, `NotificationFilterChips.tsx`, `EmptyNotificationCenter.tsx`.
  - New deps (latest stable): `expo-image-picker`, `expo-document-picker`, `expo-image`, `expo-web-browser`. Declared in `apps/mobile/package.json`.
  - Extend `apps/mobile/src/lib/push-handlers.ts` to reuse the shared `resolveNotificationRoute` helper (so `budget.*` deep-links route correctly from a tapped push, not only from an in-app tap).
- **Shared (`packages/core`):**
  - `packages/core/src/attachments/{schemas.ts,hooks.ts,index.ts}` — schemas, enums, and a `makeAttachmentHooks(client)` factory.
  - Extend `packages/core/src/notifications/{schemas.ts,hooks.ts,index.ts}` — add list / mutate schemas and factory-produced hooks. Add `deriveCategoryFromType(type)` and `resolveNotificationRoute(notification)` helpers (the routing helper returns `{ web: string; mobile: string }`).
  - Register subpath export for `./attachments` in `packages/core/package.json`; re-export from the top-level `src/index.ts`.
  - Extend `packages/core/src/api/client.ts` with the new endpoint methods.
- **Shared (`packages/ui-tokens`):** no changes.
- **Deferred:** OCR (D-001), attachments for other owner types, attachment editor UX, notification preferences, email digests, full-page notifications route on web.

## Data model

### New table: `attachments`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text | no | | pk |
| `household_id` | ULID text | no | | fk → `households.id`, ON DELETE CASCADE |
| `owner_type` | text | no | | CHECK `owner_type IN ('transaction')` in v1. CHECK updated in later phases when new owner types arrive. |
| `owner_id` | ULID text | no | | polymorphic: resolves to `transactions.id` when `owner_type='transaction'`. No DB-level FK; service validates existence + tenant ownership on every insert. |
| `key` | text | no | | S3 object key. Unique across all rows (`UNIQUE (key)`). Format: `households/<hid>/txn/<tid>/<attachment_id>.<ext>`. |
| `mime` | text | no | | Allowlist: `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `application/pdf`. |
| `size` | bigint | no | | bytes. Validated against cap at presign; re-verified against S3 `HeadObject` on finalize. |
| `original_filename` | text | no | | user-provided display name, max 255 chars, trimmed, path-components stripped. |
| `thumb_key` | text | yes | null | S3 key for the WebP thumbnail. Null for PDFs and for HEIC when sharp lacks HEIF support. |
| `width` | int | yes | null | pixel width for images (from `sharp.metadata()`). |
| `height` | int | yes | null | pixel height for images. |
| `status` | text | no | `'PENDING'` | enum: `PENDING`, `READY`, `FAILED`. CHECK constraint. |
| `created_by` | ULID text | no | | fk → `users.id`. The user who uploaded. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | null | soft-delete; filtered by Prisma middleware. Restorable within 24h. |

**Indexes:**

- `idx_attachments_owner` on `(household_id, owner_type, owner_id)` — primary lookup for "list attachments for this transaction."
- `idx_attachments_household_created` on `(household_id, created_at DESC)` — future admin tooling.
- `idx_attachments_created_by` on `(created_by)` — future "my uploads" and user-scoped cleanup.
- `UNIQUE (key)` — one row per S3 key.

**Prisma registry:** add `Attachment` to `HOUSEHOLD_SCOPED_MODELS` and `SOFT_DELETE_MODELS` in `apps/api/src/prisma/prisma.service.ts`. Do **not** add a concrete `Transaction.attachments` Prisma relation — the reference is polymorphic, and a concrete relation would mis-model future owner types. Instead, `TransactionsService.getAttachments(txnId)` returns the list via `AttachmentsService.listForOwner('transaction', txnId)`.

### Existing table: `notifications` (Phase 4)

Add column via `20260424-008-phase-8-notifications-deleted-at.yaml`:

- `deleted_at timestamptz null`.
- New partial index `idx_notifications_unread_live` on `(user_id, read_at) WHERE deleted_at IS NULL`. Keep or drop the Phase 4 `(user_id, read_at)` index — drop it to avoid redundancy.
- Also add `idx_notifications_user_created_live` on `(user_id, created_at DESC, id DESC) WHERE deleted_at IS NULL` to support the list-sort.

No column for `category` — derived client-side from `type.split('.')[0]`. Documented in `packages/core/src/notifications/schemas.ts` via `deriveCategoryFromType`.

## API surface (sketch)

All under `/api/v1`, require `Authorization: Bearer` + `X-Household-Id`, mutations accept `Idempotency-Key`.

### Attachments

**POST `/attachments/presign-upload`** — idempotent.
- Role: MEMBER+.
- Body: `{ ownerType: 'transaction', ownerId: string, filename: string, mime: string, size: number }`.
- Validates ownership (transaction must exist + belong to ctx.householdId), MIME allowlist, size cap for that MIME.
- Generates `key` = `households/<hid>/txn/<tid>/<new_ulid>.<ext>`.
- Inserts `attachments` row with `status='PENDING'`.
- Returns:
  ```json
  {
    "attachmentId": "01HZ...",
    "key": "households/.../...",
    "uploadUrl": "https://minio.local/...",
    "requiredHeaders": { "Content-Type": "image/jpeg" },
    "expiresAt": "2026-04-24T10:05:00Z"
  }
  ```
- Errors: `ATTACHMENT_OWNER_NOT_FOUND` 404, `ATTACHMENT_MIME_NOT_ALLOWED` 422, `ATTACHMENT_TOO_LARGE` 422, `STORAGE_UNAVAILABLE` 503.

**POST `/attachments/:id/finalize`** — idempotent.
- Role: MEMBER+. Must be the creator OR ADMIN+.
- Body: empty.
- Behavior: `HeadObject` on S3; verify size matches `attachments.size`; if image, generate a 256px-max WebP thumbnail inline via `sharp`, upload to `<key>.thumb.webp`, update row with `thumb_key`, `width`, `height`; set `status='READY'`; return the full attachment with fresh signed `downloadUrl` + `thumbUrl`.
- Errors: `ATTACHMENT_FINALIZE_FAILED` 409, `ATTACHMENT_SIZE_MISMATCH` 409, `ATTACHMENT_ALREADY_FINALIZED` 409 (second finalize on READY is a no-op if the idempotency key matches; otherwise 409). Thumbnail failures do not fail finalize — they're logged and `thumb_key` stays null.
- Emits `attachment.uploaded` event.

**GET `/attachments`**
- Role: VIEWER+ (read).
- Query: `ownerType` (required), `ownerId` (required), `includeFailed?=false`, `includeDeleted?=false`.
- Returns `{ items: AttachmentWithUrls[] }` (not paginated — transactions have few attachments; cap at 50 per owner, return `PAGE_LIMIT_EXCEEDED` if more). Each item: attachment fields + `downloadUrl` (5-min signed GET) + `thumbUrl` if `thumb_key` present.

**GET `/attachments/:id`**
- Role: VIEWER+.
- Returns one attachment with fresh signed URLs.

**POST `/attachments/:id/download-url`** — idempotent, no side effects.
- Role: VIEWER+.
- Body: empty. (POST because it's auth-gated "mint a credential" — consistent with Phase 2 presign endpoints.)
- Returns `{ downloadUrl, thumbUrl?, expiresAt }`.

**DELETE `/attachments/:id`** — idempotent.
- Role: MEMBER+ for own; ADMIN+ for any.
- Soft-delete the row. Attempt S3 object + thumb delete inline. S3 delete failures are logged (the row stays deleted; the object becomes a zombie — acceptable for v1).
- Emits `attachment.deleted` event.
- Errors: `FORBIDDEN_ROLE` 403 when MEMBER tries to delete another user's attachment.

**POST `/attachments/:id/restore`** — idempotent.
- Role: ADMIN+ (symmetric with "delete any").
- Only works within 24h of `deleted_at`. Calls `HeadObject` to confirm the object still exists in S3.
- Emits `attachment.restored` event.
- Errors: `ATTACHMENT_NOT_RESTORABLE` 409 when window expired or S3 object gone.

### Notifications

Header `X-Household-Id` still required for consistency, but filtering is `user_id = ctx.userId` (notifications are user-scoped across households).

**GET `/notifications`**
- Query: `cursor?`, `limit?` (default 50, max 100), `unreadOnly?=false`, `category?`, `includeDeleted?=false`.
- `category` ∈ `bill | budget | transaction | transfer | household | other`. Applied as `LIKE '<category>.%'` on `type`.
- Sort: `created_at DESC, id DESC`.
- Returns `{ items: Notification[], nextCursor: string | null }`. Each `Notification` includes a derived `category` field for convenience.

**POST `/notifications/:id/mark-read`** — idempotent. 404 if the id belongs to another user. 204/200 with the updated row.

**POST `/notifications/:id/mark-unread`** — idempotent. Sets `read_at = null`.

**POST `/notifications/mark-all-read`** — idempotent.
- Body: `{ category? }`.
- Bulk update: sets `read_at = now()` on all rows where `user_id = ctx.userId AND read_at IS NULL AND deleted_at IS NULL [AND type LIKE '<category>.%']`.
- Returns `{ updatedCount }`.

**DELETE `/notifications/:id`** — idempotent. Soft-deletes; returns 204.

Existing **GET `/notifications/unread-count`** (Phase 4) stays; its query gets `AND deleted_at IS NULL` added.

### Events emitted

- `attachment.uploaded` → `{ attachmentId, ownerType, ownerId, mime, size, householdId }`
- `attachment.deleted` → `{ attachmentId, ownerType, ownerId, householdId }`
- `attachment.restored` → `{ attachmentId, householdId }`
- No events on notification reads/mark-reads (high volume, no consumers).

### Error codes introduced

| code | http | when |
|---|---|---|
| `ATTACHMENT_MIME_NOT_ALLOWED` | 422 | MIME outside allowlist |
| `ATTACHMENT_TOO_LARGE` | 422 | size exceeds cap for MIME |
| `ATTACHMENT_OWNER_NOT_FOUND` | 404 | ownerType+ownerId does not resolve in this household |
| `ATTACHMENT_FINALIZE_FAILED` | 409 | `HeadObject` fails at finalize |
| `ATTACHMENT_SIZE_MISMATCH` | 409 | S3-reported size ≠ declared size |
| `ATTACHMENT_ALREADY_FINALIZED` | 409 | second non-idempotent finalize |
| `ATTACHMENT_NOT_RESTORABLE` | 409 | restore outside 24h window or object gone |
| `STORAGE_UNAVAILABLE` | 503 | S3/MinIO unreachable; include `Retry-After: 5` |
| `PAGE_LIMIT_EXCEEDED` | 422 | >50 attachments on one owner (shouldn't happen) |

Reused: `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `FORBIDDEN_ROLE`, `HOUSEHOLD_SCOPE_VIOLATION`.

## Storage wiring

`apps/api/src/storage/storage.module.ts` + `storage.service.ts`:

- Env: `S3_ENDPOINT` (default `http://localhost:9000`), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` (default `nayanam`), `S3_REGION` (default `us-east-1`), `S3_FORCE_PATH_STYLE` (default `true`). All already present in `.env.example` from Phase 0.
- Methods:
  - `presignPut(key, mime, size, expiresInSec = 300) → { url, requiredHeaders, expiresAt }`. Signs a PUT with `Content-Type` and `Content-Length` bound.
  - `presignGet(key, expiresInSec = 300) → { url, expiresAt }`.
  - `headObject(key) → { size, contentType, etag, lastModified }`. Throws `STORAGE_UNAVAILABLE` on network errors; returns null on 404.
  - `deleteObject(key) → void`. Idempotent; 404 ignored.
  - `putBuffer(key, buf, mime) → void`. Used for thumbnails.
- Bootstrap hook: on module init, attempt `HeadBucket` on `S3_BUCKET`; if 404 and we're in dev (`NODE_ENV !== 'production'`), `CreateBucket`. Log and continue on failure — the reaper and presign paths will surface `STORAGE_UNAVAILABLE` when actually hit.
- All methods wrap errors as `StorageUnavailableError` except permission errors which surface as 500 via the global filter (no attempt to swallow mis-configuration).

Thumbnail generation (`AttachmentsService.generateThumbnail`):

1. `getObject(key)` stream → buffer (bounded to 25 MB).
2. `sharp(buf).rotate().resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()`.
3. `storage.putBuffer(key + '.thumb.webp', thumbBuf, 'image/webp')`.
4. Extract `width/height` from `sharp.metadata()` on the original (not the resized copy).
5. Catch-all: on any failure, log at warn level and return `{ thumbKey: null, width: null, height: null }`. Finalize still succeeds.

HEIC handling: sharp requires libvips with libheif for HEIF decode. Document that in dev the thumbnail for HEIC may fail silently — the original image still uploads and is downloadable; `thumb_key` stays null. Web browsers can display HEIC in very few contexts, so the UI falls back to a generic image icon when `thumb_key` is null but `mime` is image/heic.

## UX — Web

### Attachment strip in transaction dialogs

Dialogs to modify: `AddTransactionDialog.tsx`, `EditTransactionDialog.tsx`.

Below the Note field render `<AttachmentStrip ownerType="transaction" ownerId={txnId} />`. For Add flow, the ownerId exists after the create step — two UX options:

- **Option A (chosen):** create the transaction first, THEN allow attaching. The Add dialog switches into "edit" mode after save (inline transition), revealing the strip. Keeps the backend contract simple (no orphan attachments) and matches how mobile already sequences sheets.
- Option B: upload to a temp owner and reparent on save. More complex, not used.

Strip contents:

- Tiles (max 5 per row on desktop, horizontal scroll when more).
- Each tile: 64×64 thumbnail (image) or document icon + short filename (PDF). `status='FAILED'` tiles show a red banner with Retry.
- "+ Add" tile at the end; click opens the native file picker `<input type="file" accept="image/jpeg,image/png,image/heic,image/webp,application/pdf" multiple />`.
- On files selected: for each, call `useAttachmentUpload.start(file)` which runs presign → PUT (via `fetch(uploadUrl, { method: 'PUT', body: file, headers: requiredHeaders })`) → finalize. Progress from `XMLHttpRequest` or fetch streams; fall back to an indeterminate spinner if progress not available.
- On click: open `AttachmentPreview.tsx` modal. Images rendered via `<img src={downloadUrl}>`; PDFs via `<iframe src={downloadUrl}>` or a "Open in new tab" button (default to iframe).
- On delete: confirm in a small dropdown menu (shadcn `DropdownMenu`), optimistic removal.

Empty state: no tiles; only the Add tile.

Loading: skeleton tiles while the list query is pending.

Error: per-tile red banner for `FAILED`, toast for global list fetch errors.

Copy:

- Add tile: "Attach receipt"
- Preview modal header: "Receipt"
- Delete confirm: "Remove this attachment?"

### Notification center popover

`NotificationBell.tsx` becomes a shadcn `Popover` trigger; unread dot computed from `useUnreadNotificationCount()` (Phase 4 hook).

Popover width 384px, max-height 70vh. Header row: **Notifications** title + **Mark all read** button (disabled when zero unread). Below it: `NotificationFilterChips` (All / Bills / Budgets / Transactions). Below that: scrollable `NotificationList` (infinite scroll via `useNotifications({ unreadOnly: false, category })`).

Rows:

- 48px tall; left: unread dot (6px) or transparent placeholder.
- Icon for category (lucide `Receipt` for bill, `Target` for budget, `ArrowLeftRight` for transaction/transfer, `Bell` for other).
- Title derived from `type` + `payload` (examples in §Notification type mapping).
- Time relative (`~2h ago`) computed client-side.
- Row click: mark read (optimistic) + close popover + navigate to the route from `resolveNotificationRoute`.
- Row hover reveals an overflow `•••` button → menu: Mark as read/unread, Delete.

Groups: "Today" / "Yesterday" / long-form date. Sticky group headers within the scroll area.

Empty state: centered illustration (reuse Phase 4 empty-state illustration slot; fall back to a `Bell` icon) + copy "No notifications yet — bills and budget alerts land here."

Copy and i18n keys (proposed): `notifications.title`, `notifications.markAllRead`, `notifications.filters.{all,bills,budgets,transactions}`, `notifications.empty.title`, `notifications.empty.subtitle`, `notifications.row.menu.{markRead,markUnread,delete}`, `attachments.add`, `attachments.preview.title`, `attachments.delete.confirm`.

Accessibility: popover trap focus; Esc closes; rows reachable by keyboard; `aria-live="polite"` on mark-all-read announcements; unread dot has `aria-label="Unread"`.

### Tap-through route table

| type prefix | web route | mobile route |
|---|---|---|
| `bill.due_soon`, `bill.overdue`, `bill.paid` | `/bills?highlight=<billId>` | `/bills?highlight=<billId>` |
| `budget.threshold_fired`, `budget.auto_archived` | `/settings/budgets?highlight=<budgetId>` | `/budgets?highlight=<budgetId>` |
| `transaction.*` | `/transactions?highlight=<transactionId>` | `/(tabs)/transactions?highlight=<transactionId>` |
| `transfer.*` | `/transactions?highlight=<transferId>` | `/(tabs)/transactions?highlight=<transferId>` |
| `household.*` | `/settings/household` | `/settings/household` |
| unknown | no-op (still marks read) | no-op (still marks read) |

Route helper `resolveNotificationRoute(notification) → { web: string; mobile: string }` lives in `packages/core/src/notifications/routing.ts`. Highlight query params are consumed by the target screens to scroll + flash the row; if Phase 5/6 screens don't read `highlight` yet, implementing that behavior is bundled into the frontend/mobile deliverables for Phase 8.

### Notification title mapping (client-side)

From `type` + `payload`:

- `bill.due_soon` → "Bill due soon" + `"<Bill.name> due in <n> days"`
- `bill.overdue` → "Bill overdue" + `"<Bill.name> was due <n> days ago"`
- `bill.paid` → "Bill paid" + `"<Bill.name>"`
- `budget.threshold_fired` → `"<Budget.name> at <pct>%"` + formatted `"<spent>/<limit>"` (respects `packages/core/format.money`).
- `budget.auto_archived` → `"<Budget.name> archived"` + `"Category deleted"`
- fallback → `type.replaceAll('.', ' ')` Title Case + (no secondary) — prevents UI from breaking on unknown types.

Formatting lives in `packages/core/src/notifications/format.ts` and is consumed by both web and mobile rows.

## UX — Mobile

### Attachment strip in transaction sheets

Sheets to modify: `AddTransactionSheet.tsx`, `EditTransactionSheet.tsx`.

Same create-first-then-attach sequencing as web. Tiles use `expo-image` (`cachePolicy="memory-disk"`). The "+ Add" tile opens `AttachmentPickerActionSheet` with three options:

- **Camera** → `expo-image-picker` `launchCameraAsync({ mediaTypes: Images, quality: 0.85 })`. Requires camera permission (request at action time).
- **Photo library** → `launchImageLibraryAsync({ mediaTypes: Images, allowsMultipleSelection: true, quality: 0.85 })`.
- **Files (PDF)** → `expo-document-picker` `getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: true })`.

For each selected file: read size + mime from the picker result, call `useAttachmentUpload.start(asset)` which does presign → PUT via `fetch(uploadUrl, { method: 'PUT', body: await fetch(asset.uri).then(r=>r.blob()), headers: requiredHeaders })` → finalize. Show inline per-tile progress and `Haptics.notificationAsync(Success)` on finalize. HEIC: pass through; no client-side conversion in v1.

Preview: tap an image tile → push `AttachmentPreviewScreen` (full screen `expo-image` with pinch/zoom via `react-native-reanimated` gestures already present from Phase 3? — if not, ship without zoom, document). Tap a PDF tile → `openBrowserAsync(downloadUrl)` from `expo-web-browser`.

Long-press a tile → action sheet: Delete, Cancel.

Safe areas: the action sheet respects bottom inset; preview screen hides the tab bar.

### Notification center bottom sheet

`NotificationBell.tsx` opens `NotificationCenterSheet` (`@gorhom/bottom-sheet`, snap `['50%', '92%']`, default `92%`).

Sheet:

- Handle bar.
- Header: "Notifications" + Mark all read text button.
- `NotificationFilterChips`.
- `FlatList` of `NotificationRow` with infinite scroll via `useNotifications`. Pull to refresh.
- Long-press a row: `ActionSheetIOS` on iOS / a custom RN bottom sheet on Android with Mark unread / Delete. Haptic `Medium` on trigger.
- Row tap: close sheet (`sheetRef.current?.close()`), mark read, then `router.push(resolveNotificationRoute(n).mobile)`.
- Empty state component with `Bell` icon and same copy as web.

Deep-link parity: extend `apps/mobile/src/lib/push-handlers.ts` so that taps on a `budget.*` push deep-link via the same `resolveNotificationRoute` helper (today it only handles `bill.*`). No UI change — this just fixes the gap quietly.

## Shared code (`packages/core`)

### `packages/core/src/attachments/`

`schemas.ts`:

- `AttachmentStatusEnum = z.enum(['PENDING', 'READY', 'FAILED'])`
- `AttachmentOwnerTypeEnum = z.enum(['transaction'])`
- `AttachmentMimeEnum = z.enum(['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'])`
- `AttachmentSchema` — id, householdId, ownerType, ownerId, key, mime, size (bigint serialized as string or number — use `z.number().int().nonnegative()` capped at `Number.MAX_SAFE_INTEGER` which covers our 25 MB cap easily), originalFilename, thumbKey (nullable), width/height (nullable), status, createdBy, createdAt, updatedAt, deletedAt. Plus transport-only fields `downloadUrl`, `thumbUrl`, `expiresAt` (non-persisted).
- `PresignUploadInput`, `PresignUploadResponse`, `FinalizeAttachmentResponse`, `AttachmentListResponse`, `DownloadUrlResponse`.

`hooks.ts`:

- Factory `makeAttachmentHooks(client)` returns:
  - `useAttachments({ ownerType, ownerId, includeFailed?, includeDeleted? })` — query.
  - `useAttachment(id)` — query.
  - `usePresignUpload()` — mutation.
  - `useFinalizeAttachment()` — mutation; invalidates `['attachments', ownerType, ownerId]`.
  - `useDeleteAttachment()` — mutation with optimistic removal.
  - `useRestoreAttachment()` — mutation.
  - `useRefreshDownloadUrl()` — mutation (cheap; no invalidation).

The `useAttachmentUpload()` composite hook (presign → PUT → finalize) lives in each app's `features/attachments/` because `fetch`-with-progress differs between platforms (web uses `XMLHttpRequest` for progress, RN uses `fetch` or `expo-file-system` upload with task callbacks).

### `packages/core/src/notifications/` (extensions)

`schemas.ts` (extend):

- `NotificationCategoryEnum = z.enum(['bill', 'budget', 'transaction', 'transfer', 'household', 'other'])`
- `NotificationSchema` — id, userId, householdId (nullable), type (string, open union), payload (unknown/record), readAt (nullable), createdAt, deletedAt (nullable). Derived `category` (not persisted; attached by the server response mapper or client-side via `deriveCategoryFromType`).
- `NotificationsPage = { items: Notification[]; nextCursor: string | null }`.
- Helpers: `deriveCategoryFromType(type: string): NotificationCategory`, `formatNotification(notification): { title, subtitle }` in `format.ts`.

`routing.ts`:

- `resolveNotificationRoute(n): { web: string; mobile: string }` — switch by `category` + known subtype; respects the tap-through table above. Returns `{ web: '#', mobile: '' }` for unknown (the UI then treats as no-op).

`hooks.ts` (extend the existing `makeNotificationHooks` factory):

- `useNotifications({ unreadOnly?, category? })` — infinite query, `useInfiniteQuery`, queryKey `['notifications', { unreadOnly, category }]`.
- `useNotification(id)` — query.
- `useMarkNotificationRead()` — mutation; optimistic; invalidates `['notifications']` + `['notifications', 'unread-count']`.
- `useMarkNotificationUnread()` — mutation; optimistic.
- `useMarkAllNotificationsRead()` — mutation; optimistic (set `read_at` to now on every loaded row matching filter); invalidates broadly.
- `useDeleteNotification()` — mutation; optimistic.

All attachment and notification hooks follow the "id in variables" pattern used elsewhere in `packages/core`.

`packages/core/package.json`: add `./attachments` subpath export. `notifications` subpath already exists from Phase 4. Re-export both from `src/index.ts`.

Client methods added to `packages/core/src/api/client.ts`:

- Attachments: `presignUploadAttachment`, `finalizeAttachment`, `listAttachments`, `getAttachment`, `refreshAttachmentDownloadUrl`, `deleteAttachment`, `restoreAttachment`.
- Notifications: `listNotifications`, `getNotification`, `markNotificationRead`, `markNotificationUnread`, `markAllNotificationsRead`, `deleteNotification`.

## Role matrix

### Attachments

| endpoint | VIEWER | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|
| list / get / download-url | yes | yes | yes | yes |
| presign-upload / finalize | no | yes | yes | yes |
| delete (own) | no | yes | yes | yes |
| delete (any) | no | no | yes | yes |
| restore | no | no | yes | yes |

### Notifications

User-scoped. Every authenticated user manages their own notifications. Role-agnostic. Even a VIEWER can mark-read and delete notifications addressed to them.

## Edge cases

**Attachments:**

- Upload succeeds but finalize fails (`HeadObject` says object missing — e.g. dev restarted MinIO). Row set to `FAILED`, UI shows failed tile with Retry button that re-calls finalize; if still failing after 3 attempts, offer "Remove" which calls DELETE.
- Orphan `PENDING` rows from abandoned uploads — daily reaper marks > 24h as `FAILED`, attempts S3 delete.
- Transaction soft-deleted while it has attachments — attachments remain queryable but hidden from the transaction's strip by default (the strip filters `deleted_at IS NULL` on both sides implicitly via the default service behavior).
- Transaction hard-deleted (zero-history row permitted by Phase 3) — cascade: attachments service exposes `cascadeForOwner(ownerType, ownerId)` called from transactions service; soft-deletes attachment rows and deletes S3 objects.
- Multiple users in same household uploading to same transaction — each upload is an independent row; the list is sorted by `created_at`; concurrency is safe because the key has a ULID component per attachment.
- Idempotent retry of presign-upload — the interceptor returns the cached response (same attachment_id and upload URL) for 24h; the upload URL's 5-min expiry is the real bound. If caller retries after 5 min the URL is expired and the second PUT will 403; the client should not retry presign with the same key — it should request a fresh one. Document.
- Idempotent retry of finalize on a `READY` row — if Idempotency-Key matches the original call, returns the cached response; else 409 `ATTACHMENT_ALREADY_FINALIZED`.
- Two uploads for the same transaction in parallel — both succeed; both rows appear in the list. No races.
- MinIO down at presign time — 503 `STORAGE_UNAVAILABLE`; UI shows toast "Storage unavailable — try again in a moment."
- Very small images (<256px) — sharp's `withoutEnlargement:true` keeps original dims; WebP thumb is effectively the original size.
- HEIC on the web — Safari may allow, Chrome may not; we accept the upload either way. Thumbnail generation fails silently; UI shows a generic image icon when `thumbUrl` is null.
- PDF that's actually `application/octet-stream` despite the `.pdf` extension — MIME allowlist is strict against the `mime` sent by the client; bytes aren't re-sniffed. Accept server input at face value for v1; document as a future hardening.
- User on VIEWER role tries to delete — 403 `FORBIDDEN_ROLE`.
- Restore outside 24h — 409 `ATTACHMENT_NOT_RESTORABLE`.
- Multi-currency transaction soft-delete interplay — no special case; attachments don't involve money.

**Notifications:**

- User in multiple households — list shows notifications from all households (user-scoped). Filter chips are type-based, not household-based. Document.
- Mark-all-read while new notifications arrive — the bulk UPDATE bounds itself by "currently unread at SQL statement time." Items that arrive mid-flight stay unread.
- Soft-deleted notification still referenced by a push payload — the in-app tap path fetches by id and 404s → UI toasts "This notification is no longer available."
- Unknown `type` — client renders with generic icon and "Activity" label; tap marks read, no navigation.
- Deleting the last unread notification — unread count endpoint must refetch; mutation invalidates its query key.
- Polling cadence — Phase 4's 60s poll continues; the center's own list uses TanStack Query's standard `refetchOnMount` and `refetchOnWindowFocus` (web). Mobile refetches on sheet open and on pull.
- Time zones — "Today" / "Yesterday" grouping uses the device's local time zone. Document.
- Empty and near-empty households — the empty state renders reliably.
- Rate abuse — mark-all-read is idempotent and cheap; rely on existing `@nestjs/throttler` per-user limits. No special throttler.
- Role interaction — all roles see their own notifications only; there's no cross-user notification leakage since `user_id = ctx.userId` is enforced.

## Acceptance criteria

**Attachments:**

1. `POST /attachments/presign-upload` for a MEMBER with a valid `transaction` owner returns a signed URL and inserts a row with `status='PENDING'`.
2. Declaring `mime: 'application/zip'` returns `ATTACHMENT_MIME_NOT_ALLOWED` 422 without creating a row.
3. Declaring `size: 20_000_000` with `mime: 'image/jpeg'` returns `ATTACHMENT_TOO_LARGE` 422.
4. After PUT + `POST /attachments/:id/finalize`, the row moves to `status='READY'`, `thumb_key` is populated for images, and the response includes a fresh `downloadUrl`.
5. Finalize when the S3 object is missing returns `ATTACHMENT_FINALIZE_FAILED` 409 and row status is `FAILED`.
6. `GET /attachments?ownerType=transaction&ownerId=<id>` returns only `READY` rows by default, with signed URLs that are valid.
7. A MEMBER deleting another MEMBER's attachment returns `FORBIDDEN_ROLE` 403.
8. An ADMIN deleting any attachment succeeds and the S3 object disappears.
9. `POST /attachments/:id/restore` within 24h re-materializes the row; after 24h returns `ATTACHMENT_NOT_RESTORABLE` 409.
10. A VIEWER cannot call `presign-upload` (returns 403).
11. The daily reaper marks a > 24h `PENDING` row as `FAILED`.
12. Web: attaching a JPEG from the Add-Transaction dialog uploads and renders a 64×64 thumb in ≤ 5 seconds on a 10 Mbps connection. Clicking the thumb opens the full-res preview.
13. Mobile: using Camera to capture a receipt completes the full flow and shows a thumb tile. Haptic success fires on finalize.
14. Mobile: picking a PDF from Files uploads and the tile opens `expo-web-browser` on tap.

**Notifications:**

15. `GET /notifications?unreadOnly=true&category=bill` returns only the current user's unread bill notifications, sorted DESC by `created_at`, with `nextCursor` behaving correctly across pages of size 50.
16. `POST /notifications/:id/mark-read` sets `read_at` and is a no-op on retry (idempotent).
17. `POST /notifications/mark-all-read` with `{ category: 'budget' }` only marks budget notifications as read and returns `updatedCount`.
18. `DELETE /notifications/:id` soft-deletes (row persists with `deleted_at`); list no longer returns it.
19. `GET /notifications/unread-count` returns a count that excludes soft-deleted rows.
20. Web: tapping the bell opens the popover; tapping a `bill.due_soon` row closes the popover and navigates to `/bills?highlight=<id>` with that bill visibly flashed on arrival.
21. Web: "Mark all read" disables until new unread arrives; unread dot disappears optimistically.
22. Mobile: long-pressing a row surfaces Mark unread / Delete; tapping Delete soft-deletes with a haptic.
23. Mobile: tapping a `budget.threshold_fired` row navigates to `/budgets?highlight=<id>` and the sheet closes.
24. Brand-new household empty state renders on both surfaces with the documented copy.

## Open questions

1. **Highlight behavior on target screens.** Phase 5 (bills) and Phase 6 (budgets) did not ship `?highlight=<id>` query-param handlers. Phase 8 requires them. Question: does the Phase 8 frontend/mobile teammate own adding the highlight behavior to Bills + Budgets screens, or is that a separate follow-up? **Assumed YES — Phase 8 owns it**, because without it tap-through is hollow. Flag for lead confirmation.
2. **Thumbnail generation in-process vs queue.** Spec says inline (200–500ms on a 10 MB JPEG). For a 25 MB burst from a slow mobile uplink on a small server, this could block the finalize request noticeably. **Assumed: inline is fine for v1**; if this becomes a pain we'll move to BullMQ. Flag if the lead wants a queue up front.
3. **HEIC thumbnail support.** Depends on libvips build flags in the deployment image. **Assumed: accept HEIC, best-effort thumb, null on failure**. Flag if the lead wants HEIC thumbnails to be a hard requirement (would force a specific base image).
4. **Cross-household notification view.** User-scoped notifications show items from every household the user belongs to. Is that the right UX, or should the center filter to the currently active household? **Assumed: show all, matching mail-inbox intuition.** Flag.
5. **24-hour attachment restore window vs permanent soft-delete.** Other soft-delete surfaces in Nayanam don't time-bound restore. Attachments bound it because we need to GC the S3 object eventually. **Assumed 24h window**. Flag if the lead wants the restore window aligned with transaction restore (currently unbounded).

## Rollout

- **Migrations (ordered):**
  1. `20260424-008-phase-8-attachments.yaml` — create `attachments` table + indexes + CHECK.
  2. `20260424-008-phase-8-notifications-deleted-at.yaml` — add `deleted_at` + partial indexes; drop Phase 4's non-partial `(user_id, read_at)` index.
- **Feature flag:** none. Phase 8 is backwards-compatible (the attachments strip renders empty for histories without attachments; the notification center works on the existing Phase 4 schema with the Phase 8 `deleted_at` column).
- **Backwards compatibility:** the Phase 4 unread-count query gains `AND deleted_at IS NULL`. Existing rows (no `deleted_at`) match. No behavior change for existing clients.
- **Dev bucket bootstrap:** `StorageService.onModuleInit` creates the MinIO bucket if missing in non-production — dev ergonomics only.
- **Env vars added:** none beyond the Phase 0 `S3_*` set. Document `S3_*` already covers MinIO.
- **Scheduled jobs:** 1 new (`AttachmentReaperService`, daily 02:00, advisory lock `0xA77AC41`).
- **Events:** `attachment.uploaded`, `attachment.deleted`, `attachment.restored`.
- **Analytics:** none in v1.
- **Seed:** none. Phase 8 does not ship seed attachments or seed notifications.
- **Deps installation:** the user runs `pnpm install` after API + mobile `package.json` are updated with `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `sharp`, `expo-image-picker`, `expo-document-picker`, `expo-image`, `expo-web-browser`. Teammates must not run installs.
