// Screen 4: question queue (B6). Add, edit, delete, reorder; voice questions from calls are tagged.
import { useMutation, useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { Badge, Button, Card, Screen, Text, TextField } from '../components';
import type { Strings } from '../i18n';
import { theme } from '../theme';
import { usePatient } from '../usePatient';

export default function Questions() {
  const { patient, appointment, s } = usePatient();
  const questions = useQuery(api.questions.listForAppointment, appointment ? { appointmentId: appointment._id } : 'skip');
  const add = useMutation(api.questions.add);
  const reorder = useMutation(api.questions.reorder);
  const [draft, setDraft] = useState('');

  if (!patient || !appointment) {
    return (
      <Screen>
        <Stack.Screen options={{ title: s.questionsTitle }} />
        <Text>{patient === undefined || appointment === undefined ? s.loading : s.noVisit}</Text>
      </Screen>
    );
  }

  const onAdd = async () => {
    if (!draft.trim()) return;
    await add({ patientId: patient._id, appointmentId: appointment._id, text: draft });
    setDraft('');
  };

  const move = (index: number, by: -1 | 1) => {
    if (!questions) return;
    const ids = questions.map((q) => q._id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    void reorder({ appointmentId: appointment._id, orderedIds: ids });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: s.questionsTitle }} />
      <Card title={s.addQuestion}>
        <TextField value={draft} onChangeText={setDraft} placeholder={s.questionPlaceholder} multiline />
        <Button label={s.add} onPress={() => void onAdd()} disabled={!draft.trim()} />
      </Card>
      {questions === undefined && <Text>{s.loading}</Text>}
      {questions?.length === 0 && <Text variant="muted">{s.noQuestions}</Text>}
      {questions?.map((q, i) => (
        <QuestionRow
          key={q._id}
          question={q}
          s={s}
          onUp={i > 0 ? () => move(i, -1) : undefined}
          onDown={i < questions.length - 1 ? () => move(i, 1) : undefined}
        />
      ))}
    </Screen>
  );
}

function QuestionRow({
  question,
  s,
  onUp,
  onDown,
}: {
  question: Doc<'questions'>;
  s: Strings;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const edit = useMutation(api.questions.edit);
  const remove = useMutation(api.questions.remove);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(question.textOriginal);

  const save = async (id: Id<'questions'>) => {
    if (!text.trim()) return;
    await edit({ questionId: id, text });
    setEditing(false);
  };

  return (
    <Card>
      {editing ? (
        <TextField value={text} onChangeText={setText} multiline />
      ) : (
        <Text>{question.textOriginal}</Text>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
        <Badge tone={question.source === 'voice' ? 'primary' : 'neutral'} label={question.source === 'voice' ? s.sourceVoice : s.sourceTyped} />
        {question.status === 'answered' && <Badge tone="success" label={s.answered} />}
      </View>
      {editing ? (
        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          <View style={{ flex: 1 }}>
            <Button label={s.save} onPress={() => void save(question._id)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={s.cancel}
              variant="secondary"
              onPress={() => {
                setText(question.textOriginal);
                setEditing(false);
              }}
            />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          <Button label={s.edit} variant="secondary" onPress={() => setEditing(true)} />
          <Button label={s.delete} variant="danger" onPress={() => void remove({ questionId: question._id })} />
          {onUp && <Button label={`↑ ${s.moveUp}`} variant="secondary" onPress={onUp} />}
          {onDown && <Button label={`↓ ${s.moveDown}`} variant="secondary" onPress={onDown} />}
        </View>
      )}
    </Card>
  );
}
