// Start visit and the live visit (Figma 6.5a–e, D1). 6.5a asks for consent and offers an upload
// instead; 6.5b/c show each turn translated for the other person; 6.5d is the large-text view to
// turn toward the patient; 6.5e finishes and uploads the recording through visits.create, which
// starts Track A's processing. Only the voices of people who agreed to be recorded are kept.
import { useMutation } from 'convex/react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Icon, Text } from '../../components'
import { formatDay, formatTime, isoDay } from '../../format'
import { theme } from '../../theme'
import { clock, useLiveSession, type Language, type Speaker, type Turn } from './useLiveSession'

export type Consent = { record: Record<Speaker, boolean>; translate: boolean }
type People = { doctorName: string; patientName: string; patientLanguage: Language }

const LANGUAGE: Record<Language, string> = { en: 'English', es: 'Español' }
const ASK: Record<Language, string> = {
  en: 'Is it okay if we record and translate this visit?',
  es: '¿Está bien si grabamos y traducimos esta visita?',
}

/** Uploads a visit recording and registers it; processing starts on the server. */
function useUploadVisit(appointmentId: Id<'appointments'>) {
  const generateUploadUrl = useMutation(api.visits.generateUploadUrl)
  const create = useMutation(api.visits.create)
  return async (file: Blob) => {
    const url = await generateUploadUrl()
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type || 'audio/webm' }, body: file })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
    await create({ appointmentId, storageId })
  }
}

function speakText(text: string, language: Language) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language === 'es' ? 'es-US' : 'en-US'
  window.speechSynthesis.speak(utterance)
}

const first = (name: string) => name.split(' ')[0]
const initials = (name: string) => name.replace(/^Dr\.?\s*/, 'D ')

/** The whole flow, from the consent dialog to the uploaded recording. */
export default function StartVisitFlow({ appointmentId, scheduledAt, people, onClose, onUploaded }: { appointmentId: Id<'appointments'>; scheduledAt: number; people: People; onClose: () => void; onUploaded: () => void }) {
  const [consent, setConsent] = useState<Consent | null>(null)
  const upload = useUploadVisit(appointmentId)
  if (!consent) return <ConsentDialog scheduledAt={scheduledAt} people={people} upload={upload} onClose={onClose} onUploaded={onUploaded} onStart={setConsent} />
  return <LiveVisit people={people} consent={consent} upload={upload} onClose={onClose} onUploaded={onUploaded} />
}

// ---- 6.5a: consent ----

function ConsentDialog({ scheduledAt, people, upload, onClose, onUploaded, onStart }: { scheduledAt: number; people: People; upload: (file: Blob) => Promise<void>; onClose: () => void; onUploaded: () => void; onStart: (consent: Consent) => void }) {
  const { doctorName, patientName, patientLanguage } = people
  const [record, setRecord] = useState<Record<Speaker, boolean>>({ doctor: false, patient: false })
  const [translate, setTranslate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const name = first(patientName)
  const anyRecord = record.doctor || record.patient
  const canUpload = record.doctor && record.patient

  const note = !anyRecord
    ? translate
      ? 'Nothing will be recorded. Live translation only, and no summary afterwards.'
      : 'Tick at least one box to start.'
    : !canUpload
      ? `Only ${record.doctor ? doctorName : name}'s voice is kept. ${record.doctor ? name : doctorName}'s turns are muted in the recording.`
      : 'Audio is saved to this visit and transcribed afterwards for the summary.'

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await upload(file)
      onUploaded()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Overlay width={1240} padding="36px 40px" gap={24} onClose={busy ? undefined : onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, display: 'grid', gap: 4 }}>
          <Text style={{ font: `600 34px/1.2 ${theme.font.heading}`, letterSpacing: -0.34 }}>Start visit</Text>
          <Text color={theme.color.textMuted}>{`${patientName}  ·  ${formatDay(isoDay(scheduledAt))} ${formatTime(scheduledAt)}`}</Text>
        </div>
        <RoundButton icon="close-x-20" iconSize={20} size={44} label="Close" onClick={onClose} disabled={busy} />
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 520px', display: 'grid', gap: 18, alignContent: 'start' }}>
          <StepChip>STEP 1 · ASK FOR PERMISSION</StepChip>
          <div style={{ background: theme.color.bg, borderRadius: theme.radius.lg, padding: 28, display: 'grid', gap: 30 }}>
            <Text style={{ font: `600 14px/1.45 ${theme.font.body}` }} color={theme.color.textMuted}>{`Read this to ${name}`}</Text>
            <Text style={{ font: `600 30px/1.2 ${theme.font.heading}`, letterSpacing: -0.3 }}>{ASK.en}</Text>
            {patientLanguage !== 'en' && (
              <>
                <Text style={{ font: `600 30px/1.2 ${theme.font.heading}`, letterSpacing: -0.3 }} color={theme.color.periwinkle}>{ASK[patientLanguage]}</Text>
                <button onClick={() => speakText(ASK[patientLanguage], patientLanguage)} style={{ ...pill, justifySelf: 'start', height: 48, padding: '0 18px', gap: 10, font: `700 15px ${theme.font.body}` }}>
                  <Icon name="speaker-periwinkle-20" size={20} />
                  {`Read aloud in ${patientLanguage === 'es' ? 'Spanish' : LANGUAGE[patientLanguage]}`}
                </button>
              </>
            )}
          </div>
        </div>
        <div style={{ flex: '0 1 440px', display: 'grid', gap: 18, alignContent: 'start' }}>
          <StepChip>STEP 2 · LANGUAGES</StepChip>
          <div style={{ border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.lg, padding: 24, display: 'grid', gap: 14 }}>
            <LanguageRow who={doctorName} language="en" doctor />
            <span style={{ justifySelf: 'center', width: 40, height: 40, borderRadius: 20, boxSizing: 'border-box', border: `1px solid ${theme.color.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="swap-18" size={18} />
            </span>
            <LanguageRow who={name} avatar={patientName} language={patientLanguage} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ConsentBox checked={record.patient} onChange={(v) => setRecord({ ...record, patient: v })}>{`${name} agreed to have this visit recorded`}</ConsentBox>
        <ConsentBox checked={record.doctor} onChange={(v) => setRecord({ ...record, doctor: v })}>{`${doctorName} agreed to have this visit recorded`}</ConsentBox>
        <ConsentBox checked={translate} onChange={setTranslate}>{`${name} agreed to live translation on this screen`}</ConsentBox>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <input ref={fileInput} type="file" accept="audio/*,video/webm,video/mp4" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={!canUpload || busy}
          title={canUpload ? undefined : 'Both people must agree to be recorded: a file cannot be split by speaker.'}
          style={{ ...pill, height: 44, padding: '0 16px', gap: 8, font: `600 14px ${theme.font.body}`, color: theme.color.textMuted, opacity: !canUpload || busy ? 0.5 : 1, cursor: !canUpload || busy ? 'default' : 'pointer' }}
        >
          <Icon name="upload-muted-16" size={16} />
          {busy ? 'Uploading…' : 'Upload a recording instead'}
        </button>
        <Text color={error ? theme.color.dangerText : theme.color.placeholder} style={{ flex: '1 1 240px', font: `400 14px/1.45 ${theme.font.body}` }}>{error ?? note}</Text>
        <CtaButton icon="mic-white-24" iconSize={24} disabled={busy || (!anyRecord && !translate)} onClick={() => onStart({ record, translate })} style={{ height: 72, padding: '0 22px 0 40px', fontSize: 22 }}>
          {anyRecord ? 'Start recording' : 'Start live translation'}
        </CtaButton>
      </div>
    </Overlay>
  )
}

function LanguageRow({ who, avatar = who, language, doctor }: { who: string; avatar?: string; language: Language; doctor?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 18, background: doctor ? theme.color.primaryBg : theme.color.periwinkleBg }}>
      <PersonAvatar name={avatar} size={48} doctor={doctor} />
      <div style={{ flex: 1, display: 'grid', gap: 2 }}>
        <Text style={{ font: `700 16px/1.45 ${theme.font.body}` }}>{who}</Text>
        <Text variant="muted" style={{ fontSize: 13 }}>Speaks</Text>
      </div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: theme.radius.pill, background: theme.color.surface, font: `600 14px ${theme.font.body}`, color: doctor ? theme.color.primary : theme.color.periwinkle }}>
        <Icon name={doctor ? 'globe-teal' : 'globe-periwinkle-14'} size={14} />
        {LANGUAGE[language]}
      </span>
    </div>
  )
}

function ConsentBox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 18, background: checked ? theme.color.primaryBg : theme.color.bg, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
      <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, boxSizing: 'border-box', background: checked ? theme.color.primary : theme.color.surface, border: checked ? 'none' : `2px solid ${theme.color.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <Icon name="check-white-20" size={20} />}
      </span>
      <Text style={{ font: `600 17px/1.45 ${theme.font.body}` }}>{children}</Text>
    </label>
  )
}

// ---- 6.5b/c: live visit; 6.5d: patient view; 6.5e: finish ----

function LiveVisit({ people, consent, upload, onClose, onUploaded }: { people: People; consent: Consent; upload: (file: Blob) => Promise<void>; onClose: () => void; onUploaded: () => void }) {
  const { doctorName, patientName, patientLanguage } = people
  const languages = { doctor: 'en', patient: patientLanguage } as const
  const live = useLiveSession({ recordConsent: consent.record, translate: consent.translate, languages })
  const [patientView, setPatientView] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [autoRead, setAutoRead] = useState(patientLanguage !== 'en')
  const [shown, setShown] = useState<number | null>(null) // a turn picked from the list, else the latest
  const recording = consent.record.doctor || consent.record.patient
  const name = first(patientName)

  // Auto-read: read each finished doctor turn aloud in the patient's language.
  const lastRead = useRef(0)
  const { turns, readAloud } = live
  useEffect(() => {
    const latest = turns.findLast((t) => t.status === 'done')
    if (!latest || latest.id <= lastRead.current) return
    lastRead.current = latest.id
    if (autoRead && latest.speaker === 'doctor' && patientLanguage !== 'en') readAloud(latest.translated, patientLanguage)
  }, [turns, autoRead, readAloud, patientLanguage])

  // A turn picked from the list, else the latest translated one (a newer turn may still be translating).
  const current = turns.find((t) => t.id === shown) ?? turns.findLast((t) => t.status === 'done') ?? turns.findLast((t) => t.status === 'pending') ?? null
  const latestDoctor = turns.findLast((t) => t.speaker === 'doctor' && t.status === 'done') ?? null
  const status = live.status === 'paused' ? 'Paused' : recording ? 'Recording' : 'Live'

  if (live.status === 'error') {
    return (
      <Overlay width={640} padding="36px 40px" gap={20} onClose={onClose}>
        <Text style={{ font: `600 30px/1.2 ${theme.font.heading}` }}>Microphone unavailable</Text>
        <Text color={theme.color.textMuted}>{live.error ?? 'Allow microphone access in the browser and try again.'}</Text>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={onClose} style={{ ...pill, height: 48, padding: '0 22px', font: `700 15px ${theme.font.body}` }}>Close</button></div>
      </Overlay>
    )
  }

  if (patientView) {
    return <PatientScreen people={people} turn={latestDoctor} elapsed={live.elapsed} status={live.status} recording={recording} speaker={live.speaker} levels={live.levels} speaking={live.speaking} onSpeak={() => live.setSpeaker('patient')} onListen={() => latestDoctor && readAloud(latestDoctor.translated, patientLanguage)} onExit={() => setPatientView(false)} />
  }

  return (
    <>
      <Overlay width={1392} height="calc(100vh - 56px)" padding="28px 32px" gap={20}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', borderRadius: theme.radius.pill, background: recording ? theme.color.dangerBg : theme.color.primaryBg, font: `700 15px ${theme.font.body}`, color: recording ? theme.color.dangerText : theme.color.primary, whiteSpace: 'pre' }}>
            {recording && <Icon name="rec-dot-12" size={12} style={{ opacity: live.status === 'paused' ? 0.4 : 1 }} />}
            {`${status}  ${clock(live.elapsed)}`}
          </span>
          {patientLanguage !== 'en' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 16px', borderRadius: theme.radius.pill, background: theme.color.bg, font: `600 15px ${theme.font.body}` }}>
              <span style={{ color: theme.color.primary }}>English</span>
              <Icon name="swap-16" size={16} />
              <span style={{ color: theme.color.periwinkle }}>{LANGUAGE[patientLanguage]}</span>
            </span>
          )}
          <Text color={theme.color.textMuted} style={{ flex: 1, font: `500 15px/1.45 ${theme.font.body}` }}>{`${patientName} · Live visit`}</Text>
          {consent.translate && <PillButton icon="expand-18" onClick={() => setPatientView(true)}>Patient view</PillButton>}
          <PillButton icon="pause-18" onClick={live.status === 'paused' ? live.resume : live.pause} disabled={live.status === 'starting'}>{live.status === 'paused' ? 'Resume' : 'Pause'}</PillButton>
          <PillButton icon="stop-white-18" ink onClick={() => setFinishing(true)} disabled={live.status === 'starting'}>Finish visit</PillButton>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20 }}>
          <Conversation turns={turns} people={people} enabled={consent.translate} selected={current?.id ?? null} onSelect={setShown} onRead={(t) => readAloud(t.translated, languages[t.speaker === 'doctor' ? 'patient' : 'doctor'])} />
          <CurrentTurn
            turn={current}
            people={people}
            enabled={consent.translate}
            speaker={live.speaker}
            levels={live.levels}
            autoRead={autoRead}
            onToggleAutoRead={() => setAutoRead(!autoRead)}
            onRead={(t) => readAloud(t.translated, languages[t.speaker === 'doctor' ? 'patient' : 'doctor'])}
            onLatest={shown !== null ? () => setShown(null) : undefined}
          />
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {(['doctor', 'patient'] as const).map((who) => (
            <SpeakerCard
              key={who}
              who={who}
              name={who === 'doctor' ? doctorName : name}
              avatar={who === 'doctor' ? doctorName : patientName}
              language={languages[who]}
              active={live.speaker === who}
              speaking={live.speaker === who && live.speaking}
              paused={live.status !== 'live'}
              recorded={consent.record[who]}
              levels={live.levels}
              onSelect={() => live.setSpeaker(who)}
            />
          ))}
        </div>
      </Overlay>
      {finishing && (
        <FinishDialog
          elapsed={live.elapsed}
          turns={turns.filter((t) => t.status === 'done').length}
          recording={recording}
          patientLanguage={patientLanguage}
          onKeep={() => setFinishing(false)}
          onFinish={async () => {
            const blob = await live.finish()
            if (!blob) return onClose()
            await upload(blob)
            onUploaded()
          }}
        />
      )}
    </>
  )
}

function Conversation({ turns, people, enabled, selected, onSelect, onRead }: { turns: Turn[]; people: People; enabled: boolean; selected: number | null; onSelect: (id: number) => void; onRead: (turn: Turn) => void }) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length])
  const done = turns.filter((t) => t.status === 'done').length
  return (
    <div style={{ width: 400, flexShrink: 0, background: theme.color.bg, borderRadius: theme.radius.lg, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, font: `600 20px/1.2 ${theme.font.heading}`, letterSpacing: -0.2 }}>Conversation</Text>
        <span style={{ padding: '6px 12px', borderRadius: theme.radius.pill, background: theme.color.surface, font: `600 12px ${theme.font.body}`, color: theme.color.primary }}>{`${done} turn${done === 1 ? '' : 's'}`}</span>
      </div>
      <div ref={list} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: 12, alignContent: 'start' }}>
        {!enabled && <Text variant="muted">Live translation is off for this visit.</Text>}
        {enabled && turns.length === 0 && <Text variant="muted">Turns appear here as each person speaks.</Text>}
        {turns.map((turn) => {
          const doctor = turn.speaker === 'doctor'
          return (
            <div key={turn.id} onClick={() => onSelect(turn.id)} style={{ background: theme.color.surface, borderRadius: 18, padding: '14px 16px', display: 'grid', gap: 6, cursor: 'pointer', outline: turn.id === selected ? `2px solid ${doctor ? theme.color.primary : theme.color.periwinkle}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PersonAvatar name={doctor ? people.doctorName : people.patientName} size={28} doctor={doctor} />
                <Text style={{ flex: 1, font: `700 14px/1.45 ${theme.font.body}` }}>{doctor ? people.doctorName : first(people.patientName)}</Text>
                <Text color={theme.color.placeholder} style={{ font: `400 12px/1.45 ${theme.font.body}` }}>{clock(turn.at)}</Text>
                {turn.status === 'done' && (
                  <button aria-label="Read aloud" onClick={(e) => { e.stopPropagation(); onRead(turn) }} style={{ width: 30, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer', background: doctor ? theme.color.primaryBg : theme.color.periwinkleBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={doctor ? 'speaker-teal-15' : 'speaker-periwinkle-15'} size={15} />
                  </button>
                )}
              </div>
              {turn.status === 'pending' && <Text variant="muted">Translating…</Text>}
              {turn.status === 'failed' && <Text color={theme.color.dangerText} style={{ fontSize: 14 }}>Could not translate this turn.</Text>}
              {turn.status === 'done' && (
                <>
                  <Text color={theme.color.textMuted} style={{ font: `400 14px/1.45 ${theme.font.body}` }}>{turn.original}</Text>
                  {turn.translated !== turn.original && <Text style={{ font: `600 15px/1.45 ${theme.font.body}` }}>{turn.translated}</Text>}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CurrentTurn({ turn, people, enabled, speaker, levels, autoRead, onToggleAutoRead, onRead, onLatest }: { turn: Turn | null; people: People; enabled: boolean; speaker: Speaker; levels: number[]; autoRead: boolean; onToggleAutoRead: () => void; onRead: (turn: Turn) => void; onLatest?: () => void }) {
  const { doctorName, patientName, patientLanguage } = people
  const name = first(patientName)
  const who = turn?.speaker ?? speaker
  const doctor = who === 'doctor'
  const from = doctor ? 'en' : patientLanguage
  const to = doctor ? patientLanguage : 'en'
  const color = doctor ? theme.color.primary : theme.color.periwinkle
  const listener = doctor ? name : doctorName
  const forPatient = to === patientLanguage && patientLanguage !== 'en'
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', background: theme.color.surface, border: `1px solid ${theme.color.border}`, borderRadius: 28, padding: 32, display: 'flex', flexDirection: 'column', gap: 18, boxSizing: 'border-box' }}>
      <img src="/figma/live-blend-1.svg" alt="" style={{ position: 'absolute', right: -280, top: -517, width: 832, height: 832, maxWidth: 'none', pointerEvents: 'none' }} />
      <img src="/figma/live-blend-2.svg" alt="" style={{ position: 'absolute', right: -260, top: -307, width: 672, height: 672, maxWidth: 'none', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
        <PersonAvatar name={doctor ? doctorName : patientName} size={44} doctor={doctor} />
        <div style={{ flex: 1, display: 'grid', gap: 2 }}>
          <Text style={{ font: `700 17px/1.45 ${theme.font.body}` }}>{doctor ? doctorName : name}</Text>
          <Text color={color} style={{ font: `400 14px/1.45 ${theme.font.body}` }}>
            {from === to ? `Speaking ${LANGUAGE[from]}` : `Speaking ${from === 'es' ? 'Spanish' : 'English'} · translating to ${to === 'es' ? 'Spanish' : 'English'}`}
          </Text>
        </div>
        <Waveform levels={levels} color={color} height={40} active={!turn || turn.speaker === speaker} />
      </div>

      {!enabled ? (
        <Text color={theme.color.textMuted} style={{ position: 'relative' }}>{`Live translation is off: ${name} did not agree to it. The visit is still recorded for the summary.`}</Text>
      ) : !turn ? (
        <Text color={theme.color.textMuted} style={{ position: 'relative', font: `400 20px/1.45 ${theme.font.body}` }}>Start talking. Each sentence is translated when the speaker pauses; tap the other card when the patient speaks.</Text>
      ) : (
        <>
          <div style={{ position: 'relative', background: theme.color.bg, borderRadius: 18, padding: '16px 18px', display: 'grid', gap: 6 }}>
            <Text variant="label" style={{ textTransform: 'none' }}>{`${(doctor ? doctorName : name).toUpperCase()} SAID (${LANGUAGE[from].toUpperCase()})`}</Text>
            <Text style={{ font: `500 20px/1.45 ${theme.font.body}` }}>{turn.status === 'pending' ? 'Listening…' : turn.status === 'failed' ? 'Could not hear this turn.' : turn.original}</Text>
          </div>
          {turn.status === 'done' && turn.translated !== turn.original && (
            <>
              <Text color={doctor ? theme.color.periwinkle : theme.color.primary} style={{ position: 'relative', font: `600 14px/1.45 ${theme.font.body}` }}>{`FOR ${listener.toUpperCase()} · ${LANGUAGE[to].toUpperCase()}`}</Text>
              <Text style={{ position: 'relative', font: `600 46px/1.25 ${theme.font.heading}`, letterSpacing: -0.46 }}>{turn.translated}</Text>
            </>
          )}
        </>
      )}

      <div style={{ flex: 1 }} />
      {enabled && turn?.status === 'done' && turn.translated !== turn.original && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button aria-label="Read aloud" onClick={() => onRead(turn)} style={{ width: 76, height: 76, borderRadius: 38, border: 'none', cursor: 'pointer', background: theme.ctaGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="speaker-white-32" size={32} />
          </button>
          <div style={{ flex: 1, display: 'grid', gap: 2 }}>
            <Text style={{ font: `600 22px/1.2 ${theme.font.heading}`, letterSpacing: -0.22 }}>{forPatient && patientLanguage === 'es' ? 'Leer en voz alta' : 'Read aloud'}</Text>
            <Text variant="muted">{`Reads the ${to === 'es' ? 'Spanish' : 'English'} translation out loud for ${listener}`}</Text>
          </div>
          {onLatest && <PillButton onClick={onLatest}>Show latest</PillButton>}
          {forPatient && (
            <button onClick={onToggleAutoRead} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: theme.radius.pill, border: 'none', cursor: 'pointer', background: autoRead ? theme.color.primaryBg : theme.color.bg, color: autoRead ? theme.color.primary : theme.color.textMuted, font: `600 13px ${theme.font.body}` }}>
              {autoRead && <Icon name="check-teal-14" size={14} />}
              {`Auto-read: ${autoRead ? 'on' : 'off'}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** "Who is speaking": the active card is outlined and its mic lit; tap the other to switch. */
function SpeakerCard({ who, name, avatar, language, active, speaking, paused, recorded, levels, onSelect }: { who: Speaker; name: string; avatar: string; language: Language; active: boolean; speaking: boolean; paused: boolean; recorded: boolean; levels: number[]; onSelect: () => void }) {
  const doctor = who === 'doctor'
  const color = doctor ? theme.color.primary : theme.color.periwinkle
  const status = paused ? 'Paused' : active ? (speaking ? 'Speaking…' : 'Listening…') : `Tap if ${name} is speaking`
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      style={{ flex: '1 1 400px', display: 'flex', alignItems: 'center', gap: 14, padding: active ? '13px 17px' : '14px 18px', borderRadius: 22, cursor: 'pointer', textAlign: 'left', background: active ? (doctor ? theme.color.primaryBg : theme.color.periwinkleBg) : theme.color.surface, border: active ? `2px solid ${color}` : `1px solid ${theme.color.border}` }}
    >
      <PersonAvatar name={avatar} size={44} doctor={doctor} />
      <span style={{ flex: 1, display: 'grid', gap: 2 }}>
        <Text style={{ font: `700 16px/1.45 ${theme.font.body}` }}>{`${name} · ${LANGUAGE[language]}`}</Text>
        <Text color={active ? color : theme.color.textMuted} style={{ font: `400 13px/1.45 ${theme.font.body}` }}>{recorded ? status : `${status} · not recorded`}</Text>
      </span>
      <Waveform levels={levels} color={color} height={32} active={active && !paused} />
      <span style={{ width: 48, height: 48, borderRadius: 24, background: active ? color : theme.color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={active ? 'mic-white-22' : 'mic-muted-22'} size={22} />
      </span>
    </button>
  )
}

const PATIENT_TEXT = {
  es: { recording: 'Grabando', paused: 'En pausa', live: 'En vivo', view: 'Vista para el paciente · Español', says: (d: string) => `${d} dice:`, listen: 'Escuchar', speak: 'Puede hablar cuando quiera', speaking: 'Le escuchamos…', weTranslate: 'Le traducimos al doctor', waiting: 'Aquí verá lo que dice su doctor, traducido.' },
  en: { recording: 'Recording', paused: 'Paused', live: 'Live', view: 'Patient view · English', says: (d: string) => `${d} says:`, listen: 'Listen', speak: 'You can speak any time', speaking: 'Listening…', weTranslate: 'Your doctor sees what you say', waiting: "Your doctor's words appear here." },
}

/** 6.5d: large text to turn toward the patient, in their language. */
function PatientScreen({ people, turn, elapsed, status, recording, speaker, levels, speaking, onSpeak, onListen, onExit }: { people: People; turn: Turn | null; elapsed: number; status: string; recording: boolean; speaker: Speaker; levels: number[]; speaking: boolean; onSpeak: () => void; onListen: () => void; onExit: () => void }) {
  const t = PATIENT_TEXT[people.patientLanguage]
  // Small English under each Spanish label, so the doctor (and anyone watching) can follow.
  const en = people.patientLanguage === 'en' ? null : PATIENT_TEXT.en
  const small: CSSProperties = { font: `500 13px/1.3 ${theme.font.body}`, color: theme.color.textMuted }
  const patientTalking = speaker === 'patient'
  return (
    <Overlay width={1392} height="calc(100vh - 56px)" padding="28px 56px" gap={28}>
      <img src="/figma/patient-blend-1.svg" alt="" style={{ position: 'absolute', left: -409, top: -622, width: 1300, height: 1300, maxWidth: 'none', pointerEvents: 'none' }} />
      <img src="/figma/patient-blend-2.svg" alt="" style={{ position: 'absolute', right: -574, top: -580, width: 1200, height: 1200, maxWidth: 'none', pointerEvents: 'none' }} />
      <img src="/figma/patient-blend-3.svg" alt="" style={{ position: 'absolute', left: 78, bottom: -464, width: 1100, height: 1100, maxWidth: 'none', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', borderRadius: theme.radius.pill, background: theme.color.surface, font: `700 14px ${theme.font.body}`, color: recording ? theme.color.dangerText : theme.color.primary, whiteSpace: 'pre' }}>
          {recording && <Icon name="rec-dot-10" size={10} />}
          {`${status === 'paused' ? t.paused : recording ? t.recording : t.live}  ${clock(elapsed)}`}
          {en && <span style={{ ...small, fontSize: 12 }}>{status === 'paused' ? en.paused : recording ? en.recording : en.live}</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: theme.radius.pill, background: theme.color.surface, font: `600 14px ${theme.font.body}`, color: theme.color.periwinkle }}>
          <Icon name="globe-periwinkle-14b" size={14} />
          {t.view}
          {en && <span style={{ ...small, fontSize: 12 }}>Patient view</span>}
        </span>
        <div style={{ flex: 1 }} />
        <PillButton icon="shrink-18" onClick={onExit}>Exit patient view</PillButton>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
        {turn ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PersonAvatar name={people.doctorName} size={48} doctor />
              <Text color={theme.color.textMuted} style={{ font: `600 22px/1.45 ${theme.font.body}` }}>{t.says(people.doctorName)}</Text>
              {en && <span style={small}>{en.says(people.doctorName)}</span>}
            </div>
            <Text style={{ font: `600 64px/1.18 ${theme.font.heading}`, letterSpacing: -0.64 }}>{turn.translated}</Text>
            {turn.translated !== turn.original && <Text color={theme.color.textMuted} style={{ font: `400 22px/1.45 ${theme.font.body}` }}>{turn.original}</Text>}
          </>
        ) : (
          <>
            <Text style={{ font: `600 48px/1.2 ${theme.font.heading}` }} color={theme.color.textMuted}>{t.waiting}</Text>
            {en && <Text style={{ ...small, fontSize: 18 }}>{en.waiting}</Text>}
          </>
        )}
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <CtaButton icon="speaker-white-34" iconSize={34} disabled={!turn} onClick={onListen} style={{ height: 88, padding: '0 36px', borderRadius: 44, fontSize: 28, gap: 14 }}>
          <span style={{ display: 'grid', textAlign: 'left' }}>
            {t.listen}
            {en && <span style={{ font: `500 14px/1.2 ${theme.font.body}`, color: 'rgba(255,255,255,0.85)' }}>{en.listen}</span>}
          </span>
        </CtaButton>
        <div style={{ flex: 1 }} />
        <button onClick={onSpeak} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px 14px 14px', borderRadius: theme.radius.pill, border: patientTalking ? `2px solid ${theme.color.periwinkle}` : '2px solid transparent', background: theme.color.surface, cursor: 'pointer', textAlign: 'left' }}>
          <Icon name="mascot-listen-52" size={52} />
          <span style={{ display: 'grid', gap: 2 }}>
            <Text style={{ font: `700 17px/1.45 ${theme.font.body}` }}>{patientTalking && speaking ? t.speaking : t.speak}</Text>
            <Text variant="muted">{t.weTranslate}</Text>
            {en && <span style={{ ...small, fontSize: 12 }}>{`${patientTalking && speaking ? en.speaking : en.speak} · ${en.weTranslate}`}</span>}
          </span>
          <Waveform levels={levels} color={theme.color.periwinkle} height={30} active={patientTalking} bars={18} />
        </button>
      </div>
    </Overlay>
  )
}

function FinishDialog({ elapsed, turns, recording, patientLanguage, onKeep, onFinish }: { elapsed: number; turns: number; recording: boolean; patientLanguage: Language; onKeep: () => void; onFinish: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const minutes = Math.max(1, Math.round(elapsed / 60000))
  const languages = patientLanguage === 'en' ? 'English' : `English and ${patientLanguage === 'es' ? 'Spanish' : LANGUAGE[patientLanguage]}`
  return (
    <Overlay width={640} padding="36px 40px" gap={24} z={41}>
      <span style={{ width: 60, height: 60, borderRadius: 30, background: theme.color.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="file-teal-28" size={28} /></span>
      <Text style={{ font: `600 30px/1.2 ${theme.font.heading}`, letterSpacing: -0.3 }}>{recording ? 'Finish and process this visit?' : 'Finish this visit?'}</Text>
      <Text color={theme.color.textMuted} style={{ font: `400 17px/1.45 ${theme.font.body}` }}>
        {recording
          ? `${minutes} min recorded · ${turns} translated turn${turns === 1 ? '' : 's'}. We will transcribe the full audio, label speakers and draft the summary in ${languages}.`
          : `${turns} translated turn${turns === 1 ? '' : 's'}. Nothing was recorded, so there will be no transcript or summary for this visit.`}
      </Text>
      {error && <Text color={theme.color.dangerText}>{error}</Text>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 40 }}>
        <PillButton icon="mic-ink-18" onClick={onKeep} disabled={busy} style={{ height: 56, padding: '0 22px' }}>Keep recording</PillButton>
        <CtaButton
          icon="check-white-18"
          iconSize={18}
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setError(null)
            onFinish().catch((e: unknown) => {
              setError(e instanceof Error ? e.message : String(e))
              setBusy(false)
            })
          }}
          style={{ height: 64, padding: '0 22px', fontSize: 20 }}
        >
          {busy ? 'Uploading…' : recording ? 'Upload Visit' : 'End visit'}
        </CtaButton>
      </div>
    </Overlay>
  )
}

// ---- pieces ----

function Overlay({ width, height, padding, gap, z = 40, onClose, children }: { width: number; height?: string; padding: string; gap: number; z?: number; onClose?: () => void; children: ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: z, background: theme.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', overflow: 'hidden', width: `min(${width}px, 100%)`, height, maxHeight: '100%', overflowY: height ? 'hidden' : 'auto', boxSizing: 'border-box', background: theme.color.surface, borderRadius: 32, padding, boxShadow: '0 30px 80px rgba(13,42,58,0.25)', display: 'flex', flexDirection: 'column', gap, fontFamily: theme.font.body }}>
        {children}
      </div>
    </div>
  )
}

function PersonAvatar({ name, size, doctor }: { name: string; size: number; doctor?: boolean }) {
  const letters = initials(name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
  return (
    <span style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, background: doctor ? theme.avatarGradient : theme.patientGradient, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: `600 ${Math.round(size * 0.36)}px ${theme.font.heading}`, color: theme.color.text }}>
      {letters}
    </span>
  )
}

function Waveform({ levels, color, height, active, bars = 22 }: { levels: number[]; color: string; height: number; active: boolean; bars?: number }) {
  const shown = levels.slice(-bars)
  return (
    <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 3, height, flexShrink: 0 }}>
      {shown.map((level, i) => (
        <span key={i} style={{ width: 4, borderRadius: 2, height: active ? Math.max(4, level * height) : 4, background: active ? color : `${color}66`, transition: 'height 90ms linear' }} />
      ))}
    </span>
  )
}

const pill: CSSProperties = { display: 'inline-flex', alignItems: 'center', background: theme.color.surface, border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.pill, color: theme.color.text, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }

function PillButton({ icon, ink, onClick, disabled, style, children }: { icon?: string; ink?: boolean; onClick: () => void; disabled?: boolean; style?: CSSProperties; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...pill, height: 44, padding: '0 20px', gap: 10, justifyContent: 'center', font: `700 15px ${theme.font.body}`, ...(ink ? { background: theme.color.text, borderColor: theme.color.text, color: theme.color.primaryText } : {}), opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer', ...style }}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}

function CtaButton({ icon, iconSize, onClick, disabled, style, children }: { icon: string; iconSize: number; onClick: () => void; disabled?: boolean; style?: CSSProperties; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: 'none', borderRadius: 26, background: theme.ctaGradient, color: theme.color.primaryText, font: `600 20px/1.2 ${theme.font.heading}`, letterSpacing: -0.2, boxShadow: '0 12px 26px rgba(13,42,58,0.2)', whiteSpace: 'nowrap', flexShrink: 0, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer', ...style }}>
      <Icon name={icon} size={iconSize} />
      {children}
    </button>
  )
}

function RoundButton({ icon, iconSize, size, label, onClick, disabled }: { icon: string; iconSize: number; size: number; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button aria-label={label} onClick={onClick} disabled={disabled} style={{ width: size, height: size, borderRadius: size / 2, border: 'none', background: theme.color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <Icon name={icon} size={iconSize} />
    </button>
  )
}

function StepChip({ children }: { children: ReactNode }) {
  return <span style={{ justifySelf: 'start', padding: '6px 12px', borderRadius: theme.radius.pill, background: theme.color.primaryBg, color: theme.color.primary, font: `600 12px/1.45 ${theme.font.body}` }}>{children}</span>
}

