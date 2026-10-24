// Screen 9: check-in history (B5). One card per day: symptoms, severity, change, and the patient's words.
import { useQuery } from 'convex/react';
import { Stack } from 'expo-router';

import { api } from '../../../../convex/_generated/api';
import { Badge, Card, ListItem, Screen, Text } from '../components';
import { formatDay } from '../i18n';
import { usePatient } from '../usePatient';

export default function History() {
  const { patient, language, s } = usePatient();
  const entries = useQuery(api.patients.symptomEntries, patient ? { patientId: patient._id } : 'skip');

  const days = new Map<string, NonNullable<typeof entries>>();
  for (const e of entries ?? []) days.set(e.date, [...(days.get(e.date) ?? []), e]);

  return (
    <Screen>
      <Stack.Screen options={{ title: s.historyTitle }} />
      {entries === undefined && <Text>{s.loading}</Text>}
      {entries?.length === 0 && <Text variant="muted">{s.noHistory}</Text>}
      {[...days].map(([date, list]) => (
        <Card key={date} title={formatDay(date, language)}>
          {list.map((e) => (
            <ListItem
              key={e._id}
              title={language === 'es' ? e.symptomOriginal : e.symptom}
              subtitle={
                <>
                  <Text variant="quote">“{language === 'es' ? e.quoteOriginal : e.quoteEnglish}”</Text>
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
