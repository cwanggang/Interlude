// Screen 9: check-in history (B5). One card per day: symptoms, severity, change, and the patient's words.
import { useQuery } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { Badge, Card, ListItem, PageHeader, Screen, ScreenTitle, Text } from '../components';
import { formatDay } from '../i18n';
import { bi } from '../showEnglish';
import { usePatient } from '../usePatient';

export default function History() {
  const { patient, language, s } = usePatient();
  const entries = useQuery(api.patients.symptomEntries, patient ? { patientId: patient._id } : 'skip');
  const conversations = useQuery(api.patients.conversations, patient ? { patientId: patient._id } : 'skip');

  // G18: each call's one-line summary in the patient's language (English only on older rows).
  const summaries = new Map(
    (conversations ?? []).map((c) => [c._id, language === 'en' ? c.summaryEnglish : c.summaryPatientLang ? bi(c.summaryPatientLang, c.summaryEnglish, language) : c.summaryEnglish]),
  );

  const days = new Map<string, NonNullable<typeof entries>>();
  for (const e of entries ?? []) days.set(e.date, [...(days.get(e.date) ?? []), e]);

  return (
    <Screen header={<PageHeader title={s.historyTitle} />}>
      <ScreenTitle title={s.historyTitle} />
      {entries === undefined && <Text>{s.loading}</Text>}
      {entries?.length === 0 && <Text variant="muted">{s.noHistory}</Text>}
      {[...days].map(([date, list]) => (
        <Card key={date} title={formatDay(date, language)}>
          {[...new Set(list.map((e) => summaries.get(e.conversationId)))].map(
            (summary) => summary && <Text key={summary}>{summary}</Text>,
          )}
          {list.map((e) => (
            <ListItem
              key={e._id}
              title={language === 'es' ? bi(e.symptomOriginal, e.symptom, language) : e.symptom}
              subtitle={
                <>
                  <Text variant="quote">{language === 'es' ? bi(`“${e.quoteOriginal}”`, `“${e.quoteEnglish}”`, language) : `“${e.quoteEnglish}”`}</Text>
                  {e.change && <Text variant="muted">{s.change[e.change] ?? e.change}</Text>}
                </>
              }
              trailing={e.severity !== undefined ? <Badge label={s.severity(e.severity)} /> : undefined}
            />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
