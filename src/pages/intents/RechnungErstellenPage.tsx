/**
 * Rechnung erstellen — 3-Schritt-Wizard.
 * Steps: 1) Projekt wählen → 2) Zeiten prüfen (offene verrechenbare Zeiteinträge, Beträge ableiten) → 3) Rechnung prüfen & anlegen.
 * Reads: projekte (in_bearbeitung), zeiterfassung (Projekt + verrechenbar), berater/innen + leistungskatalog (Sätze), rechnungen (Nummernvorschlag).
 * Writes: rechnungen (create) + je Zeiteintrag ein Update auf zeiterfassung (verrechenbar = false → gilt als abgerechnet).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useEffect, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { IconClock } from '@tabler/icons-react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  useStepForm, useJourneySubmit, useRecordSearch, combineFilters, refFilter, todayIso,
  fieldText, fieldLookup, fieldNumber, fieldDate, fieldRef, optionsOf, displayNameOf,
} from '@/lib/journey';
import type { JourneyRecord } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

const eur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const hours = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('de-DE')}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const dmy = (iso: string | null) => (iso ? format(parseISO(iso), 'dd.MM.yyyy') : '–');

interface Entry {
  id: string;
  datum: string | null;
  stunden: number;
  beschreibung: string;
  beraterId: string | null;
  beraterName: string;
  rate: number | null;
}

export default function RechnungErstellenPage() {
  const [step, setStep] = useState(1);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [manualRates, setManualRates] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<Record<string, JourneyRecord | null>>({});
  const [projektId, setProjektId] = useState<string | null>(null);

  const projekte = useRecordSearch(servicePort, 'projekte', {
    filter: "r.v_status == 'in_bearbeitung'",
    where: p => fieldLookup(p, 'status')?.key === 'in_bearbeitung',
    searchFields: ['projektkennung'],
    toItem: (p, ctx) => ({
      id: p.id,
      title: fieldText(p, 'projektkennung'),
      subtitle: ctx.ref('kunde'),
      status: fieldLookup(p, 'status') ?? undefined,
    }),
  });

  const zeit = useRecordSearch(servicePort, 'zeiterfassung', {
    filter: projektId ? combineFilters(refFilter('projekt', projektId), tx('r.v_verrechenbar == True')) : undefined,
    where: z => Boolean(projektId) && fieldRef(z, 'projekt') === projektId && z.fields.verrechenbar === true,
    searchFields: [],
  });

  const rechnungen = useRecordSearch(servicePort, 'rechnungen', { searchFields: ['rechnungsnummer'] });

  const f = useStepForm('rechnungen', {
    fields: [
      'projekt', 'kunde', 'berater', 'abrechnungsmonat', 'abrechnungsjahr', 'mehrwertsteuer',
      'rechnungsnummer', 'rechnungsdatum', 'faelligkeitsdatum', 'rechnungsstatus', 'notizen',
    ],
    steps: {
      projekt: 1, kunde: 1, berater: 2, abrechnungsmonat: 2, abrechnungsjahr: 2, mehrwertsteuer: 2,
      rechnungsnummer: 3, rechnungsdatum: 3, faelligkeitsdatum: 3, rechnungsstatus: 3, notizen: 3,
    },
    initial: {
      mehrwertsteuer: 19,
      rechnungsdatum: todayIso(),
      faelligkeitsdatum: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      rechnungsstatus: 'offen',
    },
  });

  // Referenced berater / leistungen (rates) — fetched once per id.
  const refKeys: string[] = [];
  for (const z of zeit.records) {
    const b = fieldRef(z, 'berater');
    const l = fieldRef(z, 'leistung');
    if (b) refKeys.push(`berater/innen:${b}`);
    if (l) refKeys.push(`leistungskatalog:${l}`);
  }
  const refSig = Array.from(new Set(refKeys)).sort().join('|');
  useEffect(() => {
    const missing = refSig.split('|').filter(k => k && !(k in refs));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map(async k => {
      const [entity, id] = k.split(':') as ['berater/innen' | 'leistungskatalog', string];
      const rec = await servicePort.get(entity, id).catch(() => null);
      return [k, rec] as const;
    })).then(pairs => {
      if (cancelled) return;
      setRefs(prev => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
  }, [refSig, refs]);

  const refsPending = refSig.split('|').some(k => k && !(k in refs));

  const entries: Entry[] = zeit.records.map(z => {
    const bId = fieldRef(z, 'berater');
    const lId = fieldRef(z, 'leistung');
    const bRec = bId ? refs[`berater/innen:${bId}`] : null;
    const lRec = lId ? refs[`leistungskatalog:${lId}`] : null;
    const leistungRate = lRec ? fieldNumber(lRec, 'stundensatz_leistung') : null;
    const beraterRate = bRec ? fieldNumber(bRec, 'stundensatz') : null;
    const manual = Number(manualRates[z.id]?.replace(',', '.'));
    const rate = leistungRate ?? beraterRate ?? (manualRates[z.id] && Number.isFinite(manual) ? manual : null);
    return {
      id: z.id,
      datum: fieldDate(z, 'datum'),
      stunden: fieldNumber(z, 'stunden') ?? 0,
      beschreibung: fieldText(z, 'taetigkeitsbeschreibung'),
      beraterId: bId,
      beraterName: bRec ? displayNameOf('berater/innen', bRec.fields) : '',
      rate,
    };
  }).sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''));

  const included = entries.filter(e => !excluded.includes(e.id));
  const withoutRate = included.filter(e => e.rate === null);
  const totalHours = included.reduce((s, e) => s + e.stunden, 0);
  const netto = round2(included.reduce((s, e) => s + e.stunden * (e.rate ?? 0), 0));
  const mwstRaw = Number(f.get('mehrwertsteuer'));
  const mwst = Number.isFinite(mwstRaw) ? mwstRaw : 0;
  const gesamt = round2(netto + netto * mwst / 100);
  const leistungspositionen = included
    .map(e => tx`${dmy(e.datum)} · ${e.beschreibung || '–'} · ${hours(e.stunden)} Std. · ${eur(round2(e.stunden * (e.rate ?? 0)))}`)
    .join('\n');
  const includedSig = included.map(e => e.id).join(',');
  const beraterIds = Array.from(new Set(included.map(e => e.beraterId).filter((x): x is string => Boolean(x))));

  // Berater, Monat und Jahr leiten sich aus den gewählten Einträgen ab (danach editierbar).
  useEffect(() => {
    if (!includedSig) return;
    const latest = included.map(e => e.datum).filter((d): d is string => Boolean(d)).sort().pop();
    if (latest) {
      const monat = optionsOf('rechnungen', 'abrechnungsmonat')[Number(latest.slice(5, 7)) - 1]?.key;
      if (monat) f.set('abrechnungsmonat', monat);
      f.set('abrechnungsjahr', latest.slice(0, 4));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includedSig]);

  const beraterSig = beraterIds.join(',');
  useEffect(() => {
    for (const e of included) if (e.beraterId && e.beraterName) f.remember(e.beraterId, e.beraterName);
    f.set('berater', beraterIds, included.map(e => e.beraterName).filter(Boolean).join(', ') || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beraterSig, refSig, refsPending]);

  // Rechnungsnummer-Vorschlag aus den vorhandenen Rechnungen.
  const nummer = String(f.get('rechnungsnummer') ?? '');
  const nummernLoading = rechnungen.select.loading;
  useEffect(() => {
    if (nummernLoading || nummer) return;
    const year = format(new Date(), 'yyyy');
    const prefix = `RE-${year}-`;
    let max = 0;
    let any = false;
    for (const r of rechnungen.records) {
      const n = fieldText(r, 'rechnungsnummer');
      if (!n.startsWith(prefix)) continue;
      const m = /(\d+)\s*$/.exec(n);
      if (m) { any = true; max = Math.max(max, Number(m[1])); }
    }
    const next = any ? max + 1 : rechnungen.records.length + 1;
    f.set('rechnungsnummer', `${prefix}${String(next).padStart(3, '0')}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nummernLoading, nummer, rechnungen.records.length]);

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'rechnung', entity: 'rechnungen', form: f, primary: true,
      values: () => ({ nettobetrag: netto, gesamtbetrag: gesamt, leistungspositionen }),
    },
    ...included.map(e => ({
      key: `zeit-${e.id}`, entity: 'zeiterfassung' as const, updates: e.id,
      values: { verrechenbar: false }, needs: ['rechnung'],
      label: tx`Zeiteintrag ${dmy(e.datum)} als abgerechnet markieren`,
    })),
  ], { draftKey: 'rechnung-erstellen' });

  const pickProjekt = (id: string) => {
    const rec = projekte.recordOf(id);
    const kundeId = rec ? fieldRef(rec, 'kunde') : null;
    f.set('projekt', id, projekte.labelOf(id));
    if (rec && kundeId) f.set('kunde', kundeId, projekte.refLabel(rec, 'kunde'));
    setProjektId(id);
    setExcluded([]);
    setManualRates({});
    setStep(2);
  };

  const restart = () => {
    submit.reset();
    f.reset();
    setProjektId(null);
    setExcluded([]);
    setManualRates({});
    setStep(1);
  };

  const checkZeiten = () => {
    if (included.length === 0) return tx('Wähle mindestens einen Zeiteintrag aus.');
    if (refsPending) return tx('Die Sätze werden noch geladen …');
    if (withoutRate.length > 0) return tx('Trage für alle Einträge ohne Satz einen Stundensatz ein.');
    return f.validate(['abrechnungsmonat', 'abrechnungsjahr', 'mehrwertsteuer']);
  };

  return (
    <IntentWizardShell
      title={tx('Rechnung erstellen')}
      subtitle={tx('Aus den noch nicht abgerechneten Zeiten eines Projekts eine Rechnung erzeugen')}
      currentStep={step} onStepChange={setStep}
      forms={[f]} draftKey="rechnung-erstellen"
      intro={{ description: tx('Rechnung aus offenen Zeiteinträgen eines Projekts erzeugen.'), needs: [tx('Projekt in Bearbeitung'), tx('Erfasste, verrechenbare Zeiten')] }}
    >
      <WizardStep label={tx('Projekt')} description={tx('Für welches Projekt soll abgerechnet werden?')}>
        <EntitySelectStep {...projekte.select} selectedId={projektId} onSelect={pickProjekt}
          searchPlaceholder={tx('Projektkennung suchen …')}
          emptyText={tx('Kein Projekt in Bearbeitung gefunden.')} />
      </WizardStep>

      <WizardStep label={tx('Zeiten')} description={tx('Offene Zeiteinträge prüfen — nicht passende einfach abwählen.')} needs={['projekt']}>
        <div className="space-y-4">
          {zeit.select.loading || refsPending ? (
            <p className="text-sm text-muted-foreground">{tx('Zeiten werden geladen …')}</p>
          ) : entries.length === 0 ? (
            <div className="rounded-2xl border bg-card p-6 text-center space-y-1">
              <IconClock size={32} className="mx-auto text-muted-foreground" stroke={1.5} />
              <p className="text-sm font-medium">{tx('Für dieses Projekt gibt es keine offenen Zeiten.')}</p>
              <p className="text-sm text-muted-foreground">{tx('Ohne offene Zeiteinträge ist keine Rechnung möglich — wähle ein anderes Projekt.')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tx('Anderes Projekt wählen')}</Button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border bg-card divide-y">
                {entries.map(e => {
                  const checked = !excluded.includes(e.id);
                  return (
                    <div key={e.id} className="flex items-start gap-3 p-3">
                      <Checkbox
                        id={`ze-${e.id}`}
                        checked={checked}
                        onCheckedChange={v => setExcluded(prev => v === true ? prev.filter(x => x !== e.id) : [...prev, e.id])}
                        className="mt-1"
                      />
                      <label htmlFor={`ze-${e.id}`} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{dmy(e.datum)} · {hours(e.stunden)} {tx('Std.')}</span>
                          <span className="font-semibold shrink-0">
                            {e.rate !== null ? eur(round2(e.stunden * e.rate)) : tx('ohne Satz')}
                          </span>
                        </div>
                        {e.beschreibung && <p className="text-xs text-muted-foreground">{e.beschreibung}</p>}
                        <p className="text-xs text-muted-foreground">
                          {[e.beraterName, e.rate !== null ? `${eur(e.rate)}/${tx('Std.')}` : ''].filter(Boolean).join(' · ')}
                        </p>
                      </label>
                      {checked && e.rate === null && (
                        <Input
                          inputMode="decimal"
                          className="w-28"
                          aria-label={tx('Stundensatz (€/Std.)')}
                          placeholder={tx('€/Std.')}
                          value={manualRates[e.id] ?? ''}
                          onChange={ev => setManualRates(prev => ({ ...prev, [e.id]: ev.target.value }))}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border bg-secondary/40 p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>{tx('Stunden gesamt')}</span><span className="font-semibold">{hours(totalHours)}</span></div>
                <div className="flex justify-between"><span>{tx('Nettobetrag')}</span><span className="font-semibold">{eur(netto)}</span></div>
                <div className="flex justify-between"><span>{tx`inkl. ${mwst} % MwSt.`}</span><span className="font-semibold">{eur(gesamt)}</span></div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Bound form={f} name="mehrwertsteuer" hint={tx('In Prozent, Standard 19')} />
            <Bound form={f} name="abrechnungsjahr" />
          </div>
          <Bound form={f} name="abrechnungsmonat" />
          <StepNav onBack={() => setStep(1)} onNext={checkZeiten} nextStepLabel={tx('Rechnung prüfen')}
            nextDisabled={entries.length === 0} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Rechnung')} description={tx('Nummer, Datum und Status der Rechnung festlegen.')} needs={['projekt']}>
        <div className="space-y-4">
          <Bound form={f} name="rechnungsnummer" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Bound form={f} name="rechnungsdatum" />
            <Bound form={f} name="faelligkeitsdatum" />
          </div>
          <Bound form={f} name="rechnungsstatus" />
          <Bound form={f} name="notizen" rows={3} />
          <StepNav onBack={() => setStep(2)}
            onNext={() => f.validate(['rechnungsnummer', 'rechnungsdatum', 'faelligkeitsdatum', 'rechnungsstatus', 'notizen'])}
            nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep forms={[f]} submit={submit}
            items={[
              { key: 'zeiten', label: tx('Zeiteinträge'), value: String(included.length) },
              { key: 'stunden', label: tx('Stunden gesamt'), value: hours(totalHours) },
              { key: 'netto', label: tx('Nettobetrag'), value: eur(netto) },
              { key: 'gesamt', label: tx('Gesamtbetrag'), value: eur(gesamt) },
            ]}
            whatHappensNext={tx('Die Rechnung wird angelegt und alle enthaltenen Zeiteinträge werden als abgerechnet markiert — sie erscheinen auf keiner weiteren Rechnung.')} />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep result={submit.result}
          facts={[
            { label: tx('Rechnungsnummer'), value: nummer },
            { label: tx('Stunden gesamt'), value: hours(totalHours) },
            { label: tx('Gesamtbetrag'), value: eur(gesamt) },
          ]}
          next={[
            { label: tx('Neue Rechnung'), onClick: restart },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Die abgerechneten Zeiteinträge sind als nicht mehr verrechenbar markiert.')} />
      )}
    </IntentWizardShell>
  );
}
