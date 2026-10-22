// The orchestrator's plan, as far as the running app needs it
// (docs/orchestrator/SPEC.md). Generated — do not edit; regenerated on every
// build and update from the stored plan. Without a plan every map is empty.
//
//   SYSTEM_ASSIGNED entity → fields a tool fills when a record is CREATED — the
//                   value does not exist before; dialogs hide these on create and
//                   the form-polish sets no default on them. A scheduled or
//                   update-triggered tool owns its field but is NOT in here.
//   PLAN_SENTENCES  slug → the plan in the owner's words (flows' field page)
//
// The runtime write guard (FLOW_WRITES/OWNERSHIP, planGuard.ts) left on
// 23.09.2026: a flow page composes against its generated hook, whose submit
// plan IS the Schreibliste — there is no way to spell a write outside it.

import { INTENTS } from '@/config/intents';

export const SYSTEM_ASSIGNED: Record<string, string[]> = {};

export const PLAN_SENTENCES: Record<string, string[]> = {
  "stunden-erfassen": [],
  "angebot-erstellen": [],
  "rechnung-erstellen": [
    "Ändert: rechnungen"
  ],
  "kunde-bearbeiten": [
    "Ändert: kunden"
  ],
  "leistungen-zuweisen": [],
  "freigaben-verwalten": [
    "Ändert: angebote"
  ]
};

export const PLAN_SUMMARY = "inclou. ERP";

/** slug → the lists a flow writes (the plan's Schreibliste). The nav leaves a
 *  flow out for a user who may not write one of them (lib/permissions.ts). */
export const FLOW_ENTITIES: Record<string, string[]> = {
  "rechnung-erstellen": [
    "rechnungen"
  ],
  "kunde-bearbeiten": [
    "kunden"
  ],
  "freigaben-verwalten": [
    "angebote"
  ]
};

/** A field an UPDATE flow writes, and the value it fixes (if it does). */
export interface FlowOwner { slug: string; value?: string }

/** entity → field → the update flows that change it. Such a change is the
 *  flow's job — it records who and when (a review, a decision) — so the
 *  dashboard never writes these fields itself; it opens the flow
 *  (check-dashboard gate 25). */
export const FLOW_OWNED: Record<string, Record<string, FlowOwner[]>> = {
  "rechnungen": {
    "kunde": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "berater": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "notizen": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "projekt": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "mehrwertsteuer": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "rechnungsdatum": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "abrechnungsjahr": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "rechnungsnummer": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "rechnungsstatus": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "abrechnungsmonat": [
      {
        "slug": "rechnung-erstellen"
      }
    ],
    "faelligkeitsdatum": [
      {
        "slug": "rechnung-erstellen"
      }
    ]
  },
  "kunden": {
    "ort": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "plz": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "email": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "re_ort": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "re_plz": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "notizen": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "strasse": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "telefon": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "ap_email": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "ap_titel": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "kundentyp": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "ap_telefon": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "ap_vorname": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "hausnummer": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "kundenname": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "re_strasse": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "ap_nachname": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "re_hausnummer": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "bevorzugte_kontaktart": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "letzter_kontakt_datum": [
      {
        "slug": "kunde-bearbeiten"
      }
    ],
    "letzter_kontakt_ansprechpartner": [
      {
        "slug": "kunde-bearbeiten"
      }
    ]
  },
  "angebote": {
    "freigabedatum": [
      {
        "slug": "freigaben-verwalten"
      }
    ],
    "freigabestatus": [
      {
        "slug": "freigaben-verwalten"
      }
    ],
    "freigabekommentar": [
      {
        "slug": "freigaben-verwalten"
      }
    ]
  }
};

/** The link that opens the flow owning `entity.field` with `recordId` already
 *  picked — `toValue` chooses between flows that fix different values (the
 *  approve flow vs the execute flow). null when no LIVE flow owns it (not
 *  built yet, or removed): the caller then offers no shortcut. */
export function flowLinkFor(entity: string, field: string, recordId: string, toValue?: string): string | null {
  const owners = (FLOW_OWNED[entity]?.[field] ?? []).filter(o => INTENTS.some(i => i.path === `/intents/${o.slug}`));
  const owner = (toValue !== undefined ? owners.find(o => o.value === toValue) : undefined)
    ?? owners.find(o => o.value === undefined)
    ?? owners[0];
  return owner ? `#/intents/${owner.slug}?record=${encodeURIComponent(recordId)}` : null;
}

/** flowLinkFor as a click handler — `action: go ? { label, onClick: go } : undefined`. */
export function flowActionFor(entity: string, field: string, recordId: string, toValue?: string): (() => void) | null {
  const href = flowLinkFor(entity, field, recordId, toValue);
  return href ? () => { window.location.hash = href.slice(1); } : null;
}
