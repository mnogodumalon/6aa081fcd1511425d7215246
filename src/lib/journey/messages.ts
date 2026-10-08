/**
 * Required-field messages — WRITTEN BY THE BUILD AGENT, never by a heuristic.
 *
 * The layer knows two things about an empty required field: that it is
 * required and what its label is. Out of that it can only say „„Anreise" ist
 * ein Pflichtfeld". What the person should do instead („Bitte einen Gast
 * auswählen.") is meaning, and meaning is the agent's: the Phase-2 orchestrator
 * writes one short instruction per required field — what is needed, not why — to
 * `.intents-staging/messages.json`, the integration step validates it against
 * the app metadata and renders it into the block below. Scaffold updates keep
 * the block. Do not edit outside the markers.
 *
 * Every door reads this and nothing else: `useStepForm` (flows and public
 * pages), the generated {Entity}Dialog and the public form's server-error line.
 * A field without a sentence falls back to the label sentence — never to a
 * bare „Dieses Feld ist erforderlich".
 *
 * Required fields per entity (from the base view):
 *   - berater/innen: nachname (Nachname), vorname (Vorname), email_beruflich (E-Mail (beruflich)), status (Status)
 *   - kunden: kundenname (Name / Firmenname), kundentyp (Kundentyp), email (E-Mail)
 *   - leistungskatalog: leistungsbezeichnung (Leistungsbezeichnung), leistungstyp (Leistungstyp)
 *   - projekte: projektkennung (Projektkennung), projektnummer (Projektnummer), projektart (Projektart), projektstart_jahr (Startjahr), status (Projektstatus), kunde (Kunde)
 *   - angebote: angebotsnummer (Angebotsnummer), angebotsjahr (Jahr), angebotstyp (Angebotstyp), angebotsdatum (Angebotsdatum)
 *   - zeiterfassung: datum (Datum), stunden (Geleistete Stunden), monat (Abrechnungsmonat), jahr (Abrechnungsjahr), berater (Berater/in), projekt (Projekt)
 *   - rechnungen: rechnungsnummer (Rechnungsnummer), rechnungsdatum (Rechnungsdatum), rechnungsstatus (Rechnungsstatus), gesamtbetrag (Gesamtbetrag (€)), kunde (Kunde), projekt (Projekt)
 */
import { t, tx } from '@/i18n';
import { labelOf, type EntityKey } from './rules';

/** The writable fields of each entity — the keys a message may address (generated). */
export interface MessageFields {
  "berater/innen": "nachname" | "vorname" | "titel" | "strasse" | "hausnummer" | "plz" | "ort" | "email_beruflich" | "email_privat" | "telefon" | "einstiegsdatum" | "status" | "stundensatz" | "sonstiges_1" | "sonstiges_2" | "strasse_geschaeftlich" | "hausnummer_geschaeftlich" | "plz_geschaeftlich" | "ort_geschaeftlich" | "telefon_geschaeftlich" | "leistungen" | "projekte";
  "kunden": "kundenname" | "kundentyp" | "email" | "telefon" | "strasse" | "hausnummer" | "plz" | "ort" | "re_strasse" | "re_hausnummer" | "re_plz" | "re_ort" | "anlagedatum" | "ap_titel" | "ap_vorname" | "ap_nachname" | "ap_email" | "ap_telefon" | "bevorzugte_kontaktart" | "letzter_kontakt_datum" | "letzter_kontakt_ansprechpartner" | "notizen" | "laufende_projekte";
  "leistungskatalog": "leistungsbezeichnung" | "leistungstyp" | "beschreibung" | "kostenvoranschlag" | "stundensatz_leistung" | "einheit" | "verfuegbarkeit" | "kuerzel";
  "projekte": "projektkennung" | "projektnummer" | "projektart" | "projektstart_jahr" | "projektstart_monat" | "status" | "ansprechpartner_kunde" | "letzter_schritt" | "projektende" | "notizen" | "kunde" | "projektleitung";
  "angebote": "angebotsnummer" | "angebotsjahr" | "angebotstyp" | "angebotsdatum" | "gueltig_bis" | "zeitrahmen_anfang" | "zeitrahmen_ende" | "dauer" | "kostentyp" | "kostenbetrag" | "kosten_beschreibung" | "angebotsbeschreibung" | "leistungspositionen" | "anmerkungen" | "projekt" | "kunde";
  "zeiterfassung": "datum" | "stunden" | "monat" | "jahr" | "taetigkeitsbeschreibung" | "verrechenbar" | "notizen" | "berater" | "projekt" | "leistung";
  "rechnungen": "rechnungsnummer" | "rechnungsdatum" | "faelligkeitsdatum" | "rechnungsstatus" | "abrechnungsmonat" | "abrechnungsjahr" | "nettobetrag" | "mehrwertsteuer" | "gesamtbetrag" | "zahlungseingang" | "leistungspositionen" | "notizen" | "kunde" | "projekt" | "berater";
}
export type MessageFieldKey<E extends EntityKey> = E extends keyof MessageFields ? MessageFields[E] : never;

export const REQUIRED_MESSAGES: { [E in EntityKey]?: Partial<Record<MessageFieldKey<E>, string>> } = {
  // <custom:messages>
  // </custom:messages>
};

/** The sentence shown when `key` of `entity` is required and empty — the
 *  agent's own text (translated at runtime like every page string), else the
 *  label sentence. Call it while rendering, not at module scope. */
export function requiredMessage(entity: EntityKey, key: string): string {
  const own = (REQUIRED_MESSAGES as Record<string, Record<string, string | undefined> | undefined>)[entity]?.[key];
  if (own && own.trim()) return tx(own);
  return t('v_required', { label: labelOf(entity, key) });
}

/** True when the agent wrote a sentence for the field. */
export function hasOwnMessage(entity: EntityKey, key: string): boolean {
  const own = (REQUIRED_MESSAGES as Record<string, Record<string, string | undefined> | undefined>)[entity]?.[key];
  return Boolean(own && own.trim());
}
