// Onboarding (Figma 1.1 Welcome, 1.2 Log in, 1.3 Language, 1.4 Profile, 1.5 Daily call time,
// 1.6 Consent, 1.7 All set; A1, A3, F4). One screen that steps through the frames, then creates the
// patient. No real auth: "Log in" continues as the demo patient.
import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Text as RNText } from '../BiText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../../convex/_generated/api';
import { Button, Icon, IconCircle, ScreenTitle, Text, Toggle } from '../components';
import { icons } from '../icons';
import { formatTime, plain, t, type Language, type Strings } from '../i18n';
import { theme } from '../theme';

type Step = 'welcome' | 'login' | 'language' | 'profile' | 'time' | 'consent' | 'done';

const PHONE = /^\+1\d{10}$/;
/** Call times offered on 1.5: every half hour from 8:00 AM to 8:30 PM. */
const TIMES = Array.from({ length: 26 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** "18:30" as a time today, formatted for the language. */
function timeLabel(hhmm: string, language: Language): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return formatTime(d.getTime(), language);
}

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const create = useMutation(api.patients.create);
  const demo = useQuery(api.patients.getDemo);
  const [step, setStep] = useState<Step>('welcome');
  const [language, setLanguage] = useState<Language>('es');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [callTime, setCallTime] = useState('18:30');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = t(language);

  const back = (to: Step) => () => {
    setError(null);
    setStep(to);
  };

  const finish = async () => {
    if (!consent) return setError(s.consentRequired);
    setError(null);
    await create({
      name: name.trim(),
      phone: phone.replace(/[\s()-]/g, ''),
      language,
      callTimeLocal: callTime,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      consentCalls: true,
      reasonForVisit: reason.trim(),
    });
    setStep('done');
  };

  const pad = { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 28 };

  if (step === 'welcome') {
    return (
      <LinearGradient colors={['#daf6f3', '#e1e7ff', '#ffffff']} locations={[0, 0.456, 0.95]} start={{ x: 0, y: 0.3 }} end={{ x: 1, y: 0.7 }} style={{ flex: 1, ...pad, gap: 16 }}>
        <ScreenTitle title="Interlude" />
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setLanguage(language === 'es' ? 'en' : 'es')}
            style={{ height: 44, borderRadius: theme.radius.pill, backgroundColor: theme.color.surface, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}
          >
            <Icon name="globe-ink" size={20} />
            <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 18, color: theme.color.text }}>{language === 'es' ? 'ES / EN' : 'EN / ES'}</RNText>
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Image source={icons['mascot-greeting']} style={{ width: 220, height: 204 }} />
          <RNText style={{ fontFamily: theme.font.headingBold, fontSize: 62, letterSpacing: -1.86, color: theme.color.text }}>Interlude</RNText>
          <RNText style={{ fontFamily: theme.font.body, fontSize: 20, lineHeight: 28, color: theme.color.text, textAlign: 'center', maxWidth: 274 }}>{s.tagline}</RNText>
        </View>
        <Button big label={s.getStarted} onPress={() => setStep('language')} />
        <OutlineButton label={s.haveAccount} onPress={() => setStep('login')} />
        <RNText style={{ fontFamily: theme.font.body, fontSize: 18, lineHeight: 24, color: theme.color.textMuted, textAlign: 'center' }}>{s.termsNote}</RNText>
      </LinearGradient>
    );
  }

  if (step === 'done') {
    const [h, m] = callTime.split(':').map(Number);
    const now = new Date();
    const today = now.getHours() * 60 + now.getMinutes() < h * 60 + m;
    const day = today ? s.today : s.tomorrow;
    return (
      <LinearGradient colors={['#daf6f3', '#e1e7ff', '#ffffff']} style={{ flex: 1, ...pad, gap: 18 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <View style={{ width: 262, height: 260, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={icons['mascot-celebrate']} style={{ width: 214, height: 180, marginLeft: -3, marginTop: -10 }} />
          </View>
          <RNText style={{ fontFamily: theme.font.heading, fontSize: 34, color: theme.color.text, textAlign: 'center' }}>{s.allSet(name.trim().split(' ')[0])}</RNText>
          <RNText style={{ fontFamily: theme.font.body, fontSize: 18, lineHeight: 25, color: theme.color.textMuted, textAlign: 'center' }}>{s.allSetCall(day, timeLabel(callTime, language))}</RNText>
          <View style={{ alignSelf: 'stretch', backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, paddingHorizontal: 18, paddingVertical: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: 14 }}>
              <IconCircle name="phone-teal-20b" size={40} iconSize={20} />
              <View style={{ flex: 1 }}>
                <RNText style={{ fontFamily: theme.font.bodyMedium, fontSize: 17, color: theme.color.text }}>{s.firstCall}</RNText>
              </View>
              <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: 17, color: theme.color.primary }}>{`${day[0].toUpperCase()}${day.slice(1)}, ${timeLabel(callTime, language)}`}</RNText>
            </View>
          </View>
        </View>
        <Button big label={s.goHome} onPress={() => router.replace('/')} />
      </LinearGradient>
    );
  }

  if (step === 'login') {
    return (
      <OnboardingPage pad={pad} onBack={back('welcome')} footer={<Button big label={s.continueLabel} onPress={() => (demo ? router.replace('/') : setError(s.noLoginYet))} />}>
        <Title>{s.welcomeBack}</Title>
        <Text color={theme.color.textMuted}>{s.loginHint}</Text>
        <Field label={s.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+1 (502) 555-0123" />
        <View style={{ flex: 1 }} />
        <View style={{ backgroundColor: theme.color.primaryBg, borderRadius: theme.radius.lg, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="mascot-hello-44" size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: 16, color: theme.color.text }}>{s.demoTitle}</RNText>
            <RNText style={{ fontFamily: theme.font.body, fontSize: 16, color: theme.color.textMuted }}>{s.demoBody}</RNText>
          </View>
        </View>
        {error && <Text variant="error">{error}</Text>}
      </OnboardingPage>
    );
  }

  if (step === 'language') {
    return (
      <OnboardingPage pad={pad} onBack={back('welcome')} progress={1} s={s} footer={<Button big label={s.continueLabel} onPress={() => setStep('profile')} />}>
        <View style={{ gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#eef0ff', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="languages" size={28} />
          </View>
          <RNText style={{ fontFamily: theme.font.heading, fontSize: 34, lineHeight: 39, color: theme.color.text }}>Choose your language</RNText>
          <RNText style={{ fontFamily: theme.font.heading, fontSize: 28, lineHeight: 34, color: theme.color.textMuted }}>Elija su idioma</RNText>
          <Text color={theme.color.textMuted}>{s.languageHint}</Text>
        </View>
        <View style={{ gap: 14 }}>
          {(['es', 'en'] as const).map((lang) => {
            const selected = lang === language;
            return (
              <Pressable
                key={lang}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setLanguage(lang)}
                style={{ height: 92, borderRadius: 18, borderWidth: selected ? 2 : 1, borderColor: selected ? theme.color.primary : theme.color.border, backgroundColor: selected ? theme.color.primaryBg : theme.color.surface, flexDirection: 'row', alignItems: 'center', padding: 22, gap: 16 }}
              >
                <View style={{ flex: 1 }}>
                  <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 24, color: theme.color.text }}>{lang === 'es' ? 'Español' : 'English'}</RNText>
                </View>
                {selected ? <IconCircle name="check-white-20" size={32} iconSize={20} bg={theme.color.primary} /> : <Icon name="radio-unselected" size={32} />}
              </Pressable>
            );
          })}
        </View>
      </OnboardingPage>
    );
  }

  if (step === 'profile') {
    const next = () => {
      const cleanPhone = phone.replace(/[\s()-]/g, '');
      if (!name.trim() || !cleanPhone || !reason.trim()) return setError(s.required);
      if (!PHONE.test(cleanPhone)) return setError(s.invalidPhone);
      setError(null);
      setStep('time');
    };
    return (
      <OnboardingPage pad={pad} onBack={back('language')} progress={2} s={s} footer={<Button big label={s.continueLabel} onPress={next} />}>
        <Title>{s.aboutYourself}</Title>
        <View style={{ gap: 20 }}>
          <Field label={s.name} value={name} onChangeText={setName} />
          <Field label={s.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+1 (502) 555-0123" />
          <Field label={s.reasonShort} value={reason} onChangeText={setReason} placeholder={s.reasonPlaceholder} multiline />
        </View>
        <View style={{ backgroundColor: theme.color.bg, borderRadius: 18, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Icon name="calendar-check" size={24} />
          <View style={{ flex: 1 }}>
            <Text color={theme.color.textMuted}>{s.clinicHandles}</Text>
          </View>
        </View>
        {error && <Text variant="error">{error}</Text>}
      </OnboardingPage>
    );
  }

  if (step === 'time') {
    return (
      <OnboardingPage pad={pad} onBack={back('profile')} progress={3} s={s} footer={<Button big label={s.continueLabel} onPress={() => setStep('consent')} />}>
        <Title>{s.callTimeQuestion}</Title>
        <Text color={theme.color.textMuted}>{s.callTimeHintLong}</Text>
        <View style={{ backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, paddingHorizontal: 16, paddingVertical: 12, height: 5 * 52 + 24 }}>
          <ScrollView contentContainerStyle={{ gap: 4 }} showsVerticalScrollIndicator={false}>
            {TIMES.map((time) => {
              const selected = time === callTime;
              return (
                <Pressable
                  key={time}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setCallTime(time)}
                  style={{ height: selected ? 64 : 48, borderRadius: 16, backgroundColor: selected ? theme.color.primaryBg : 'transparent', alignItems: 'center', justifyContent: 'center' }}
                >
                  <RNText style={selected ? { fontFamily: theme.font.heading, fontSize: 30, color: theme.color.primary } : { fontFamily: theme.font.body, fontSize: 20, color: '#9ab0ba' }}>
                    {timeLabel(time, language)}
                  </RNText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </OnboardingPage>
    );
  }

  // consent
  return (
    <OnboardingPage pad={pad} onBack={back('time')} progress={4} s={s} footer={<Button big label={s.continueLabel} onPress={() => void finish()} />}>
      <View style={{ gap: 12 }}>
        <Title>{s.automatedCalls}</Title>
        <Text color={theme.color.textMuted}>{s.consentBody(timeLabel(callTime, language))}</Text>
      </View>
      <View style={{ backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: 20, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text variant="strong">{s.consentAgree}</Text>
          </View>
          <Toggle label={s.consentAgree} value={consent} onChange={setConsent} />
        </View>
        <Text variant="muted">{s.consentStopAnytime}</Text>
      </View>
      <SafetyNoticeIn s={s} />
      {error && <Text variant="error">{error}</Text>}
    </OnboardingPage>
  );
}

/** White page with the back chevron, the 4-step progress track, scrolling content and a pinned button. */
function OnboardingPage({ pad, onBack, progress, s, footer, children }: { pad: object; onBack: () => void; progress?: number; s?: Strings; footer: ReactNode; children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.surface, ...pad }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron-left-24" size={24} />
        </Pressable>
        {progress !== undefined && s && (
          <>
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
              {[1, 2, 3, 4].map((n) => (
                <View key={n} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: n <= progress ? theme.color.primary : theme.color.border }} />
              ))}
            </View>
            <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 18, color: theme.color.textMuted }}>{s.stepOf(progress)}</RNText>
          </>
        )}
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 24 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={{ paddingTop: 16 }}>{footer}</View>
    </View>
  );
}

function Title({ children }: { children: string }) {
  return <RNText style={{ fontFamily: theme.font.heading, fontSize: 32, lineHeight: 37, color: theme.color.text }}>{children}</RNText>;
}

/** Labeled input (1.2, 1.4): semibold label, 60 px rounded field, 20 px text. */
function Field({ label, value, onChangeText, placeholder, multiline, keyboardType }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: 'phone-pad' }) {
  return (
    <View style={{ gap: 8 }}>
      <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 18, color: theme.color.text }}>{label}</RNText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder && plain(placeholder)}
        placeholderTextColor={theme.color.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        style={{
          minHeight: multiline ? 112 : 60,
          borderWidth: 1.5,
          borderColor: theme.color.border,
          borderRadius: 18,
          padding: 16,
          fontFamily: theme.font.body,
          fontSize: 20,
          color: theme.color.text,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function OutlineButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ height: 60, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: 20, color: theme.color.text }}>{label}</RNText>
    </Pressable>
  );
}

/** 1.6 safety notice in the language just chosen (SafetyNotice reads the saved patient's). */
function SafetyNoticeIn({ s }: { s: Strings }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, backgroundColor: theme.color.coralBg }}>
      <Icon name="alert" size={20} />
      <View style={{ flex: 1 }}>
        <RNText style={{ fontFamily: theme.font.bodyMedium, fontSize: 16, lineHeight: 22, color: theme.color.text }}>{s.safetyTitle}</RNText>
      </View>
    </View>
  );
}

