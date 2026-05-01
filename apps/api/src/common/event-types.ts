/**
 * Re-exports the canonical EventType registry from packages/core.
 *
 * API services import from here (not directly from @nayanam/core) so that the
 * NestJS CJS build does not trip over the ESM package boundary.
 *
 * TODO: Add per-event-type Zod payload schemas for compile-time validation.
 * Currently payloads are untyped JSON.
 */

export const EventType = {
  // Household lifecycle
  HOUSEHOLD_CREATED: 'household.created',
  HOUSEHOLD_UPDATED: 'household.updated',
  HOUSEHOLD_DELETED: 'household.deleted',
  // Household member management
  MEMBER_LEFT: 'household.member_left',
  MEMBER_REMOVED: 'household.member_removed',
  MEMBER_ROLE_CHANGED: 'household.member_role_changed',
  INVITE_CREATED: 'household.invite_created',
  INVITE_ACCEPTED: 'household.invite_accepted',
  INVITE_REVOKED: 'household.invite_revoked',
  // Avatar
  HOUSEHOLD_AVATAR_CHANGED: 'household.avatar_changed',

  // User (cross-household; householdId resolved to first membership)
  USER_PROFILE_UPDATED: 'user.profile_updated',
  USER_PRIMARY_CURRENCY_CHANGED: 'user.primary_currency_changed',
  USER_EMAIL_CHANGED: 'user.email_changed',
  USER_EMAIL_CHANGE_REQUESTED: 'user.email_change_requested',
  USER_SECURITY_UPDATED: 'user.security_updated',
  USER_SESSION_REVOKED: 'user.session_revoked',
  USER_ALL_SESSIONS_REVOKED: 'user.all_sessions_revoked',
  USER_NOTIFICATION_PREFERENCES_UPDATED: 'user.notification_preferences_updated',
  USER_WEEKLY_SUMMARY_SENT: 'user.weekly_summary_sent',
  USER_AVATAR_CHANGED: 'user.avatar_changed',

  // Accounts
  ACCOUNT_CREATED: 'account.created',
  ACCOUNT_UPDATED: 'account.updated',
  ACCOUNT_ARCHIVED: 'account.archived',
  ACCOUNT_RESTORED: 'account.restored',
  ACCOUNT_DELETED: 'account.deleted',
  ACCOUNT_REORDERED: 'account.reordered',

  // Categories
  CATEGORY_CREATED: 'category.created',
  CATEGORY_UPDATED: 'category.updated',
  CATEGORY_ARCHIVED: 'category.archived',
  CATEGORY_RESTORED: 'category.restored',
  CATEGORY_DELETED: 'category.deleted',
  CATEGORY_REORDERED: 'category.reordered',

  // Transactions
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_UPDATED: 'transaction.updated',
  TRANSACTION_DELETED: 'transaction.deleted',
  TRANSACTION_RESTORED: 'transaction.restored',

  // Transfers
  TRANSFER_CREATED: 'transfer.created',
  TRANSFER_DELETED: 'transfer.deleted',
  TRANSFER_RESTORED: 'transfer.restored',

  // Bills
  BILL_CREATED: 'bill.created',
  BILL_UPDATED: 'bill.updated',
  BILL_ARCHIVED: 'bill.archived',
  BILL_DELETED: 'bill.deleted',
  BILL_RESTORED: 'bill.restored',
  BILL_PAUSED: 'bill.paused',
  BILL_RESUMED: 'bill.resumed',
  BILL_ENDED: 'bill.ended',
  BILL_AUTO_PAUSED: 'bill.auto_paused',
  BILL_PAID: 'bill.paid',
  BILL_PAYMENT_UNDONE: 'bill.payment_undone',
  BILL_AUTO_LOGGED: 'bill.auto_logged',
  BILL_DUE_SOON: 'bill.due_soon',
  BILL_OVERDUE: 'bill.overdue',
  BILL_REORDERED: 'bill.reordered',

  // Budgets
  BUDGET_CREATED: 'budget.created',
  BUDGET_UPDATED: 'budget.updated',
  BUDGET_ARCHIVED: 'budget.archived',
  BUDGET_RESTORED: 'budget.restored',
  BUDGET_DELETED: 'budget.deleted',
  BUDGET_PAUSED: 'budget.paused',
  BUDGET_RESUMED: 'budget.resumed',
  BUDGET_AUTO_ARCHIVED: 'budget.auto_archived',
  BUDGET_THRESHOLD_FIRED: 'budget.threshold_fired',
  BUDGET_REORDERED: 'budget.reordered',

  // Attachments
  ATTACHMENT_UPLOADED: 'attachment.uploaded',
  ATTACHMENT_DELETED: 'attachment.deleted',
  ATTACHMENT_RESTORED: 'attachment.restored',

  // Loans
  LOAN_CREATED: 'loan.created',
  LOAN_UPDATED: 'loan.updated',
  LOAN_ARCHIVED: 'loan.archived',
  LOAN_RESTORED: 'loan.restored',
  LOAN_DELETED: 'loan.deleted',
  LOAN_REORDERED: 'loan.reordered',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];
