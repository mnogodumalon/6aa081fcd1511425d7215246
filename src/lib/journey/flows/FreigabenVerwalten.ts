/**
 * useFreigabenVerwaltenFlow — the plumbing of the flow « Freigaben verwalten », generated from the plan.
 *
 * Changes `angebote`: the record to change is picked (`flow.pick('angebote')`), the form is prefilled with its values; asks `freigabedatum`, `freigabestatus`, `freigabekommentar`.
 * The hook OWNS: the form(s) with exactly these fields and the plan's required
 * ingredients, one record search per picked field (columns and filter from
 * the plan), and the submit plan with its fixed and derived values. A page
 * that only calls `flow.submit.run()` cannot write a field the plan does not
 * know — there is no way to spell it.
 *
 * YOU decide what a person notices, through the options:
 *   steps     which wizard step asks which field (default: one step per pick,
 *             then one for the typed fields, then "Prüfen" = step 3)
 *   items     how a search hit is displayed per pick (title, subtitle, status …)
 *   initial   prefills for typed fields
 *   messages  the sentence for an empty required field, per field
 *
 *   const flow = useFreigabenVerwaltenFlow({
 *     steps: { angebote: 1, freigabedatum: 2, freigabestatus: 2, freigabekommentar: 2 },
 *     items: { angebote: r => ({ id: r.id, title: fieldText(r, 'angebotsnummer') }) },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     // the record this flow changes: <EntitySelectStep {...flow.picks.angebote.select} {...flow.pick('angebote')} />
 *     <Bound form={flow.forms.angebote} name="freigabedatum" />
 *     <Bound form={flow.forms.angebote} name="freigabestatus" />
 *     <Bound form={flow.forms.angebote} name="freigabekommentar" />
 *     <StepNav onNext={() => flow.validateStep(n)} />
 *     {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit} />}
 *     {flow.submit.result && <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit} />}
 *   </IntentWizardShell>
 */
import { useEffect, useState } from 'react';
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldLookups, fieldNumber, fieldDate, fieldRef,
  todayIso, nowIso, isEmptyValue, policyFixedValue, withPickPolicy, usePolicyVersion,
  type StepForm, type JourneyRecord, type RefContext, type SelectItemLike, type FormValues, type PlanStep,} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { pickHint, whereSentence, type PickWhere } from '@/lib/journey/policy';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
import { entityLabel } from '@/lib/journey/rules';
export type FreigabenVerwaltenFieldKey = 'angebote' | 'freigabedatum' | 'freigabekommentar' | 'freigabestatus';

export interface FreigabenVerwaltenForms {
  angebote: StepForm<'angebote'>;
}

// Alias so the option generics stay readable.
type Key = FreigabenVerwaltenFieldKey;

export interface FreigabenVerwaltenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
  /** How a search hit reads — the card's title/subtitle/status per pick. */
  items?: {
    angebote?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
  };
}

const DEFAULT_STEPS: Record<string, number> = {"angebote": 1, "freigabedatum": 2, "freigabekommentar": 2, "freigabestatus": 2};
export const FREIGABENVERWALTEN_REVIEW_STEP = 3;

function fromPick<T>(pick: { recordOf(id: string): JourneyRecord | undefined }, form: StepForm, field: string, read: (r: JourneyRecord) => T): T | undefined {
  const id = form.get(field);
  const rec = typeof id === 'string' && id ? pick.recordOf(id) : undefined;
  return rec ? read(rec) : undefined;
}
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Returns T, not Partial<T>: a Record's index signature is already "maybe
// absent", and Partial<Record<string, string>> does not assign to the
// Record<string, string> useStepForm wants (tsc, live 23.09.2026 — eight
// errors, one per hook, caught only in the sandbox build).
function only<T extends Record<string, unknown>>(obj: T | undefined, keys: string[]): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out as T;
}

function hasValues(form: StepForm): boolean {
  return form.keys.some(k => !isEmptyValue(form.values[k]));
}

export function useFreigabenVerwaltenFlow(options: FreigabenVerwaltenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const [angeboteTargetId, setAngeboteTargetId] = useState<string | null>(null);
  const angebote = useStepForm('angebote', {
    fields: ["freigabedatum", "freigabestatus", "freigabekommentar"],
    steps: only(steps, ["freigabedatum", "freigabestatus", "freigabekommentar"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["freigabedatum", "freigabestatus", "freigabekommentar"]),
    messages: only(options.messages as Record<string, string> | undefined, ["freigabedatum", "freigabestatus", "freigabekommentar"]),
  });
  const forms: FreigabenVerwaltenForms = { angebote };
  const formList: StepForm[] = [angebote];

  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
    angebote: useRecordSearch(servicePort, 'angebote', withPickPolicy('angebote', {
      searchFields: ["angebotsnummer"] as never,
      toItem: options.items?.angebote as never,
    })),
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // what the person sees under the search field: the rule that narrows the
  // pick (the owner's, else the plan's) — and the link that changes it
  const hintFor = (key: string, entity: EntityKey, planned: PickWhere | null) => pickHint(key, planned,
    w => whereSentence(w, f => labelOf(entity, f), (f, v) => optionsOf(entity, f).find(o => o.key === String(v))?.label ?? String(v)),
    `#/verwaltung/anwendung?line=intent:freigaben-verwalten:read:${entity}`);
  const picks = {
    angebote: { ...searches.angebote, select: { ...searches.angebote.select, create: false as boolean, hint: hintFor('angebote', 'angebote', null as PickWhere | null) } },
  };

  const plan: PlanStep[] = [
    {
      key: 'angebote', entity: 'angebote', form: angebote, primary: true,
      updates: () => angeboteTargetId ?? undefined,
      // the review names the record this step changes; "Ändern" leads back to its pick
      target: () => angeboteTargetId
        ? { key: 'target:angebote', label: entityLabel('angebote'), value: picks.angebote.labelOf(angeboteTargetId) ?? angeboteTargetId, step: steps.angebote }
        : undefined,    },
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'freigaben-verwalten' });

  /** The record(s) this flow CHANGES: picked through {...flow.picks.<entity>.select} {...flow.pick('<entity>')};
   *  picking prefills the form with the record's current values, and the plan step updates that record. */
  const targets = {
    angebote: {
      selectedId: angeboteTargetId,
      onSelect: (id: string) => {
        setAngeboteTargetId(id);
        const rec = picks.angebote.recordOf(id);
        if (rec) angebote.reset({ freigabedatum: fieldDate(rec, "freigabedatum"), freigabestatus: fieldLookup(rec, "freigabestatus")?.key, freigabekommentar: fieldText(rec, "freigabekommentar"), });
      },
      get record(): JourneyRecord | undefined { return angeboteTargetId ? picks.angebote.recordOf(angeboteTargetId) : undefined; },
    },
  };
  // Opened for one record — `#/intents/freigaben-verwalten?record=<id>`, the dashboard's
  // flowActionFor(): that record is the one to change. Loaded, taken into the
  // pick and selected — when this flow may change it at all (the pick's rule).
  const [linkedId] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record'));
  useEffect(() => {
    if (!linkedId) return;
    let on = true;
    void servicePort.get('angebote', linkedId).then(rec => {
      if (!on || !rec) return;
      picks.angebote.adopt(rec);
      targets.angebote.onSelect(rec.id);
    }).catch(() => undefined);
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, [linkedId]);
  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: FreigabenVerwaltenFieldKey) => {
    if (field in targets) {
      const t = targets[field as keyof typeof targets];
      return { selectedId: t.selectedId, onSelect: t.onSelect };
    }
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return {
      selectedId: (typeof owner.get(field) === 'string' ? (owner.get(field) as string) : null) || null,
      // `field as never` collapsed the conditional SetArgs<E, never> to never and
      // no argument was assignable any more (tsc, live 23.09.2026); widen `set`
      // itself instead — the label stays a required third argument.
      onSelect: (id: string) => (owner.set as (k: string, v: unknown, l?: string) => void)(field, id, search?.labelOf(id)),
    };
  };
  /** Props for a multi-record pick step: {...flow.picks.x.select} {...flow.pickMany('x')} */
  const pickMany = (field: FreigabenVerwaltenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)))    && Object.entries(targets).every(([k, t]) => steps[k] !== n || !!t.selectedId);
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); setAngeboteTargetId(null); };

  return {
    slug: 'freigaben-verwalten' as const,
    draftKey: 'freigaben-verwalten' as const,
    entity: 'angebote' as const,
    form: angebote,
    forms, formList, picks, submit, steps, targets,    reviewStep: FREIGABENVERWALTEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,
    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type FreigabenVerwaltenFlow = ReturnType<typeof useFreigabenVerwaltenFlow>;
