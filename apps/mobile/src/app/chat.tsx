// G16 chat log. Opens a session on mount (chat.start), shows the messages newest at the bottom,
// suggested prompts when empty, a text box with send, and a big mic that records a clip. Visit
// answers show the passage they came from (F2). A red-flag reply opens "Call 911 now" (G17).
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text as RNText, TextInput, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { Button, ScreenTitle, Text } from '../components';
import type { Strings } from '../i18n';
import { theme } from '../theme';
import { useClipRecorder } from '../useClipRecorder';
import { usePatient } from '../usePatient';

const MIC_SIZE = 72;
const CITATION_CHARS = 220;

export default function Chat() {
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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenTitle title={s.assistant} right={<Button label={s.close} variant="secondary" onPress={close} />} />
      <View style={{ padding: theme.space.sm, backgroundColor: theme.color.dangerBg, alignItems: 'center' }}>
        <Text variant="muted">{s.chatDisclaimer}</Text>
      </View>

      <ScrollView
        ref={(view) => {
          scroll.current = view;
        }}
        contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.md }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {messages?.length === 0 && (
          <View style={{ gap: theme.space.sm }}>
            {s.suggestions.map((suggestion) => (
              <Button key={suggestion} label={suggestion} variant="secondary" onPress={() => void sendText(suggestion)} disabled={!conversationId} />
            ))}
          </View>
        )}
        {messages?.map((m) => (
          <Bubble key={m._id} message={m} s={s} />
        ))}
      </ScrollView>

      {(error || mic.error) && (
        <View style={{ paddingHorizontal: theme.space.lg }}>
          <Text variant="error">{error ?? (mic.error === 'empty' ? s.micEmpty : s.micUnavailable)}</Text>
        </View>
      )}
      {mic.state !== 'idle' && (
        <View style={{ paddingHorizontal: theme.space.lg, alignItems: 'center' }}>
          <Text variant="heading">{mic.state === 'recording' ? s.listening(mic.seconds) : s.transcribing}</Text>
        </View>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          padding: theme.space.md,
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={s.chatPlaceholder}
          placeholderTextColor={theme.color.textMuted}
          accessibilityLabel={s.chatPlaceholder}
          multiline
          onSubmitEditing={() => void sendText(draft)}
          style={{
            flex: 1,
            minHeight: theme.minTap,
            maxHeight: 140,
            fontSize: theme.font.size.md,
            color: theme.color.text,
            backgroundColor: theme.color.bg,
            borderWidth: 1,
            borderColor: theme.color.border,
            borderRadius: theme.radius.sm,
            paddingHorizontal: theme.space.md,
            paddingVertical: theme.space.sm,
          }}
        />
        <Button label={s.send} onPress={() => void sendText(draft)} disabled={!draft.trim() || waiting || !conversationId} />
        <MicButton
          state={mic.state}
          disabled={waiting || !conversationId}
          label={mic.state === 'recording' ? s.micStop : s.micStart}
          onPress={() => void (mic.state === 'recording' ? mic.stop() : mic.start())}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

type Message = FunctionReturnType<typeof api.chat.messages>[number];

/** The patient's messages on the right, the assistant's on the left; visit answers show their source. */
function Bubble({ message, s }: { message: Message; s: Strings }) {
  const mine = message.role === 'user';
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        gap: theme.space.xs,
        padding: theme.space.md,
        borderRadius: theme.radius.md,
        backgroundColor: message.redFlag ? theme.color.dangerBg : mine ? theme.color.primaryBg : theme.color.surface,
        borderWidth: 1,
        borderColor: message.redFlag ? theme.color.danger : mine ? theme.color.primary : theme.color.border,
      }}
    >
      <Text>{message.pending ? s.thinking : message.text}</Text>
      {message.citations?.map((c) => (
        <View key={c.chunkIndex} style={{ borderLeftWidth: 3, borderLeftColor: theme.color.primary, paddingLeft: theme.space.sm, gap: theme.space.xs }}>
          <Text variant="muted">{s.fromYourVisit}</Text>
          <Text variant="quote">
            “{c.textPatientLang.length > CITATION_CHARS ? `${c.textPatientLang.slice(0, CITATION_CHARS)}…` : c.textPatientLang}”
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The largest target on the screen; a pulsing ring while it listens. */
function MicButton({ state, disabled, label, onPress }: { state: 'idle' | 'recording' | 'transcribing'; disabled: boolean; label: string; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state !== 'recording') {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  const recording = state === 'recording';
  return (
    <Animated.View
      style={{
        borderRadius: MIC_SIZE,
        padding: 4,
        borderWidth: 4,
        borderColor: recording ? theme.color.danger : 'transparent',
        opacity: recording ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) : 1,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        disabled={disabled || state === 'transcribing'}
        style={{
          width: MIC_SIZE,
          height: MIC_SIZE,
          borderRadius: MIC_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: recording ? theme.color.danger : theme.color.primary,
          opacity: disabled || state === 'transcribing' ? 0.5 : 1,
        }}
      >
        <RNText style={{ fontSize: theme.font.size.xl, color: theme.color.primaryText }}>{recording ? '■' : '🎤'}</RNText>
      </Pressable>
    </Animated.View>
  );
}
