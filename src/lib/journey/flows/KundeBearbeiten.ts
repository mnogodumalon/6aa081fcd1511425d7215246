/**
 * useKundeBearbeitenFlow — the plumbing of the flow « Kunde bearbeiten », generated from the plan.
 *
 * Changes `kunden`: the record to change is picked (`flow.pick('kunden')`), the form is prefilled with its values; asks `ort`, `plz`, `email`, `re_ort`, `re_plz`, `notizen`, `strasse`, `telefon`, `ap_email`, `ap_titel`, `kundentyp`, `ap_telefon`, `ap_vorname`, `hausnummer`, `kundenname`, `re_strasse`, `ap_nachname`, `re_hausnummer`, `bevorzugte_kontaktart`, `letzter_kontakt_datum`, `letzter_kontakt_ansprechpartner`.
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
 *   const flow = useKundeBearbeitenFlow({
 *     steps: { kunden: 1, ort: 2, plz: 2, email: 2, re_ort: 2, re_plz: 2, notizen: 2, strasse: 2, telefon: 2, ap_email: 2, ap_titel: 2, kundentyp: 2, ap_telefon: 2, ap_vorname: 2, hausnummer: 2, kundenname: 2, re_strasse: 2, ap_nachname: 2, re_hausnummer: 2, bevorzugte_kontaktart: 2, letzter_kontakt_datum: 2, letzter_kontakt_ansprechpartner: 2 },
 *     items: { kunden: r => ({ id: r.id, title: fieldText(r, 'kundenname') }) },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     // the record this flow changes: <EntitySelectStep {...flow.picks.kunden.select} {...flow.pick('kunden')} />
 *     <Bound form={flow.forms.kunden} name="ort" />
 *     <Bound form={flow.forms.kunden} name="plz" />
 *     <Bound form={flow.forms.kunden} name="email" />
 *     <Bound form={flow.forms.kunden} name="re_ort" />
 *     <Bound form={flow.forms.kunden} name="re_plz" />
 *     <Bound form={flow.forms.kunden} name="notizen" />
 *     <Bound form={flow.forms.kunden} name="strasse" />
 *     <Bound form={flow.forms.kunden} name="telefon" />
 *     <Bound form={flow.forms.kunden} name="ap_email" />
 *     <Bound form={flow.forms.kunden} name="ap_titel" />
 *     <Bound form={flow.forms.kunden} name="kundentyp" />
 *     <Bound form={flow.forms.kunden} name="ap_telefon" />
 *     <Bound form={flow.forms.kunden} name="ap_vorname" />
 *     <Bound form={flow.forms.kunden} name="hausnummer" />
 *     <Bound form={flow.forms.kunden} name="kundenname" />
 *     <Bound form={flow.forms.kunden} name="re_strasse" />
 *     <Bound form={flow.forms.kunden} name="ap_nachname" />
 *     <Bound form={flow.forms.kunden} name="re_hausnummer" />
 *     <Bound form={flow.forms.kunden} name="bevorzugte_kontaktart" />
 *     <Bound form={flow.forms.kunden} name="letzter_kontakt_datum" />
 *     <Bound form={flow.forms.kunden} name="letzter_kontakt_ansprechpartner" />
 *     <StepNav onNext={() => flow.validateStep(n)} />
 *     {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit} />}
 *     {flow.submit.result && <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit} />}
 *   </IntentWizardShell>
 */
import { useState } from 'react';
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldLookups, fieldNumber, fieldDate, fieldRef,
  todayIso, nowIso, isEmptyValue, policyFixedValue, withPickPolicy, usePolicyVersion,
  type StepForm, type JourneyRecord, type RefContext, type SelectItemLike, type FormValues, type PlanStep,} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { pickHint, whereSentence, type PickWhere } from '@/lib/journey/policy';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
import { entityLabel } from '@/lib/journey/rules';
export type KundeBearbeitenFieldKey = 'ap_email' | 'ap_nachname' | 'ap_telefon' | 'ap_titel' | 'ap_vorname' | 'bevorzugte_kontaktart' | 'email' | 'hausnummer' | 'kunden' | 'kundenname' | 'kundentyp' | 'letzter_kontakt_ansprechpartner' | 'letzter_kontakt_datum' | 'notizen' | 'ort' | 'plz' | 're_hausnummer' | 're_ort' | 're_plz' | 're_strasse' | 'strasse' | 'telefon';

export interface KundeBearbeitenForms {
  kunden: StepForm<'kunden'>;
}

// Alias so the option generics stay readable.
type Key = KundeBearbeitenFieldKey;

export interface KundeBearbeitenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
  /** How a search hit reads — the card's title/subtitle/status per pick. */
  items?: {
    kunden?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
  };
}

const DEFAULT_STEPS: Record<string, number> = {"ap_email": 2, "ap_nachname": 2, "ap_telefon": 2, "ap_titel": 2, "ap_vorname": 2, "bevorzugte_kontaktart": 2, "email": 2, "hausnummer": 2, "kunden": 1, "kundenname": 2, "kundentyp": 2, "letzter_kontakt_ansprechpartner": 2, "letzter_kontakt_datum": 2, "notizen": 2, "ort": 2, "plz": 2, "re_hausnummer": 2, "re_ort": 2, "re_plz": 2, "re_strasse": 2, "strasse": 2, "telefon": 2};
export const KUNDEBEARBEITEN_REVIEW_STEP = 3;

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

export function useKundeBearbeitenFlow(options: KundeBearbeitenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const [kundenTargetId, setKundenTargetId] = useState<string | null>(null);
  const kunden = useStepForm('kunden', {
    fields: ["ort", "plz", "email", "re_ort", "re_plz", "notizen", "strasse", "telefon", "ap_email", "ap_titel", "kundentyp", "ap_telefon", "ap_vorname", "hausnummer", "kundenname", "re_strasse", "ap_nachname", "re_hausnummer", "bevorzugte_kontaktart", "letzter_kontakt_datum", "letzter_kontakt_ansprechpartner"],
    steps: only(steps, ["ort", "plz", "email", "re_ort", "re_plz", "notizen", "strasse", "telefon", "ap_email", "ap_titel", "kundentyp", "ap_telefon", "ap_vorname", "hausnummer", "kundenname", "re_strasse", "ap_nachname", "re_hausnummer", "bevorzugte_kontaktart", "letzter_kontakt_datum", "letzter_kontakt_ansprechpartner"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["ort", "plz", "email", "re_ort", "re_plz", "notizen", "strasse", "telefon", "ap_email", "ap_titel", "kundentyp", "ap_telefon", "ap_vorname", "hausnummer", "kundenname", "re_strasse", "ap_nachname", "re_hausnummer", "bevorzugte_kontaktart", "letzter_kontakt_datum", "letzter_kontakt_ansprechpartner"]),
    messages: only(options.messages as Record<string, string> | undefined, ["ort", "plz", "email", "re_ort", "re_plz", "notizen", "strasse", "telefon", "ap_email", "ap_titel", "kundentyp", "ap_telefon", "ap_vorname", "hausnummer", "kundenname", "re_strasse", "ap_nachname", "re_hausnummer", "bevorzugte_kontaktart", "letzter_kontakt_datum", "letzter_kontakt_ansprechpartner"]),
  });
  const forms: KundeBearbeitenForms = { kunden };
  const formList: StepForm[] = [kunden];

  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
    kunden: useRecordSearch(servicePort, 'kunden', withPickPolicy('kunden', {
      searchFields: ["kundenname"] as never,
      toItem: options.items?.kunden as never,
    })),
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // what the person sees under the search field: the rule that narrows the
  // pick (the owner's, else the plan's) — and the link that changes it
  const hintFor = (key: string, entity: EntityKey, planned: PickWhere | null) => pickHint(key, planned,
    w => whereSentence(w, f => labelOf(entity, f), (f, v) => optionsOf(entity, f).find(o => o.key === String(v))?.label ?? String(v)),
    `#/verwaltung/anwendung?line=intent:kunde-bearbeiten:read:${entity}`);
  const picks = {
    kunden: { ...searches.kunden, select: { ...searches.kunden.select, create: false as boolean, hint: hintFor('kunden', 'kunden', null as PickWhere | null) } },
  };

  const plan: PlanStep[] = [
    {
      key: 'kunden', entity: 'kunden', form: kunden, primary: true,
      updates: () => kundenTargetId ?? undefined,
      // the review names the record this step changes; "Ändern" leads back to its pick
      target: () => kundenTargetId
        ? { key: 'target:kunden', label: entityLabel('kunden'), value: picks.kunden.labelOf(kundenTargetId) ?? kundenTargetId, step: steps.kunden }
        : undefined,    },
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'kunde-bearbeiten' });

  /** The record(s) this flow CHANGES: picked through {...flow.picks.<entity>.select} {...flow.pick('<entity>')};
   *  picking prefills the form with the record's current values, and the plan step updates that record. */
  const targets = {
    kunden: {
      selectedId: kundenTargetId,
      onSelect: (id: string) => {
        setKundenTargetId(id);
        const rec = picks.kunden.recordOf(id);
        if (rec) kunden.reset({ ort: fieldText(rec, "ort"), plz: fieldText(rec, "plz"), email: fieldText(rec, "email"), re_ort: fieldText(rec, "re_ort"), re_plz: fieldText(rec, "re_plz"), notizen: fieldText(rec, "notizen"), strasse: fieldText(rec, "strasse"), telefon: fieldText(rec, "telefon"), ap_email: fieldText(rec, "ap_email"), ap_titel: fieldText(rec, "ap_titel"), kundentyp: fieldLookup(rec, "kundentyp")?.key, ap_telefon: fieldText(rec, "ap_telefon"), ap_vorname: fieldText(rec, "ap_vorname"), hausnummer: fieldText(rec, "hausnummer"), kundenname: fieldText(rec, "kundenname"), re_strasse: fieldText(rec, "re_strasse"), ap_nachname: fieldText(rec, "ap_nachname"), re_hausnummer: fieldText(rec, "re_hausnummer"), bevorzugte_kontaktart: fieldLookup(rec, "bevorzugte_kontaktart")?.key, letzter_kontakt_datum: fieldDate(rec, "letzter_kontakt_datum"), letzter_kontakt_ansprechpartner: fieldText(rec, "letzter_kontakt_ansprechpartner"), });
      },
      get record(): JourneyRecord | undefined { return kundenTargetId ? picks.kunden.recordOf(kundenTargetId) : undefined; },
    },
  };
  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: KundeBearbeitenFieldKey) => {
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
  const pickMany = (field: KundeBearbeitenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)))    && Object.entries(targets).every(([k, t]) => steps[k] !== n || !!t.selectedId);
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); setKundenTargetId(null); };

  return {
    slug: 'kunde-bearbeiten' as const,
    draftKey: 'kunde-bearbeiten' as const,
    entity: 'kunden' as const,
    form: kunden,
    forms, formList, picks, submit, steps, targets,    reviewStep: KUNDEBEARBEITEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,
    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type KundeBearbeitenFlow = ReturnType<typeof useKundeBearbeitenFlow>;
