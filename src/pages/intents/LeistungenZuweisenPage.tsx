/**
 * Leistungen zuweisen — 3-Schritt-Wizard.
 * Steps: 1) Berater/in wählen → 2) Durchführbare Leistungen wählen → 3) Prüfen & speichern.
 * Reads: berater/innen, leistungskatalog. Writes: berater/innen.leistungen (update des gewählten Datensatzes).
 * Composes: IntentWizardShell, EntitySelectStep, Field, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldLookup } from '@/lib/journey';
import { useLeistungenZuweisenFlow } from '@/lib/journey/flows/LeistungenZuweisen';
import { tx } from '@/i18n';

export default function LeistungenZuweisenPage() {
  const [step, setStep] = useState(1);
  const flow = useLeistungenZuweisenFlow({
    steps: { berater_innen: 1, leistungen: 2 },
    items: {
      berater_innen: r => {
        const name = `${fieldText(r, 'vorname')} ${fieldText(r, 'nachname')}`.trim();
        const titel = fieldText(r, 'titel');
        return {
          id: r.id,
          title: titel ? `${titel} ${name}` : name,
          subtitle: fieldText(r, 'email_beruflich'),
          status: fieldLookup(r, 'status') ?? undefined,
        };
      },
      leistungen: r => ({
        id: r.id,
        title: fieldText(r, 'leistungsbezeichnung'),
        subtitle: [fieldLookup(r, 'leistungstyp')?.label, fieldText(r, 'kuerzel')].filter(Boolean).join(' · '),
      }),
    },
  });

  return (
    <IntentWizardShell
      title={tx('Leistungen zuweisen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Einer Beraterin oder einem Berater die durchführbaren Leistungen zuordnen.'),
        needs: [tx('Name der Beraterin bzw. des Beraters'), tx('Gewünschte Leistungen aus dem Katalog')],
      }}
    >
      <WizardStep label={tx('Berater/in')} description={tx('Wähle, wem du Leistungen zuweisen möchtest.')}>
        <EntitySelectStep
          {...flow.picks.berater_innen.select}
          {...flow.pick('berater_innen')}
          avatar="initials"
          searchPlaceholder={tx('Name oder E-Mail …')}
        />
      </WizardStep>
      <WizardStep
        label={tx('Leistungen')}
        description={tx('Wähle alle Leistungen, die diese Person durchführen kann.')}
        needs={['berater_innen']}
      >
        <Field form={flow.forms.berater_innen} name="leistungen">
          <EntitySelectStep
            {...flow.picks.leistungen.select}
            {...flow.pickMany('leistungen')}
            avatar="none"
            searchPlaceholder={tx('Leistung oder Kürzel …')}
          />
        </Field>
        <StepNav
          onBack={() => setStep(1)}
          onNext={() => flow.validateStep(2)}
          nextStepLabel={tx('Prüfen')}
        />
      </WizardStep>
      <WizardStep label={tx('Prüfen')} needs={['leistungen']}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            whatHappensNext={tx('Die gewählten Leistungen erscheinen sofort im Profil der Beraterin bzw. des Beraters.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          next={[{ label: tx('Zum Dashboard'), href: '#/' }]}
        />
      )}
    </IntentWizardShell>
  );
}
