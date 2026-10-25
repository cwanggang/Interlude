// The microphone side of a live visit (Figma 6.5b–d). One mic stream feeds two recorders:
//  - the visit recording, which goes through visits.create afterwards. Its gain is 0 while the
//    active speaker has not agreed to be recorded, so only consenting voices are kept;
//  - short per-turn clips, cut on a pause in speech or when the speaker changes, that are
//    transcribed and translated live by interpreter.translateTurn (only with translation consent).
import { useAction, useMutation } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'

export type Speaker = 'doctor' | 'patient'
export type Language = 'en' | 'es'
export type Turn = { id: number; speaker: Speaker; at: number; original: string; translated: string; status: 'pending' | 'done' | 'failed' }

const TICK_MS = 100
const SPEECH_RMS = 0.02 // louder than this counts as speech
const END_OF_TURN_MS = 1200 // this much quiet after speech ends a turn
const MIN_SPEECH_MS = 400 // shorter clips are noise, not a turn
const MAX_TURN_MS = 25_000
const MAX_SILENT_CLIP_MS = 10_000 // restart a clip that never heard speech, to keep clips short
const BARS = 30

type Segment = { recorder: MediaRecorder; speaker: Speaker; startedAt: number; heardMs: number; quietMs: number; send: boolean }

export function useLiveSession(opts: { appointmentId: Id<'appointments'>; recordConsent: Record<Speaker, boolean>; translate: boolean; languages: Record<Speaker, Language> }) {
  const generateUploadUrl = useMutation(api.interpreter.generateUploadUrl)
  const translateTurn = useAction(api.interpreter.translateTurn)

  const [status, setStatus] = useState<'starting' | 'live' | 'paused' | 'error'>('starting')
  const [error, setError] = useState<string | null>(null)
  const [speaker, setSpeakerState] = useState<Speaker>('doctor')
  const [turns, setTurns] = useState<Turn[]>([])
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0))
  const [elapsed, setElapsed] = useState(0)
  const [speaking, setSpeaking] = useState(false)

  // Everything the timer and recorder callbacks read lives in one ref, so they never go stale.
  const r = useRef({
    opts,
    stream: null as MediaStream | null,
    audio: null as AudioContext | null,
    analyser: null as AnalyserNode | null,
    gain: null as GainNode | null,
    full: null as MediaRecorder | null,
    fullChunks: [] as Blob[],
    segment: null as Segment | null,
    speaker: 'doctor' as Speaker,
    paused: false,
    tts: false, // reading a translation aloud: not part of the visit
    elapsed: 0,
    nextId: 1,
    recent: [] as string[], // last few turns, so the interpreter can fix mishearings from context
    timer: 0,
    closed: false,
  })
  useEffect(() => {
    r.current.opts = opts
  })

  const sendClip = useCallback(
    async (blob: Blob, who: Speaker, at: number) => {
      const id = r.current.nextId++
      const { languages } = r.current.opts
      const from = languages[who]
      const to = languages[who === 'doctor' ? 'patient' : 'doctor']
      setTurns((all) => [...all, { id, speaker: who, at, original: '', translated: '', status: 'pending' }])
      try {
        const url = await generateUploadUrl()
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob })
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
        const { storageId } = (await res.json()) as { storageId: string }
        const out = await translateTurn({ storageId: storageId as Id<'_storage'>, from, to, appointmentId: r.current.opts.appointmentId, recent: r.current.recent.slice(-4) })
        if (out.original) r.current.recent = [...r.current.recent, `${who}: ${out.original}`].slice(-8)
        setTurns((all) => (out.original ? all.map((t) => (t.id === id ? { ...t, ...out, status: 'done' } : t)) : all.filter((t) => t.id !== id)))
      } catch (e) {
        console.error('[live visit] turn failed', e)
        setTurns((all) => all.map((t) => (t.id === id ? { ...t, status: 'failed' } : t)))
      }
    },
    [generateUploadUrl, translateTurn],
  )

  const applyGain = useCallback(() => {
    const s = r.current
    if (s.gain) s.gain.gain.value = !s.tts && s.opts.recordConsent[s.speaker] ? 1 : 0
  }, [])

  const startSegment = useCallback(() => {
    const s = r.current
    if (!s.stream || !s.opts.translate || s.paused || s.closed) return
    const recorder = new MediaRecorder(s.stream)
    const chunks: Blob[] = []
    const segment: Segment = { recorder, speaker: s.speaker, startedAt: s.elapsed, heardMs: 0, quietMs: 0, send: false }
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.onstop = () => {
      if (segment.send) void sendClip(new Blob(chunks, { type: recorder.mimeType }), segment.speaker, segment.startedAt)
    }
    recorder.start()
    s.segment = segment
  }, [sendClip])

  /** Ends the current clip (sending it if it heard speech) and starts the next one. */
  const cutSegment = useCallback(
    (send: boolean, restart = true) => {
      const s = r.current
      const segment = s.segment
      s.segment = null
      if (segment && segment.recorder.state !== 'inactive') {
        segment.send = send && segment.heardMs >= MIN_SPEECH_MS
        segment.recorder.stop()
      }
      if (restart) startSegment()
    },
    [startSegment],
  )

  useEffect(() => {
    const s = r.current
    let cancelled = false
    Object.assign(s, { closed: false, paused: false, fullChunks: [], elapsed: 0 })
    void (async () => {
      try {
        if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record audio.')
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        const audio = new AudioContext()
        const source = audio.createMediaStreamSource(stream)
        const analyser = audio.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        const gain = audio.createGain()
        const destination = audio.createMediaStreamDestination()
        source.connect(gain).connect(destination)
        Object.assign(s, { stream, audio, analyser, gain })
        applyGain()
        if (s.opts.recordConsent.doctor || s.opts.recordConsent.patient) {
          const full = new MediaRecorder(destination.stream)
          full.ondataavailable = (e) => e.data.size && s.fullChunks.push(e.data)
          full.start(1000)
          s.full = full
        }
        startSegment()
        setStatus('live')

        const buffer = new Float32Array(analyser.fftSize)
        s.timer = window.setInterval(() => {
          if (s.paused) return
          s.elapsed += TICK_MS
          setElapsed(s.elapsed)
          analyser.getFloatTimeDomainData(buffer)
          let sum = 0
          for (const x of buffer) sum += x * x
          const rms = s.tts ? 0 : Math.sqrt(sum / buffer.length)
          setLevels((prev) => [...prev.slice(1), Math.min(1, rms * 12)])
          const talking = rms > SPEECH_RMS
          setSpeaking(talking)
          const seg = s.segment
          if (!seg) return
          if (talking) {
            seg.heardMs += TICK_MS
            seg.quietMs = 0
          } else {
            seg.quietMs += TICK_MS
          }
          const length = s.elapsed - seg.startedAt
          if (seg.heardMs >= MIN_SPEECH_MS && seg.quietMs >= END_OF_TURN_MS) cutSegment(true)
          else if (length >= MAX_TURN_MS) cutSegment(true)
          else if (seg.heardMs === 0 && length >= MAX_SILENT_CLIP_MS) cutSegment(false)
        }, TICK_MS)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      s.closed = true
      window.clearInterval(s.timer)
      if (s.segment && s.segment.recorder.state !== 'inactive') s.segment.recorder.stop()
      s.segment = null
      if (s.full && s.full.state !== 'inactive') s.full.stop()
      s.stream?.getTracks().forEach((t) => t.stop())
      void s.audio?.close()
      window.speechSynthesis?.cancel()
    }
  }, [applyGain, cutSegment, startSegment])

  /** Who is talking now. Sends what the previous speaker said as their turn. */
  const setSpeaker = useCallback(
    (next: Speaker) => {
      const s = r.current
      if (next === s.speaker) return
      s.speaker = next
      setSpeakerState(next)
      applyGain()
      if (!s.paused) cutSegment(true)
    },
    [applyGain, cutSegment],
  )

  const pause = useCallback(() => {
    const s = r.current
    cutSegment(true, false)
    s.paused = true
    if (s.full?.state === 'recording') s.full.pause()
    setStatus('paused')
    setSpeaking(false)
  }, [cutSegment])

  const resume = useCallback(() => {
    const s = r.current
    s.paused = false
    if (s.full?.state === 'paused') s.full.resume()
    startSegment()
    setStatus('live')
  }, [startSegment])

  /** Reads a translation aloud. The mic is ignored and the recording muted meanwhile. */
  const readAloud = useCallback(
    (text: string, language: Language) => {
      const s = r.current
      if (!text || !window.speechSynthesis) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = language === 'es' ? 'es-US' : 'en-US'
      let finished = false
      const done = () => {
        if (finished) return
        finished = true
        s.tts = false
        applyGain()
        if (!s.paused && !s.segment) startSegment()
      }
      utterance.onend = done
      utterance.onerror = done
      s.tts = true
      applyGain()
      cutSegment(true, false)
      window.speechSynthesis.speak(utterance)
      // Some browsers never fire onend (no audio device); don't leave the mic ignored.
      window.setTimeout(done, Math.max(4000, text.length * 110))
    },
    [applyGain, cutSegment, startSegment],
  )

  /** Stops everything. Resolves with the visit recording, or null when nothing was recorded. */
  const finish = useCallback(async (): Promise<Blob | null> => {
    const s = r.current
    cutSegment(true, false)
    s.closed = true
    window.clearInterval(s.timer)
    window.speechSynthesis?.cancel()
    const full = s.full
    let blob: Blob | null = null
    if (full && full.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        full.onstop = () => resolve()
        full.stop()
      })
      blob = new Blob(s.fullChunks, { type: full.mimeType })
    }
    s.stream?.getTracks().forEach((t) => t.stop())
    void s.audio?.close()
    return blob && blob.size > 0 ? blob : null
  }, [cutSegment])

  return { status, error, speaker, setSpeaker, turns, levels, elapsed, speaking, pause, resume, readAloud, finish }
}

export function clock(ms: number): string {
  const total = Math.floor(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
