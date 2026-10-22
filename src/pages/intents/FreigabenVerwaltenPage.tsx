/**
 * Freigaben verwalten — 4-Schritt-Wizard für Freigabe-Entscheidungen.
 * Steps: 1) Wer bist du? (Berater/in wählen) → 2) Zugewiesene Freigaben (Angebote + Rechnungen, ausstehend) →
 *        3) Einzeln durchgehen (freigeben / ablehnen / überspringen) → 4) Prüfen & speichern.
 * Reads: berater/innen (useRecordSearch), angebote, rechnungen, kunden, projekte (servicePort).
 * Writes: angebote, rechnungen (je ein Update pro entschiedenem Datensatz: freigabestatus, freigabedatum, freigabekommentar).
 * Composes: IntentWizardShell, EntitySelectStep, Field, ChoiceGroup, StepNav, SummaryStep, SuccessStep.
 */
import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/DatePicker';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup, fieldNumber, fieldDate, fieldRef,
  refFilter, combineFilters, todayIso, labelOf,
} from '@/lib/journey';
import type { JourneyRecord, PlanStep, SummaryItem } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

type Kind = 'angebote' | 'rechnungen';
type Verdict = 'freigegeben' | 'abgelehnt';

interface Pending {
  key: string;
  kind: Kind;
  id: string;
  nummer: string;
  kunde: string;
  projekt: string;
  betrag: number | null;
  datum: string | null;
  rec: JourneyRecord;
}

interface Decision {
  status: Verdict | 'skipped';
  datum: string;
  kommentar: string;
}

const DRAFT_KEY = 'freigaben-verwalten';
const VERDICTS: string[] = ['freigegeben', 'abgelehnt'];

const eur = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const day = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try { return format(parseISO(iso.slice(0, 10)), 'dd.MM.yyyy'); } catch { return iso; }
};

export default function FreigabenVerwaltenPage() {
  const [step, setStep] = useState(1);
  const [berater, setBerater] = useState<{ id: string; label: string } | null>(null);
  const [items, setItems] = useState<Pending[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const beraterSearch = useRecordSearch(servicePort, 'berater/innen', {
    searchFields: ['nachname', 'vorname', 'email_beruflich'],
    filter: "r.v_status == 'aktiv'",
    where: r => fieldLookup(r, 'status')?.key === 'aktiv',
    toItem: r => ({
      id: r.id,
      title: `${fieldText(r, 'vorname')} ${fieldText(r, 'nachname')}`.trim(),
      subtitle: fieldText(r, 'email_beruflich'),
    }),
  });

  const angebotForm = useStepForm('angebote', {
    fields: ['freigabestatus', 'freigabedatum', 'freigabekommentar'],
    steps: { freigabestatus: 3, freigabedatum: 3, freigabekommentar: 3 },
    initial: { freigabedatum: todayIso() },
  });
  const rechnungForm = useStepForm('rechnungen', {
    fields: ['freigabestatus', 'freigabedatum', 'freigabekommentar'],
    steps: { freigabestatus: 3, freigabedatum: 3, freigabekommentar: 3 },
    initial: { freigabedatum: todayIso() },
  });

  // Pending approvals of the picked Berater/in — Angebote and Rechnungen together.
  useEffect(() => {
    if (!berater) { setItems([]); setSelected([]); return; }
    let cancelled = false;
    const filter = combineFilters(refFilter('freigabe_zustaendig', berater.id), tx('r.v_freigabestatus == \'ausstehend\''));
    const mine = (r: JourneyRecord) =>
      fieldRef(r, 'freigabe_zustaendig') === berater.id && fieldLookup(r, 'freigabestatus')?.key === 'ausstehend';
    (async () => {
      setLoadingItems(true);
      setLoadError(null);
      try {
        const [angebote, rechnungen] = await Promise.all([
          servicePort.list('angebote', { filter, limit: 500 }),
          servicePort.list('rechnungen', { filter, limit: 500 }),
        ]);
        const a = angebote.filter(mine);
        const r = rechnungen.filter(mine);
        const nameCache = new Map<string, string>();
        const nameOf = async (entity: 'kunden' | 'projekte', id: string | null) => {
          if (!id) return '—';
          const k = `${entity}:${id}`;
          if (!nameCache.has(k)) {
            const rec = await servicePort.get(entity, id);
            nameCache.set(k, rec ? fieldText(rec, entity === 'kunden' ? 'kundenname' : 'projektkennung') || '—' : '—');
          }
          return nameCache.get(k) ?? '—';
        };
        const built: Pending[] = [];
        for (const rec of a) {
          built.push({
            key: `angebote-${rec.id}`, kind: 'angebote', id: rec.id, rec,
            nummer: fieldText(rec, 'angebotsnummer'),
            kunde: await nameOf('kunden', fieldRef(rec, 'kunde')),
            projekt: await nameOf('projekte', fieldRef(rec, 'projekt')),
            betrag: fieldNumber(rec, 'kostenbetrag'),
            datum: fieldDate(rec, 'angebotsdatum'),
          });
        }
        for (const rec of r) {
          built.push({
            key: `rechnungen-${rec.id}`, kind: 'rechnungen', id: rec.id, rec,
            nummer: fieldText(rec, 'rechnungsnummer'),
            kunde: await nameOf('kunden', fieldRef(rec, 'kunde')),
            projekt: await nameOf('projekte', fieldRef(rec, 'projekt')),
            betrag: fieldNumber(rec, 'gesamtbetrag'),
            datum: fieldDate(rec, 'rechnungsdatum'),
          });
        }
        if (cancelled) return;
        setItems(built);
        setSelected(built.map(p => p.key));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    })();
    return () => { cancelled = true; };
  }, [berater]);

  const angebotItems = items.filter(p => p.kind === 'angebote');
  const rechnungItems = items.filter(p => p.kind === 'rechnungen');
  const queue = useMemo(() => items.filter(p => selected.includes(p.key)), [items, selected]);
  const cur = queue[idx] as Pending | undefined;
  const curForm = cur?.kind === 'rechnungen' ? rechnungForm : angebotForm;

  const decided = queue.filter(p => decisions[p.key] && decisions[p.key].status !== 'skipped');
  const skipped = queue.filter(p => decisions[p.key]?.status === 'skipped');

  const plan: PlanStep[] = decided.map((p, i) => {
    const d = decisions[p.key];
    return {
      key: p.key,
      entity: p.kind,
      label: `${p.kind === 'angebote' ? tx('Angebot') : tx('Rechnung')} ${p.nummer}`,
      updates: p.id,
      primary: i === 0,
      values: {
        freigabestatus: d.status,
        freigabedatum: d.datum,
        ...(d.kommentar.trim() ? { freigabekommentar: d.kommentar.trim() } : {}),
      },
    };
  });
  const submit = useJourneySubmit(servicePort, plan, { draftKey: DRAFT_KEY });

  const open = (i: number, map: Record<string, Decision>) => {
    const p = queue[i];
    setIdx(i);
    setDecisionError(null);
    if (!p) return;
    const d = map[p.key];
    const f = p.kind === 'rechnungen' ? rechnungForm : angebotForm;
    f.reset({
      freigabestatus: d && d.status !== 'skipped' ? d.status : undefined,
      freigabedatum: d?.datum ?? todayIso(),
      freigabekommentar: d?.kommentar || undefined,
    });
  };

  const commit = (status: Verdict | 'skipped') => {
    if (!cur) return;
    let verdict: Verdict | 'skipped' = status;
    if (status !== 'skipped') {
      const chosen = String(curForm.get('freigabestatus') ?? '');
      if (!VERDICTS.includes(chosen)) {
        setDecisionError(tx('Bitte wähle „Freigegeben“ oder „Abgelehnt“ — oder überspringe den Eintrag.'));
        return;
      }
      verdict = chosen as Verdict;
    }
    const next = {
      ...decisions,
      [cur.key]: {
        status: verdict,
        datum: String(curForm.get('freigabedatum') || todayIso()),
        kommentar: String(curForm.get('freigabekommentar') ?? ''),
      },
    };
    setDecisions(next);
    if (idx < queue.length - 1) open(idx + 1, next);
    else setDecisionError(null);
  };

  const pickBerater = (id: string) => {
    if (berater?.id !== id) {
      setDecisions({});
      setIdx(0);
    }
    setBerater({ id, label: beraterSearch.labelOf(id) ?? '' });
    setStep(2);
  };

  const toggle = (key: string) =>
    setSelected(s => (s.includes(key) ? s.filter(k => k !== key) : [...s, key]));

  const restart = () => {
    submit.reset();
    angebotForm.reset();
    rechnungForm.reset();
    setBerater(null);
    setItems([]);
    setSelected([]);
    setDecisions({});
    setIdx(0);
    setDecisionError(null);
    setStep(1);
  };

  const summaryItems: SummaryItem[] = [
    ...(berater ? [{ key: 'berater', label: tx('Berater/in'), value: berater.label }] : []),
    ...queue.map(p => {
      const d = decisions[p.key];
      const name = `${p.kind === 'angebote' ? tx('Angebot') : tx('Rechnung')} ${p.nummer}`;
      let value = tx('Nicht bearbeitet — bleibt ausstehend');
      if (d?.status === 'skipped') value = tx('Übersprungen — bleibt ausstehend');
      else if (d) {
        const word = d.status === 'freigegeben' ? tx('Freigegeben') : tx('Abgelehnt');
        value = `${word} · ${day(d.datum)}${d.kommentar.trim() ? ` · ${d.kommentar.trim()}` : ''}`;
      }
      return { key: p.key, label: name, value };
    }),
  ];

  const approved = decided.filter(p => decisions[p.key].status === 'freigegeben').length;
  const rejected = decided.length - approved;
  const notDecided = queue.length - decided.length;

  const renderRow = (p: Pending) => (
    <label key={p.key} className="flex items-start gap-3 rounded-2xl border bg-card p-4 min-h-[44px] cursor-pointer">
      <Checkbox checked={selected.includes(p.key)} onCheckedChange={() => toggle(p.key)} className="mt-1" />
      <span className="flex-1 min-w-0">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold">{p.nummer}</span>
          <span className="font-medium">{eur(p.betrag)}</span>
        </span>
        <span className="block text-sm text-muted-foreground">{p.kunde} · {p.projekt}</span>
        <span className="block text-xs text-muted-foreground">{day(p.datum)}</span>
      </span>
    </label>
  );

  const detailRows = (p: Pending): Array<[string, string]> => {
    const r = p.rec;
    const txt = (k: string) => fieldText(r, k) || '—';
    if (p.kind === 'angebote') {
      return [
        [labelOf('angebote', 'angebotsnummer'), txt('angebotsnummer')],
        [labelOf('angebote', 'angebotstyp'), fieldLookup(r, 'angebotstyp')?.label ?? '—'],
        [labelOf('angebote', 'angebotsdatum'), day(fieldDate(r, 'angebotsdatum'))],
        [labelOf('angebote', 'gueltig_bis'), day(fieldDate(r, 'gueltig_bis'))],
        [labelOf('angebote', 'kostenbetrag'), eur(fieldNumber(r, 'kostenbetrag'))],
        [labelOf('angebote', 'angebotsbeschreibung'), txt('angebotsbeschreibung')],
        [labelOf('angebote', 'leistungspositionen'), txt('leistungspositionen')],
      ];
    }
    const mwst = fieldNumber(r, 'mehrwertsteuer');
    return [
      [labelOf('rechnungen', 'rechnungsnummer'), txt('rechnungsnummer')],
      [labelOf('rechnungen', 'rechnungsdatum'), day(fieldDate(r, 'rechnungsdatum'))],
      [labelOf('rechnungen', 'faelligkeitsdatum'), day(fieldDate(r, 'faelligkeitsdatum'))],
      [labelOf('rechnungen', 'nettobetrag'), eur(fieldNumber(r, 'nettobetrag'))],
      [labelOf('rechnungen', 'mehrwertsteuer'), mwst == null ? '—' : `${mwst} %`],
      [labelOf('rechnungen', 'gesamtbetrag'), eur(fieldNumber(r, 'gesamtbetrag'))],
      [labelOf('rechnungen', 'leistungspositionen'), txt('leistungspositionen')],
    ];
  };

  const allHandled = queue.length > 0 && queue.every(p => decisions[p.key]);
  const curDecision = cur ? decisions[cur.key] : undefined;

  return (
    <IntentWizardShell
      title={tx('Freigaben verwalten')}
      currentStep={step}
      onStepChange={setStep}
      forms={[angebotForm, rechnungForm]}
      draftKey={DRAFT_KEY}
      intro={{
        description: tx('Angebote und Rechnungen, die dir zur Freigabe zugewiesen sind, entscheiden.'),
        needs: [tx('Dein Profil als aktive/r Berater/in')],
      }}
    >
      <WizardStep label={tx('Wer bist du?')} description={tx('Wähle dein Profil, um deine Freigaben zu sehen.')}>
        <EntitySelectStep
          {...beraterSearch.select}
          selectedId={berater?.id ?? null}
          onSelect={pickBerater}
          create={false}
          avatar="initials"
          searchPlaceholder={tx('Name oder E-Mail …')}
          emptyText={tx('Kein/e aktive/r Berater/in gefunden.')}
        />
      </WizardStep>

      <WizardStep label={tx('Zugewiesene Freigaben')} description={tx('Wähle die Einträge aus, die du jetzt durchgehen möchtest.')}>
        {!berater ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        ) : (
          <div className="space-y-6" data-field="freigaben">
            {loadingItems && <p className="text-sm text-muted-foreground">{tx('Freigaben werden geladen …')}</p>}
            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
            {!loadingItems && !loadError && items.length === 0 && (
              <div className="rounded-2xl border bg-secondary p-6 text-center">
                <p className="font-semibold">{tx('Nichts zu tun')}</p>
                <p className="text-sm text-muted-foreground">
                  {tx`Für ${berater.label} wartet aktuell keine Freigabe.`}
                </p>
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="mt-3 min-h-[44px]">
                  {tx('Andere Person wählen')}
                </Button>
              </div>
            )}
            {angebotItems.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold">{tx`Angebote (${angebotItems.length})`}</h3>
                {angebotItems.map(renderRow)}
              </section>
            )}
            {rechnungItems.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold">{tx`Rechnungen (${rechnungItems.length})`}</h3>
                {rechnungItems.map(renderRow)}
              </section>
            )}
            <StepNav
              onBack={() => setStep(1)}
              nextDisabled={loadingItems || queue.length === 0}
              nextStepLabel={tx('Einzeln durchgehen')}
              onNext={() => { open(0, decisions); }}
            >
              {items.length > 0 && (
                <span className="text-sm text-muted-foreground">{tx`${queue.length} von ${items.length} ausgewählt`}</span>
              )}
            </StepNav>
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Einzeln durchgehen')} description={tx('Entscheide jeden Eintrag: freigeben, ablehnen oder überspringen.')}>
        {!cur ? (
          <StepNav onBack={() => setStep(2)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 2.')}
          </StepNav>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-sm font-medium">{tx`Eintrag ${idx + 1} von ${queue.length}`}</p>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${((idx + 1) / queue.length) * 100}%` }} />
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  {cur.kind === 'angebote' ? tx('Angebot') : tx('Rechnung')} {cur.nummer}
                </h3>
                <span className="text-sm text-muted-foreground">{cur.kunde} · {cur.projekt}</span>
              </div>
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr] text-sm">
                {detailRows(cur).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="whitespace-pre-wrap break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="space-y-4" key={cur.key}>
              <Field form={curForm} name="freigabestatus">
                <ChoiceGroup
                  {...curForm.choice('freigabestatus')}
                  options={curForm.choice('freigabestatus').options.filter(o => VERDICTS.includes(o.key))}
                />
              </Field>
              <Field form={curForm} name="freigabedatum">
                <DatePicker {...curForm.date('freigabedatum')} />
              </Field>
              <Field form={curForm} name="freigabekommentar" hint={tx('Optional')}>
                <Textarea {...curForm.field('freigabekommentar')} rows={3} />
              </Field>
              {decisionError && <p className="text-sm text-destructive">{decisionError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => commit('freigegeben')} className="min-h-[44px]">
                  {idx < queue.length - 1 ? tx('Übernehmen & weiter') : tx('Übernehmen')}
                </Button>
                <Button type="button" variant="outline" onClick={() => commit('skipped')} className="min-h-[44px]">
                  {tx('Überspringen')}
                </Button>
              </div>
              {curDecision && (
                <p className="text-xs text-muted-foreground">
                  {curDecision.status === 'skipped'
                    ? tx('Dieser Eintrag ist übersprungen.')
                    : tx('Entscheidung gespeichert — du kannst sie noch ändern.')}
                </p>
              )}
            </div>

            <StepNav
              onBack={() => (idx > 0 ? open(idx - 1, decisions) : setStep(2))}
              nextDisabled={!allHandled}
              nextStepLabel={tx('Prüfen')}
            >
              {!allHandled && (
                <span className="text-sm text-muted-foreground">
                  {tx`${queue.filter(p => !decisions[p.key]).length} Einträge offen`}
                </span>
              )}
            </StepNav>
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen & speichern')}>
        {!submit.done && (
          decided.length > 0 ? (
            <SummaryStep
              forms={[]}
              submit={submit}
              items={summaryItems}
              confirmLabel={tx('Freigaben speichern')}
              whatHappensNext={tx('Freigabestatus, -datum und -kommentar werden gespeichert. Übersprungene Einträge bleiben ausstehend.')}
            />
          ) : (
            <StepNav onBack={() => setStep(queue.length > 0 ? 3 : 2)} nextDisabled>
              {tx('Es gibt keine Entscheidung zu speichern — alle Einträge sind übersprungen oder nicht ausgewählt.')}
            </StepNav>
          )
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          title={tx('Freigaben gespeichert')}
          verb="updated"
          facts={[
            { label: tx('Freigegeben'), value: String(approved) },
            { label: tx('Abgelehnt'), value: String(rejected) },
            { label: tx('Übersprungen'), value: String(skipped.length + notDecided) },
          ]}
          actions={{ copy: false, print: false }}
          next={[
            { label: tx('Noch einmal'), onClick: restart },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
