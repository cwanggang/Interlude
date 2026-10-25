// Settings (Figma 4.2, 4.3; A1, A3, F4, G14). Profile card with Edit; language; call time and
// automated calls (turning them off asks first); notifications; the appointment, read-only; about
// and safety; sign out. Changes save as they're made. With no patient yet, onboarding takes over.
import { useMutation } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, Text as RNText, View } from 'react-native';

import { api } from '../../../../../convex/_generated/api';
import { AskButton, Button, Card, Divider, Icon, IconCircle, Screen, ScreenTitle, SectionLabel, Text, TextField, Toggle } from '../../components';
import { icons } from '../../icons';
import { formatTime, type Language, type Strings } from '../../i18n';
import { theme } from '../../theme';
import { usePatient } from '../../usePatient';

const PHONE = /^\+1\d{10}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "+15025550123" → "+1 (502) 555-0123". */
function prettyPhone(phone: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : phone;
}

/** "18:30" as a time today, for formatting in the patient's language. */
function callTimeLabel(hhmm: string, language: Language): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return formatTime(d.getTime(), language);
}

export default function Settings() {
  const { patient, appointment, language, s } = usePatient();
  const update = useMutation(api.patients.update);
  const [confirmStop, setConfirmStop] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (patient === undefined) {
    return (
      <Screen>
        <Text>{s.loading}</Text>
      </Screen>
    );
  }
  if (patient === null) return <Redirect href="/onboarding" />;

  const save = (fields: Omit<Parameters<typeof update>[0], 'patientId'>) => void update({ patientId: patient._id, ...fields });

  return (
    <Screen>
      <ScreenTitle title={s.tabSettings} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{s.tabSettings}</Text>
        </View>
        <AskButton />
      </View>

      <ProfileCard name={patient.name} phone={patient.phone} reason={patient.reasonForVisit} s={s} onSave={save} />

      <SectionLabel icon="globe" label={s.languageSection} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['es', 'en'] as const).map((lang) =>
          lang === patient.language ? (
            <View key={lang} style={{ flex: 1 }}>
              <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ height: 60, borderRadius: theme.radius.xl, alignItems: 'center', justifyContent: 'center' }}>
                <RNText style={{ fontFamily: theme.font.heading, fontSize: theme.font.size.lg, letterSpacing: -0.44, color: theme.color.primaryText }}>{lang === 'es' ? 'Español' : 'English'}</RNText>
              </LinearGradient>
            </View>
          ) : (
            <Pressable
              key={lang}
              accessibilityRole="button"
              onPress={() => save({ language: lang })}
              style={{ flex: 1, height: 60, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' }}
            >
              <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: theme.font.size.md, color: theme.color.text }}>{lang === 'es' ? 'Español' : 'English'}</RNText>
            </Pressable>
          ),
        )}
      </View>

      <SectionLabel icon="phone-muted-16" label={s.callsSection} />
      <Card gap={0}>
        <CallTimeRow value={patient.callTimeLocal} language={language} s={s} onSave={(callTimeLocal) => save({ callTimeLocal })} />
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: 14 }}>
          <IconCircle name="phone-teal-18" size={36} iconSize={18} />
          <View style={{ flex: 1 }}>
            <Text>{s.automatedCalls}</Text>
          </View>
          <Toggle label={s.automatedCalls} value={patient.consentCalls} onChange={(on) => (on ? save({ consentCalls: true }) : setConfirmStop(true))} />
        </View>
        <View style={{ paddingBottom: 14 }}>
          <RNText style={{ fontFamily: theme.font.body, fontSize: 14, lineHeight: 14 * 1.4, color: theme.color.textMuted }}>{s.automatedCallsHint}</RNText>
        </View>
      </Card>

      {/* One stored setting (patients.notificationsEnabled) drives both switches for now. */}
      <SectionLabel icon="bell-16" label={s.notificationsSection} />
      <Card gap={0}>
        <ToggleRow label={s.callReminders} value={patient.notificationsEnabled ?? true} onChange={(on) => save({ notificationsEnabled: on })} />
        <Divider />
        <ToggleRow label={s.summaryReadyNotif} value={patient.notificationsEnabled ?? true} onChange={(on) => save({ notificationsEnabled: on })} />
      </Card>

      {appointment && (
        <>
          <SectionLabel icon="lock" label={s.appointmentSection} />
          <View style={{ backgroundColor: theme.color.bg, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, paddingHorizontal: 18, paddingVertical: 4 }}>
            <ReadOnlyRow label={s.doctorLabel} value={appointment.doctorName} />
            <Divider />
            <ReadOnlyRow
              label={s.dateLabel}
              value={`${new Date(appointment.scheduledAt).toLocaleDateString(language === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' })} · ${formatTime(appointment.scheduledAt, language)}`}
            />
            {appointment.clinicName && (
              <>
                <Divider />
                <ReadOnlyRow label={s.clinicLabel} value={appointment.clinicName} />
              </>
            )}
          </View>
        </>
      )}

      <SectionLabel icon="info-16" label={s.aboutSection} />
      <View style={{ backgroundColor: theme.color.coralBg, borderRadius: theme.radius.lg, padding: 20, gap: 6 }}>
        <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: theme.font.size.sm, lineHeight: theme.font.size.sm * 1.4, color: theme.color.text }}>{s.safetyTitle}</RNText>
        <RNText style={{ fontFamily: theme.font.body, fontSize: 14, color: theme.color.textMuted }}>{s.prototypeShort}</RNText>
      </View>

      <Card gap={0}>
        <Pressable accessibilityRole="button" onPress={() => setNotice(s.signOutDemo)} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: 14 }}>
          <Icon name="logout" size={22} />
          <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 17, color: '#e5484d' }}>{s.signOut}</RNText>
        </Pressable>
        {notice && <Text variant="muted">{notice}</Text>}
      </Card>

      <StopCallsConfirm
        visible={confirmStop}
        s={s}
        onKeep={() => setConfirmStop(false)}
        onStop={() => {
          setConfirmStop(false);
          save({ consentCalls: false });
        }}
      />
    </Screen>
  );
}

/** Teal-to-blue profile card with an initial, name, phone and reason; Edit opens the fields. */
function ProfileCard({ name, phone, reason, s, onSave }: { name: string; phone: string; reason: string; s: Strings; onSave: (fields: { name: string; phone: string; reasonForVisit: string }) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name, phone, reason });
  const [error, setError] = useState<string | null>(null);
  const white85 = 'rgba(255,255,255,0.85)';

  const submit = () => {
    const fields = { name: draft.name.trim(), phone: draft.phone.replace(/[\s()-]/g, ''), reasonForVisit: draft.reason.trim() };
    if (!fields.name || !fields.phone || !fields.reasonForVisit) return setError(s.required);
    if (!PHONE.test(fields.phone)) return setError(s.invalidPhone);
    setError(null);
    onSave(fields);
    setEditing(false);
  };

  return (
    <View style={{ borderRadius: theme.radius.lg, overflow: 'hidden' }}>
      <LinearGradient colors={['#087d8d', '#3e7fd6']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ padding: 22, gap: 14 }}>
        <Image source={icons['profile-ellipse-1']} style={{ position: 'absolute', width: 340, height: 340, left: 223, top: -50 }} />
        <Image source={icons['profile-ellipse-2']} style={{ position: 'absolute', width: 400, height: 400, left: 131, top: -210 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' }}>
            <RNText style={{ fontFamily: theme.font.heading, fontSize: 26, color: theme.color.primary }}>{name.trim()[0]?.toUpperCase()}</RNText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" color={theme.color.primaryText}>{name}</Text>
            <RNText style={{ fontFamily: theme.font.body, fontSize: 15, color: white85 }}>{prettyPhone(phone)}</RNText>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDraft({ name, phone, reason });
              setEditing(!editing);
            }}
            style={{ backgroundColor: theme.color.surface, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 14, color: theme.color.primary }}>{editing ? s.cancel : s.edit}</RNText>
          </Pressable>
        </View>
        {editing ? (
          <View style={{ backgroundColor: theme.color.surface, borderRadius: 14, padding: 14, gap: theme.space.md }}>
            <TextField label={s.name} value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} />
            <TextField label={s.phone} value={draft.phone} onChangeText={(v) => setDraft({ ...draft, phone: v })} hint={s.phoneHint} keyboardType="phone-pad" />
            <TextField label={s.reasonShort} value={draft.reason} onChangeText={(v) => setDraft({ ...draft, reason: v })} multiline />
            {error && <Text variant="error">{error}</Text>}
            <Button label={s.save} onPress={submit} />
          </View>
        ) : (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 2 }}>
            <RNText style={{ fontFamily: theme.font.body, fontSize: theme.font.size.xs, color: white85 }}>{s.reasonShort}</RNText>
            <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: theme.font.size.sm, color: theme.color.primaryText }}>{reason}</RNText>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

/** "When should we call you?" with the time; tapping opens a 24-hour field. */
function CallTimeRow({ value, language, s, onSave }: { value: string; language: Language; s: Strings; onSave: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => { setDraft(value); setEditing(!editing); }} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: 14 }}>
        <IconCircle name="clock" size={36} iconSize={18} />
        <View style={{ flex: 1 }}>
          <Text>{s.callTimeQuestion}</Text>
        </View>
        <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 17, color: theme.color.primary }}>{callTimeLabel(value, language)}</RNText>
        <Icon name="chevron-right-20" size={20} />
      </Pressable>
      {editing && (
        <View style={{ gap: theme.space.sm, paddingBottom: 14 }}>
          <TextField value={draft} onChangeText={setDraft} hint={s.callTimeHint} keyboardType="numbers-and-punctuation" />
          {error && <Text variant="error">{error}</Text>}
          <Button
            label={s.save}
            onPress={() => {
              if (!TIME.test(draft.trim())) return setError(s.invalidTime);
              setError(null);
              onSave(draft.trim());
              setEditing(false);
            }}
          />
        </View>
      )}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: 14 }}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
      </View>
      <Toggle label={label} value={value} onChange={onChange} />
    </View>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: 14 }}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
      </View>
      <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 17, color: theme.color.primary }}>{value}</RNText>
    </View>
  );
}

/** 4.3: "Stop daily calls?" over a dimmed screen (F4). */
function StopCallsConfirm({ visible, s, onKeep, onStop }: { visible: boolean; s: Strings; onKeep: () => void; onStop: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeep}>
      <View style={{ flex: 1, backgroundColor: 'rgba(13,42,58,0.55)', justifyContent: 'center', paddingHorizontal: theme.space.xl }}>
        <View style={{ backgroundColor: theme.color.surface, borderRadius: 28, padding: 26, gap: theme.space.lg, alignItems: 'center' }}>
          <Icon name="mascot-concern-72" size={72} />
          <RNText style={{ fontFamily: theme.font.heading, fontSize: 26, color: theme.color.text, textAlign: 'center' }}>{s.stopCallsTitle}</RNText>
          <RNText style={{ fontFamily: theme.font.body, fontSize: 17, lineHeight: 17 * 1.4, color: theme.color.textMuted, textAlign: 'center' }}>{s.stopCallsBody}</RNText>
          <View style={{ alignSelf: 'stretch', gap: theme.space.lg }}>
            <Button big label={s.keepCalls} onPress={onKeep} />
            <Pressable
              accessibilityRole="button"
              onPress={onStop}
              style={{ height: 60, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: theme.font.size.md, color: theme.color.textMuted }}>{s.yesStop}</RNText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
