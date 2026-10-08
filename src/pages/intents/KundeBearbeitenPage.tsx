/**
 * Kunde bearbeiten — 4-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Stammdaten & Kontakt → 3) Rechnungsadresse & Ansprechpartner → 4) Prüfen & speichern.
 * Reads: kunden. Writes: kunden (Update des gewählten Kunden über den Plan).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldDate,
} from '@/lib/journey';
import type { JourneyRecord } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

const STEP2_FIELDS = ['kundenname', 'kundentyp', 'email', 'telefon', 'bevorzugte_kontaktart', 'strasse', 'hausnummer', 'plz', 'ort'];
const STEP3_FIELDS = [
  're_strasse', 're_hausnummer', 're_plz', 're_ort',
  'ap_titel', 'ap_vorname', 'ap_nachname', 'ap_email', 'ap_telefon',
  'letzter_kontakt_datum', 'letzter_kontakt_ansprechpartner', 'notizen',
];
const LOOKUP_FIELDS = ['kundentyp', 'bevorzugte_kontaktart'];
const DATE_FIELDS = ['letzter_kontakt_datum'];

const stepMap: Record<string, number> = {};
STEP2_FIELDS.forEach(k => { stepMap[k] = 2; });
STEP3_FIELDS.forEach(k => { stepMap[k] = 3; });

function valuesOf(r: JourneyRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of [...STEP2_FIELDS, ...STEP3_FIELDS]) {
    if (LOOKUP_FIELDS.includes(k)) out[k] = fieldLookup(r, k)?.key ?? null;
    else if (DATE_FIELDS.includes(k)) out[k] = fieldDate(r, k);
    else out[k] = fieldText(r, k);
  }
  return out;
}

export default function KundeBearbeitenPage() {
  const kunden = useRecordSearch(servicePort, 'kunden', {
    searchFields: ['kundenname', 'email', 'telefon', 'ort'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'kundenname'),
      subtitle: fieldText(k, 'email'),
      status: fieldLookup(k, 'kundentyp') ?? undefined,
    }),
  });
  const [step, setStep] = useState(1);
  const [kundeId, setKundeId] = useState<string | null>(null);
  const [kundeLabel, setKundeLabel] = useState('');

  const f = useStepForm('kunden', {
    fields: [...STEP2_FIELDS, ...STEP3_FIELDS],
    steps: stepMap,
  });

  const submit = useJourneySubmit(servicePort, [
    { key: 'kunde', entity: 'kunden', form: f, updates: () => kundeId ?? undefined, primary: true },
  ], { draftKey: 'kunde-bearbeiten' });

  const pick = (id: string) => {
    const rec = kunden.recordOf(id);
    if (rec) f.reset(valuesOf(rec));
    setKundeId(id);
    setKundeLabel(kunden.labelOf(id) ?? '');
    setStep(2);
  };

  const missingPick = (
    <StepNav onBack={() => setStep(1)} nextDisabled>
      {tx('Dieser Schritt braucht die Auswahl eines Kunden aus Schritt 1.')}
    </StepNav>
  );

  return (
    <IntentWizardShell
      title={tx('Kunde bearbeiten')}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="kunde-bearbeiten"
      intro={{
        description: tx('Kundendaten korrigieren, prüfen und speichern.'),
        needs: [tx('Name, E-Mail oder Ort des Kunden')],
      }}
    >
      <WizardStep label={tx('Kunde')} description={tx('Welchen Kunden möchtest du bearbeiten?')}>
        <EntitySelectStep {...kunden.select} selectedId={kundeId} onSelect={pick}
          searchPlaceholder={tx('Name, E-Mail, Telefon oder Ort …')} create={false}
          emptyText={tx('Kein Kunde gefunden.')} />
      </WizardStep>

      <WizardStep label={tx('Stammdaten')} heading={tx('Stammdaten & Kontakt')}
        description={tx('Name, Kundentyp und Kontaktdaten anpassen.')}>
        {kundeId ? (
          <div className="space-y-4">
            <Bound form={f} name="kundenname" />
            <Bound form={f} name="kundentyp" />
            <Bound form={f} name="email" />
            <Bound form={f} name="telefon" />
            <Bound form={f} name="bevorzugte_kontaktart" allowClear />
            <div className="grid gap-4 sm:grid-cols-2">
              <Bound form={f} name="strasse" />
              <Bound form={f} name="hausnummer" />
              <Bound form={f} name="plz" />
              <Bound form={f} name="ort" />
            </div>
            <StepNav onBack={() => setStep(1)}
              onNext={() => f.validate(['kundenname', 'kundentyp', 'email'])}
              nextStepLabel={tx('Rechnungsadresse')} />
          </div>
        ) : missingPick}
      </WizardStep>

      <WizardStep label={tx('Rechnung & Kontakt')} heading={tx('Rechnungsadresse & Ansprechpartner')}
        description={tx('Rechnungsadresse, Ansprechpartner und Notizen anpassen.')}>
        {kundeId ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Bound form={f} name="re_strasse" />
              <Bound form={f} name="re_hausnummer" />
              <Bound form={f} name="re_plz" />
              <Bound form={f} name="re_ort" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Bound form={f} name="ap_titel" />
              <Bound form={f} name="ap_vorname" />
              <Bound form={f} name="ap_nachname" />
              <Bound form={f} name="ap_email" />
              <Bound form={f} name="ap_telefon" />
            </div>
            <Bound form={f} name="letzter_kontakt_datum" />
            <Bound form={f} name="letzter_kontakt_ansprechpartner" />
            <Bound form={f} name="notizen" rows={4} />
            <StepNav onBack={() => setStep(2)}
              onNext={() => f.validate(['ap_email'])}
              nextStepLabel={tx('Prüfen')} />
          </div>
        ) : missingPick}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {kundeId ? (
          !submit.done && (
            <SummaryStep forms={[f]} submit={submit}
              items={[{ key: 'kunde', label: tx('Kunde'), value: kundeLabel }]}
              confirmLabel={tx('Änderungen speichern')}
              whatHappensNext={tx('Die Daten des Kunden werden mit deinen Änderungen aktualisiert.')} />
          )
        ) : missingPick}
      </WizardStep>

      {submit.result && (
        <SuccessStep result={submit.result} forms={[f]} submit={submit}
          restartLabel={tx('Weiteren Kunden bearbeiten')}
          next={[{ label: tx('Zum Dashboard'), href: '#/' }]} />
      )}
    </IntentWizardShell>
  );
}
