// No real auth: the app is the first (seeded) patient. Every screen reads its patient,
// current appointment and strings from here.
import { useQuery } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import { stringsFor, type Language } from './i18n';
import { useShowEnglish } from './showEnglish';

export function usePatient() {
  const patient = useQuery(api.patients.getDemo);
  const appointment = useQuery(api.appointments.current, patient ? { patientId: patient._id } : 'skip');
  const language: Language = patient?.language ?? 'es';
  const showEnglish = useShowEnglish();
  return {
    /** undefined while loading, null when no patient exists yet (show onboarding). */
    patient,
    appointment: patient ? appointment : null,
    language,
    s: stringsFor(language, showEnglish),
    /** Demo "Show English": small English under Spanish labels and data. */
    showEnglish: showEnglish && language === 'es',
  };
}
