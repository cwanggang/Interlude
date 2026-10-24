// Screen 5: onboarding and profile. A1 fields, A3 language switch, F4 consent to automated calls.
import { useMutation } from 'convex/react';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import { Button, Card, Choice, Screen, Text, TextField } from '../components';
import { t, type Language } from '../i18n';
import { theme } from '../theme';
import { usePatient } from '../usePatient';

const PHONE = /^\+1\d{10}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function Profile() {
  const { patient } = usePatient();
  const create = useMutation(api.patients.create);
  const update = useMutation(api.patients.update);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState<Language>('es');
  const [callTime, setCallTime] = useState('18:30');
  const [reason, setReason] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fill the form once from the saved profile.
  useEffect(() => {
    if (!patient || loaded) return;
    setName(patient.name);
    setPhone(patient.phone);
    setLanguage(patient.language);
    setCallTime(patient.callTimeLocal);
    setReason(patient.reasonForVisit);
    setConsent(patient.consentCalls);
    setLoaded(true);
  }, [patient, loaded]);

  // The form follows the language being chosen, so a Spanish speaker can switch before saving.
  const s = t(language);
  const isNew = patient === null;

  const onSave = async () => {
    setSaved(false);
    const fields = {
      name: name.trim(),
      phone: phone.replace(/[\s()-]/g, ''),
      language,
      callTimeLocal: callTime.trim(),
      reasonForVisit: reason.trim(),
      consentCalls: consent,
    };
    if (!fields.name || !fields.phone || !fields.callTimeLocal || !fields.reasonForVisit) return setError(s.required);
    if (!PHONE.test(fields.phone)) return setError(s.invalidPhone);
    if (!TIME.test(fields.callTimeLocal)) return setError(s.invalidTime);
    if (!fields.consentCalls) return setError(s.consentRequired);
    setError(null);
    if (patient) {
      await update({ patientId: patient._id, ...fields });
      setSaved(true);
    } else {
      await create({ ...fields, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      router.replace('/');
    }
  };

  if (patient === undefined) {
    return (
      <Screen>
        <Text>{s.loading}</Text>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button big label={s.save} onPress={() => void onSave()} />}>
      <Stack.Screen options={{ title: isNew ? s.welcomeTitle : s.profileTitle }} />
      <Card>
        <Text variant="heading">{s.language}</Text>
        <Choice
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'es', label: 'Español' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Card>
      <Card>
        <TextField label={s.name} value={name} onChangeText={setName} />
        <TextField label={s.phone} value={phone} onChangeText={setPhone} hint={s.phoneHint} keyboardType="phone-pad" />
        <TextField
          label={s.callTime}
          value={callTime}
          onChangeText={setCallTime}
          hint={s.callTimeHint}
          keyboardType="numbers-and-punctuation"
        />
        <TextField label={s.reason} value={reason} onChangeText={setReason} multiline />
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
          <View style={{ flex: 1 }}>
            <Text>{s.consent}</Text>
          </View>
          <Switch value={consent} onValueChange={setConsent} accessibilityLabel={s.consent} />
        </View>
        <Text variant="muted">{s.notMedicalAdvice}</Text>
      </Card>
      {error && <Text variant="error">{error}</Text>}
      {saved && <Text>{s.saved}</Text>}
    </Screen>
  );
}
