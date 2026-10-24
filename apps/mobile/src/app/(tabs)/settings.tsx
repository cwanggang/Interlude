// Settings and onboarding (A1, A3, F4, G14). Profile, language, daily call time, consent to
// automated calls (confirm before turning it off), text size, notifications, the appointment
// (read-only: the clinic sets it), and the safety notice. With no patient yet, it's onboarding.
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { api } from '../../../../../convex/_generated/api';
import { Button, Card, Choice, ListItem, Screen, ScreenTitle, Text, TextField } from '../../components';
import { formatDate, t, type Language } from '../../i18n';
import { theme } from '../../theme';
import { usePatient } from '../../usePatient';

const PHONE = /^\+1\d{10}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type TextSize = 'normal' | 'large' | 'xlarge';

export default function Settings() {
  const { patient, appointment } = usePatient();
  const create = useMutation(api.patients.create);
  const update = useMutation(api.patients.update);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState<Language>('es');
  const [callTime, setCallTime] = useState('18:30');
  const [reason, setReason] = useState('');
  const [consent, setConsent] = useState(false);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [textSize, setTextSize] = useState<TextSize>('normal');
  const [notifications, setNotifications] = useState(true);
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
    setTextSize(patient.textSize ?? 'normal');
    setNotifications(patient.notificationsEnabled ?? true);
    setLoaded(true);
  }, [patient, loaded]);

  // The form follows the language being chosen, so a Spanish speaker can switch before saving.
  const s = t(language);
  const isNew = patient === null;

  const onConsentChange = (value: boolean) => {
    setSaved(false);
    // F4: turning calls off for an existing patient asks first.
    if (!value && patient?.consentCalls) setConfirmingOff(true);
    else setConsent(value);
  };

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
    // Onboarding needs consent; an existing patient may turn calls off.
    if (isNew && !fields.consentCalls) return setError(s.consentRequired);
    setError(null);
    if (patient) {
      await update({ patientId: patient._id, ...fields, textSize, notificationsEnabled: notifications });
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
      <ScreenTitle title={isNew ? s.welcomeTitle : s.tabSettings} />
      <Card>
        <TextField label={s.name} value={name} onChangeText={setName} />
        <TextField label={s.phone} value={phone} onChangeText={setPhone} hint={s.phoneHint} keyboardType="phone-pad" />
        <TextField label={s.reason} value={reason} onChangeText={setReason} multiline />
      </Card>
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
        <TextField
          label={s.callTime}
          value={callTime}
          onChangeText={setCallTime}
          hint={s.callTimeHint}
          keyboardType="numbers-and-punctuation"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
          <View style={{ flex: 1 }}>
            <Text>{s.consent}</Text>
          </View>
          <Switch value={consent} onValueChange={onConsentChange} accessibilityLabel={s.consent} />
        </View>
        {confirmingOff && (
          <Card tone="danger">
            <Text>{s.consentOffConfirm}</Text>
            <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={s.turnOff}
                  variant="danger"
                  onPress={() => {
                    setConsent(false);
                    setConfirmingOff(false);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={s.cancel} variant="secondary" onPress={() => setConfirmingOff(false)} />
              </View>
            </View>
          </Card>
        )}
      </Card>
      {!isNew && (
        <>
          <Card>
            <Text variant="heading">{s.textSize}</Text>
            <Choice
              value={textSize}
              onChange={setTextSize}
              options={(['normal', 'large', 'xlarge'] as const).map((size) => ({ value: size, label: s.textSizes[size] }))}
            />
          </Card>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
              <View style={{ flex: 1, gap: theme.space.xs }}>
                <Text variant="heading">{s.notifications}</Text>
                <Text variant="muted">{s.notificationsHint}</Text>
              </View>
              <Switch value={notifications} onValueChange={setNotifications} accessibilityLabel={s.notifications} />
            </View>
          </Card>
          {appointment && (
            <Card title={s.myAppointment}>
              <ListItem title={appointment.doctorName} subtitle={formatDate(appointment.scheduledAt, language, true)} />
              {appointment.clinicName && <Text>{appointment.clinicName}</Text>}
              <Text variant="muted">{s.appointmentReadOnly}</Text>
            </Card>
          )}
        </>
      )}
      <Card title={s.about}>
        <Text>{s.prototypeNotice}</Text>
        <Text variant="muted">{s.notMedicalAdvice}</Text>
      </Card>
      {error && <Text variant="error">{error}</Text>}
      {saved && <Text>{s.saved}</Text>}
    </Screen>
  );
}
