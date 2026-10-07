"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function useSfx() {
  const ctxRef = useRef<AudioContext | null>(null)
  const mutedRef = useRef(false)
  const [muted, setMuted] = useState(false)

  const unlock = useCallback(() => {
    const Ctx = window.AudioContext
    if (!ctxRef.current) ctxRef.current = new Ctx()
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume()
  }, [])

  const withCtx = useCallback(
    (play: (ctx: AudioContext) => void) => {
      if (mutedRef.current) return
      try {
        unlock()
        const ctx = ctxRef.current
        if (!ctx) return
        play(ctx)
      } catch {
        // 音声が使えない環境では黙って続行する
      }
    },
    [unlock],
  )

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  const toggle = useCallback(() => {
    setMuted((current) => !current)
  }, [])

  const roll = useCallback(() => {
    withCtx((ctx) => {
      const duration = 0.16
      const length = Math.floor(ctx.sampleRate * duration)
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i += 1) {
        const fade = 1 - i / length
        data[i] = (Math.random() * 2 - 1) * fade * fade
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      const filter = ctx.createBiquadFilter()
      filter.type = "bandpass"
      filter.frequency.value = 900
      filter.Q.value = 0.7
      const gain = ctx.createGain()
      gain.gain.value = 0.2
      source.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      source.start()
    })
  }, [withCtx])

  const win = useCallback(() => {
    withCtx((ctx) => {
      tone(ctx, 523, 0.12, "triangle", 0.06, 0)
      tone(ctx, 659, 0.14, "triangle", 0.06, 0.1)
      tone(ctx, 784, 0.22, "triangle", 0.05, 0.2)
    })
  }, [withCtx])

  const lose = useCallback(() => {
    withCtx((ctx) => {
      tone(ctx, 196, 0.16, "sine", 0.05, 0)
      tone(ctx, 146, 0.24, "sine", 0.05, 0.12)
    })
  }, [withCtx])

  const draw = useCallback(() => {
    withCtx((ctx) => {
      tone(ctx, 440, 0.12, "sine", 0.04, 0)
    })
  }, [withCtx])

  return { muted, toggle, unlock, roll, win, lose, draw }
}

function tone(
  ctx: AudioContext,
  freq: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delay: number,
) {
  const start = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}
