// Chat (Figma 5.1 empty, 5.2 conversation, 5.3 listening; G16, F2). Opens a session on mount
// (chat.start); suggested prompts when empty; bubbles (patient on the right, teal); visit answers show
// the passage they came from; a text box with send and the big mic, which records a clip. A
// red-flag reply opens "Call 911 now" (5.4, G17).
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text as RNText, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { Icon, ScreenTitle, StatusChip, Text } from '../components';
import { icons } from '../icons';
import type { Strings } from '../i18n';
import { theme } from '../theme';
import { useClipRecorder } from '../useClipRecorder';
import { usePatient } from '../usePatient';

const CITATION_CHARS = 220;

type Message = FunctionReturnType<typeof api.chat.messages>[number];

export default function Chat() {
  const insets = useSafeAreaInsets();
  const { patient, language, s } = usePatient();
  const start = useMutation(api.chat.start);
  const send = useMutation(api.chat.send);
  const end = useMutation(api.chat.end);
  const [conversationId, setConversationId] = useState<Id<'conversations'> | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messages = useQuery(api.chat.messages, conversationId ? { conversationId } : 'skip');
  const scroll = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void } | null>(null);
  const starting = useRef(false);
  const seenRedFlags = useRef(new Set<string>());

  // One session per opening of the screen.
  useEffect(() => {
    if (!patient || starting.current) return;
    starting.current = true;
    start({ patientId: patient._id })
      .then((r) => setConversationId(r.conversationId))
      .catch(() => setError(s.chatError));
  }, [patient, start, s.chatError]);

  // G17: a red-flag reply opens the full-screen 911 screen once.
  useEffect(() => {
    for (const m of messages ?? []) {
      if (m.redFlag && !seenRedFlags.current.has(m._id)) {
        seenRedFlags.current.add(m._id);
        router.push('/emergency');
      }
    }
  }, [messages]);

  const waiting = messages?.at(-1)?.pending === true;

  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId || waiting) return;
    setError(null);
    setDraft('');
    try {
      await send({ conversationId, text: trimmed });
    } catch {
      setDraft(trimmed);
      setError(s.chatError);
    }
  };

  const mic = useClipRecorder(language, (text) => void sendText(text));

  const close = () => {
    // Ending runs the same pipeline as a call, so symptoms land on the timeline.
    if (conversationId) void end({ conversationId });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const empty = messages !== undefined && messages.length === 0;

  return (
    <LinearGradient colors={['#e6f6f6', '#f1f8fa', '#eef1ff']} style={{ flex: 1, paddingTop: insets.top }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenTitle title={s.assistant} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.xl, paddingTop: theme.space.md, paddingBottom: theme.space.sm }}>
          <Pressable accessibilityRole="button" accessibilityLabel={s.close} onPress={close} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close-x" size={22} />
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <RNText style={{ fontFamily: theme.font.heading, fontSize: 24, color: theme.color.text }}>{s.assistant}</RNText>
            <RNText style={{ fontFamily: theme.font.body, fontSize: 14, color: theme.color.textMuted }}>{s.chatDisclaimer}</RNText>
          </View>
          <Icon name="mascot-hello-40" size={40} />
        </View>

        <ScrollView
          ref={(view) => {
            scroll.current = view;
          }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: empty ? 'center' : 'flex-end', paddingHorizontal: theme.space.xl, paddingVertical: theme.space.lg, gap: 14 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {empty && mic.state === 'idle' && <EmptyState s={s} disabled={!conversationId} onPick={(text) => void sendText(text)} />}
          {messages?.map((m) => (
            <Bubble key={m._id} message={m} s={s} />
          ))}
          {mic.state === 'recording' && empty && <AssistantBubble text={s.howCanIHelp} />}
          {mic.state === 'recording' && (
            <View style={{ backgroundColor: theme.color.surface, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, gap: 6 }}>
              <StatusChip label={s.live} color={theme.color.danger} bg={theme.color.coralBg} />
              <RNText style={{ fontFamily: theme.font.bodyMedium, fontSize: 20, lineHeight: 28, color: theme.color.text }}>{s.speakNow}</RNText>
            </View>
          )}
        </ScrollView>

        {(error || mic.error) && (
          <View style={{ paddingHorizontal: theme.space.xl }}>
            <Text variant="error">{error ?? (mic.error === 'empty' ? s.micEmpty : s.micUnavailable)}</Text>
          </View>
        )}

        <View style={{ paddingHorizontal: theme.space.xl, paddingTop: theme.space.sm, paddingBottom: theme.space.lg + insets.bottom }}>
          {mic.state === 'idle' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, height: 60, borderRadius: 30, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, gap: theme.space.sm }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={s.typeHere}
                  placeholderTextColor="#9ab0ba"
                  accessibilityLabel={s.chatPlaceholder}
                  onSubmitEditing={() => void sendText(draft)}
                  returnKeyType="send"
                  style={{ flex: 1, fontFamily: theme.font.body, fontSize: theme.font.size.md, color: theme.color.text, paddingVertical: 0 }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={s.send}
                  onPress={() => void sendText(draft)}
                  disabled={!draft.trim() || waiting || !conversationId}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.primaryBg, alignItems: 'center', justifyContent: 'center', opacity: !draft.trim() || waiting ? 0.5 : 1 }}
                >
                  <Icon name="send" size={20} />
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={s.micStart}
                onPress={() => void mic.start()}
                disabled={waiting || !conversationId}
                style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: theme.color.primary, alignItems: 'center', justifyContent: 'center', opacity: waiting || !conversationId ? 0.5 : 1 }}
              >
                <Icon name="mic-white-34" size={34} />
              </Pressable>
            </View>
          ) : (
            <Listening state={mic.state} seconds={mic.seconds} s={s} onStop={() => void mic.stop()} />
          )}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

/** 5.1: the large mascot, "How can I help you?" and the three suggested prompts. */
function EmptyState({ s, disabled, onPick }: { s: Strings; disabled: boolean; onPick: (text: string) => void }) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={icons['mascot-hello-large']} style={{ width: 121, height: 121, marginLeft: -2, marginTop: 7 }} />
        </View>
      </View>
      <RNText style={{ fontFamily: theme.font.heading, fontSize: 28, color: theme.color.text, textAlign: 'center' }}>{s.howCanIHelp}</RNText>
      {s.suggestions.map((suggestion) => (
        <Pressable
          key={suggestion}
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onPick(suggestion)}
          style={{ height: 60, borderRadius: 20, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 16, gap: theme.space.sm, opacity: disabled ? 0.6 : 1 }}
        >
          <View style={{ flex: 1 }}>
            <RNText style={{ fontFamily: theme.font.bodyMedium, fontSize: theme.font.size.md, color: theme.color.text }}>{suggestion}</RNText>
          </View>
          <Icon name="chevron-right-teal" size={20} />
        </Pressable>
      ))}
    </View>
  );
}

function AssistantBubble({ text, children, redFlag }: { text: string; children?: ReactNode; redFlag?: boolean }) {
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '85%', minWidth: '60%' }}>
      <View
        style={{
          backgroundColor: redFlag ? theme.color.coralBg : theme.color.surface,
          borderWidth: 1,
          borderColor: redFlag ? theme.color.coral : theme.color.border,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomRightRadius: 22,
          borderBottomLeftRadius: 6,
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 10,
        }}
      >
        <RNText style={{ fontFamily: theme.font.body, fontSize: theme.font.size.md, lineHeight: theme.font.size.md * 1.4, color: theme.color.text }}>{text}</RNText>
        {children}
      </View>
    </View>
  );
}

/** 5.2: the patient's messages on the right in teal; the assistant's on the left with sources (F2). */
function Bubble({ message, s }: { message: Message; s: Strings }) {
  if (message.role === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
        <View style={{ backgroundColor: theme.color.primary, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomLeftRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 14 }}>
          <RNText style={{ fontFamily: theme.font.body, fontSize: theme.font.size.md, lineHeight: theme.font.size.md * 1.4, color: theme.color.primaryText }}>{message.text}</RNText>
        </View>
      </View>
    );
  }
  return (
    <AssistantBubble text={message.pending ? s.thinking : message.text} redFlag={message.redFlag}>
      {message.citations?.map((c) => (
        <View key={c.chunkIndex} style={{ backgroundColor: theme.color.primaryBg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="file-teal-14" size={14} />
            <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: theme.font.size.xs, color: theme.color.primary }}>{s.fromYourVisitShort}</RNText>
          </View>
          <RNText style={{ fontFamily: theme.font.body, fontSize: 15, lineHeight: 21, color: theme.color.text }}>
            {`“${c.textPatientLang.length > CITATION_CHARS ? `${c.textPatientLang.slice(0, CITATION_CHARS)}…` : c.textPatientLang}”`}
          </RNText>
        </View>
      ))}
    </AssistantBubble>
  );
}

/** 5.3: concentric teal rings around the mic while listening, "Listening…", and Stop. */
function Listening({ state, seconds, s, onStop }: { state: 'recording' | 'transcribing'; seconds: number; s: Strings; onStop: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (state !== 'recording') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  return (
    <View style={{ gap: theme.space.lg }}>
      <View style={{ alignItems: 'center', gap: theme.space.md }}>
        <Animated.View style={{ width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(8,125,141,0.08)', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pulse }] }}>
          <View style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: 'rgba(8,125,141,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.color.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="mic-white-42" size={42} />
            </View>
          </View>
        </Animated.View>
        <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: theme.font.size.md, color: theme.color.primary }}>
          {state === 'recording' ? `${s.listeningTitle} ${seconds}s` : s.transcribing}
        </RNText>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onStop}
        disabled={state !== 'recording'}
        style={{ height: 60, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: state === 'recording' ? 1 : 0.5 }}
      >
        <Icon name="stop" size={20} />
        <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: theme.font.size.md, color: theme.color.text }}>{s.stop}</RNText>
      </Pressable>
    </View>
  );
}
