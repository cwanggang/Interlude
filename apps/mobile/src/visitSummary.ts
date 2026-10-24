// VisitSummary v2 (SPEC.md "Visit summary JSON v2"). Visits store it as v.any(), and summaries
// written before Track A's block A2 are v1 (plain strings, no times_of_day), so v2 fields are
// optional and list items may be strings.

export type Slot = 'morning' | 'midday' | 'evening' | 'bedtime';
export type SummaryItem = string | { text: string; source_turn?: number };

export type VisitSummary = {
  assessment?: string;
  medications?: {
    key?: string;
    name: string;
    dose: string;
    schedule: string;
    times_of_day?: Slot[];
    purpose: string;
    change?: 'new' | 'changed' | 'same' | 'stopped';
  }[];
  instructions?: SummaryItem[];
  tests_ordered?: SummaryItem[];
  follow_up?: string;
  warning_signs?: string[];
};

export const itemText = (item: SummaryItem) => (typeof item === 'string' ? item : item.text);

const SLOT_ORDER: Slot[] = ['morning', 'midday', 'evening', 'bedtime'];

export type Dose = { key: string; name: string; dose: string; slot: Slot | null; schedule: string };

/** G3: one row per medication per time of day, skipping stopped ones, in time-of-day order. */
export function todaysDoses(summary: VisitSummary): Dose[] {
  const doses: Dose[] = [];
  for (const m of summary.medications ?? []) {
    if (m.change === 'stopped') continue;
    const key = m.key ?? m.name.toLowerCase();
    const slots = m.times_of_day?.length ? m.times_of_day : [null];
    for (const slot of slots) doses.push({ key, name: m.name, dose: m.dose, slot, schedule: m.schedule });
  }
  const rank = (slot: Slot | null) => (slot ? SLOT_ORDER.indexOf(slot) : SLOT_ORDER.length);
  return doses.sort((a, b) => rank(a.slot) - rank(b.slot));
}

/** The summary in the patient's language, falling back to English. */
export function summaryFor(
  visit: { summaryEnglish?: unknown; summaryPatientLang?: unknown },
  language: 'en' | 'es',
): VisitSummary | undefined {
  return (language === 'en' ? visit.summaryEnglish : (visit.summaryPatientLang ?? visit.summaryEnglish)) as VisitSummary | undefined;
}
