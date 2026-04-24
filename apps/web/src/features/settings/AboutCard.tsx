// Help / Contact / Terms / Privacy external links + app version.

import { useMetaLinks } from '../../lib/hooks';
import { SectionGroup, SettingsRow } from './primitives';

export function AboutCard() {
  const links = useMetaLinks();
  const d = links.data;

  return (
    <>
      <SectionGroup title="About">
        {d?.helpUrl ? (
          <SettingsRow
            label="Help center"
            onClick={() => window.open(d.helpUrl!, '_blank', 'noopener')}
          />
        ) : null}
        {d?.contactUrl ? (
          <SettingsRow
            label="Contact us"
            onClick={() => window.open(d.contactUrl!, '_blank', 'noopener')}
          />
        ) : null}
        {d?.termsUrl ? (
          <SettingsRow
            label="Terms & privacy"
            onClick={() => window.open(d.termsUrl!, '_blank', 'noopener')}
          />
        ) : null}
        {d?.privacyUrl ? (
          <SettingsRow
            label="Privacy policy"
            onClick={() => window.open(d.privacyUrl!, '_blank', 'noopener')}
          />
        ) : null}
        {!d ? (
          <div className="px-4 py-4 text-center text-xs text-[var(--color-text-dim)]">
            Loading…
          </div>
        ) : null}
      </SectionGroup>
      {d ? (
        <div className="text-center font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
          Nayanam · v{d.appVersion} · api {d.apiVersion}
        </div>
      ) : null}
    </>
  );
}
