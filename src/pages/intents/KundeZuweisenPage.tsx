/**
 * Kunde zuweisen — 3-Schritt-Wizard.
 * Steps: 1) Projekt ohne Kunde wählen → 2) Kunde wählen → 3) Prüfen & speichern.
 * Reads: projekte (nur ohne Kunde), kunden. Writes: projekte (ein Update, setzt kunde).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useEffect, useRef, useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldNumber, fieldRef,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function KundeZuweisenPage() {
  const [step, setStep] = useState(1);
  const [projektId, setProjektId] = useState<string | null>(null);

  // Only projects without a customer are offered — a set kunde can never be overwritten.
  const projekte = useRecordSearch(servicePort, 'projekte', {
    filter: 'r.v_kunde is None',
    where: r => !fieldRef(r, 'kunde'),
    searchFields: ['projektkennung', 'ansprechpartner_kunde'],
    toItem: p => ({
      id: p.id,
      title: fieldText(p, 'projektkennung'),
      subtitle: fieldLookup(p, 'projektart')?.label ?? '',
      status: fieldLookup(p, 'status') ?? undefined,
    }),
  });
  const kunden = useRecordSearch(servicePort, 'kunden', {
    searchFields: ['kundenname', 'email', 'telefon', 'ort'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'kundenname'),
      subtitle: [fieldLookup(k, 'kundentyp')?.label, fieldText(k, 'email')].filter(Boolean).join(' · '),
    }),
  });

  const zuweisung = useStepForm('projekte', { fields: ['kunde'], steps: { kunde: 2 } });

  const projekt = projektId ? projekte.recordOf(projektId) : undefined;
  const projektLabel = projektId ? projekte.labelOf(projektId) ?? '' : '';
  const ansprechpartner = projekt ? fieldText(projekt, 'ansprechpartner_kunde') : '';
  const kundeLabel = zuweisung.labels.kunde ?? '';

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'zuweisung', entity: 'projekte', form: zuweisung, primary: true,
      updates: () => projektId ?? undefined,
      target: () => (projektId ? { key: 'projekt', label: tx('Projekt'), value: projektLabel, step: 1 } : undefined),
    },
  ], { draftKey: 'kunde-zuweisen' });

  // After "Noch einmal": forget the old pick and reload the list (the assigned project is gone from it).
  const wasDone = useRef(false);
  useEffect(() => {
    if (submit.result) { wasDone.current = true; return; }
    if (wasDone.current) {
      wasDone.current = false;
      setProjektId(null);
      void projekte.reload();
    }
  }, [submit.result, projekte]);

  const noProjects = !projekte.select.loading && !projekte.select.error && projekte.select.items.length === 0;

  return (
    <IntentWizardShell
      title={tx('Kunde zuweisen')}
      currentStep={step} onStepChange={setStep}
      forms={[zuweisung]} draftKey="kunde-zuweisen"
      intro={{ description: tx('Einem Projekt ohne Kunden einen bestehenden Kunden zuordnen.'), needs: [tx('Projektkennung'), tx('Name des Kunden')] }}
    >
      <WizardStep label={tx('Projekt')} heading={tx('Projekt ohne Kunde wählen')}
        description={tx('Es werden nur Projekte angezeigt, denen noch kein Kunde zugeordnet ist.')}>
        <div className="space-y-4">
          <EntitySelectStep {...projekte.select}
            selectedId={projektId}
            searchPlaceholder={tx('Projektkennung oder Ansprechpartner …')}
            onSelect={id => { setProjektId(id); zuweisung.reset(); setStep(2); }} />
          {noProjects && (
            <div data-field="projekt-leer" className="rounded-2xl border bg-card p-5 text-center space-y-3">
              <p className="text-sm text-muted-foreground">{tx('Gerade gibt es nichts zuzuweisen.')}</p>
              <a href="#/" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
                {tx('Zum Dashboard')}
              </a>
            </div>
          )}
          <StepNav hideBack onNext={() => (projektId ? true : tx('Bitte ein Projekt wählen.'))} nextStepLabel={tx('Kunde wählen')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Kunde')} heading={tx('Kunde wählen')}
        description={tx('Welcher bestehende Kunde gehört zu diesem Projekt?')}>
        {projektId ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary p-4 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{projektLabel}</span>
                {projekt && <StatusBadge statusKey={fieldLookup(projekt, 'status')?.key} label={fieldLookup(projekt, 'status')?.label} />}
              </div>
              {projekt && (
                <p className="text-muted-foreground">
                  {tx`Nr. ${fieldNumber(projekt, 'projektnummer') ?? '–'} · ${fieldLookup(projekt, 'projektart')?.label ?? '–'}`}
                </p>
              )}
              {ansprechpartner && (
                <p className="text-muted-foreground">{tx`Ansprechpartner beim Kunden: ${ansprechpartner} — das hilft bei der Auswahl.`}</p>
              )}
            </div>
            <EntitySelectStep {...kunden.select}
              selectedId={zuweisung.get('kunde') as string | null}
              searchPlaceholder={tx('Name, E-Mail, Telefon oder Ort …')}
              onSelect={id => { zuweisung.set('kunde', id, kunden.labelOf(id)); setStep(3); }} />
            <StepNav onBack={() => setStep(1)} onNext={() => zuweisung.validate(['kunde'])} nextStepLabel={tx('Prüfen')} />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (projektId ? (
          <SummaryStep forms={[zuweisung]} submit={submit}
            whatHappensNext={tx('Das Projekt erscheint danach beim gewählten Kunden.')} />
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</StepNav>
        ))}
      </WizardStep>

      {submit.result && (
        <SuccessStep result={submit.result} submit={submit}
          title={tx('Kunde zugewiesen')}
          facts={[
            { label: tx('Projekt'), value: projektLabel },
            { label: tx('Kunde'), value: kundeLabel },
          ]}
          next={[{ label: tx('Weiteres Projekt zuweisen') }, { label: tx('Zum Dashboard'), href: '#/' }]} />
      )}
    </IntentWizardShell>
  );
}
