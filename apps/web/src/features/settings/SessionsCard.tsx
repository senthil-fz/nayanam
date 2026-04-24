// Active sessions list. Per-row revoke button + "Revoke all other sessions"
// header action. Current session is labelled and cannot be self-revoked
// (backend returns SESSION_CURRENT_CANNOT_REVOKE).

import type { ApiSchemas } from '@nayanam/contracts';
import { SectionGroup, relativeTime } from './primitives';
import {
  useMeSessions,
  useRevokeAllOtherSessions,
  useRevokeMeSession,
} from '../../lib/hooks';
import { useToast } from '../../components/Toast';

type MeSession = ApiSchemas['MeSession'];

export function SessionsCard() {
  const sessions = useMeSessions();
  const revoke = useRevokeMeSession();
  const revokeAll = useRevokeAllOtherSessions();
  const toast = useToast();

  const onRevoke = async (sessionId: string) => {
    try {
      await revoke.mutateAsync({ sessionId });
      toast.show('Session revoked');
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not revoke',
        { tone: 'negative' },
      );
    }
  };

  const onRevokeAll = async () => {
    try {
      const res = await revokeAll.mutateAsync({});
      toast.show(`Revoked ${res.revokedCount} session(s)`);
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not revoke sessions',
        { tone: 'negative' },
      );
    }
  };

  const items = sessions.data ?? [];
  const othersCount = items.filter((s) => !s.isCurrent).length;

  return (
    <SectionGroup title="Active sessions">
      {sessions.isLoading ? (
        <div className="px-4 py-6 text-center text-xs text-[var(--color-text-dim)]">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[var(--color-text-dim)]">
          No active sessions
        </div>
      ) : (
        items.map((s: MeSession) => (
          <SessionRow
            key={s.id}
            session={s}
            onRevoke={() => void onRevoke(s.id)}
            busy={revoke.isPending}
          />
        ))
      )}
      {othersCount > 0 ? (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <button
            type="button"
            onClick={() => void onRevokeAll()}
            disabled={revokeAll.isPending}
            className="text-xs font-semibold text-[var(--color-negative)] disabled:opacity-60"
          >
            {revokeAll.isPending
              ? 'Revoking…'
              : `Revoke all other sessions (${othersCount})`}
          </button>
        </div>
      ) : null}
    </SectionGroup>
  );
}

function SessionRow({
  session,
  onRevoke,
  busy,
}: {
  session: MeSession;
  onRevoke: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--color-text)]">
          {session.deviceName ?? `${session.deviceKind} device`}
          {session.isCurrent ? (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
              this device
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs text-[var(--color-text-dim)]">
          Last seen {relativeTime(session.lastSeenAt)}
        </div>
      </div>
      {session.isCurrent ? null : (
        <button
          type="button"
          onClick={onRevoke}
          disabled={busy}
          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-negative)] disabled:opacity-60"
        >
          Revoke
        </button>
      )}
    </div>
  );
}
