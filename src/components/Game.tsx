"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import { Die } from "@/components/Die"
import {
  BET_PRESETS,
  HAND_GUIDE,
  MIN_BET,
  actorName,
  formatYen,
  rollDice,
  type Actor,
  type Dice,
} from "@/lib/chinchiro"
import {
  createGame,
  currentThrows,
  isActing,
  lastThrow,
  playerCanReroll,
  playerCanRoll,
  reduce,
  shouldAutoAdvance,
  shouldAutoRoll,
  type GameState,
  type RoundRecord,
  type ThrowView,
} from "@/lib/game"
import { useSfx } from "@/lib/sfx"

export function Game() {
  const [state, dispatch] = useReducer(reduce, undefined, createGame)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [dice, setDice] = useState<Dice>([1, 1, 1])
  const { muted, toggle, unlock, roll, win, lose, draw } = useSfx()
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (rulesOpen || !shouldAutoRoll(state)) return
    const id = window.setTimeout(() => dispatch({ type: "startRoll" }), 680)
    return () => window.clearTimeout(id)
  }, [rulesOpen, state])

  useEffect(() => {
    if (rulesOpen || !shouldAutoAdvance(state)) return
    const last = lastThrow(state)
    const wait = last && !last.established ? 850 : 1250
    const id = window.setTimeout(() => dispatch({ type: "advance" }), reducedMotion ? 400 : wait)
    return () => window.clearTimeout(id)
  }, [reducedMotion, rulesOpen, state])

  useEffect(() => {
    if (state.phase !== "rolling") return
    const finalDice = rollDice()
    roll()
    const tick = window.setInterval(() => setDice(rollDice()), reducedMotion ? 120 : 55)
    const done = window.setTimeout(
      () => {
        window.clearInterval(tick)
        setDice(finalDice)
        dispatch({ type: "reveal", dice: finalDice })
      },
      reducedMotion ? 180 : 760,
    )
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(done)
    }
  }, [dispatch, reducedMotion, roll, state.attempt, state.phase, state.round, state.turn])

  useEffect(() => {
    if ((state.phase !== "result" && state.phase !== "gameover") || !state.outcome) return
    if (state.outcome.winner === "player") win()
    else if (state.outcome.winner === "cpu") lose()
    else draw()
  }, [draw, lose, state.outcome, state.phase, win])

  const showBowlDice =
    state.phase === "rolling" ||
    state.phase === "revealed" ||
    state.phase === "result" ||
    state.phase === "gameover" ||
    (state.phase === "ready" && currentThrows(state).length > 0)
  const seal = sealLabel(state)
  const announcement = announce(state)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col px-4 py-4" data-phase={state.phase}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-[0.18em]">チンチロ</h1>
          <p className="mt-1 text-sm text-[#f0d7a2]">
            第{state.round}回 · 親は{actorName(state.parent)}
            {state.phase !== "betting" && ` · 賭け金 ${formatYen(state.bet)}`}
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={() => setRulesOpen(true)}>
            役一覧
          </button>
          <button
            type="button"
            className="btn-ghost"
            aria-pressed={muted}
            onClick={() => {
              unlock()
              toggle()
            }}
          >
            {muted ? "音なし" : "音あり"}
          </button>
        </div>
      </header>

      <div className="mt-4 grid gap-3">
        <PlayerCard actor="cpu" state={state} />
        <PlayerCard actor="player" state={state} />
      </div>

      <div className="stage relative mt-4">
        <div className={`bowl ${state.phase === "rolling" ? "is-shaking" : ""}`}>
          {showBowlDice ? (
            <div className="flex items-end justify-center gap-3">
              {dice.map((value, index) => (
                <Die
                  key={index}
                  value={value}
                  rolling={state.phase === "rolling"}
                  delay={index * 45}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3" aria-hidden>
              {[0, 1, 2].map((slot) => (
                <div key={slot} className="die-ghost" />
              ))}
            </div>
          )}
          {seal && (
            <div className={seal === "引分" ? "seal seal-draw" : "seal"} aria-hidden>
              <span>{seal}</span>
            </div>
          )}
        </div>
      </div>

      {state.phase === "ready" || state.phase === "rolling" || state.phase === "revealed" ? (
        <div className="mt-3 flex justify-center gap-2" aria-hidden>
          {[1, 2, 3].map((cup) => (
            <span key={cup} className={cup <= state.attempt ? "cup on" : "cup"} />
          ))}
        </div>
      ) : null}

      {(state.phase === "result" || state.phase === "gameover") && state.outcome ? (
        <section className="plaque mt-4" aria-live="polite">
          {state.phase === "gameover" && (
            <p className="text-xs tracking-[0.42em] text-[#f0d7a2]">勝負あり</p>
          )}
          <h2
            className={`font-display text-4xl ${
              state.outcome.winner === "player"
                ? "text-[#f0d7a2]"
                : state.outcome.winner === "cpu"
                  ? "text-[#e25a42]"
                  : ""
            }`}
          >
            {state.outcome.title}
          </h2>
          <p className="mt-1 text-lg">{state.outcome.subtitle}</p>
          <p className="mt-2 text-sm leading-6 text-[#f6f0e6]/80">{state.outcome.detail}</p>
        </section>
      ) : (
        <p className="mt-4 min-h-6 text-center text-sm text-[#f0d7a2]" aria-live="polite">
          {announcement}
        </p>
      )}

      <div className="mt-4">
        {state.phase === "betting" ? (
          <BetPanel
            state={state}
            onBet={(bet) => dispatch({ type: "setBet", bet })}
            onStart={() => {
              unlock()
              dispatch({ type: "confirmBet" })
            }}
          />
        ) : (
          <ActionBar
            state={state}
            onRoll={() => {
              unlock()
              dispatch({ type: "startRoll" })
            }}
            onReroll={() => {
              unlock()
              dispatch({ type: "reroll" })
            }}
            onNext={() => dispatch({ type: "nextRound" })}
            onReset={() => dispatch({ type: "reset" })}
          />
        )}
      </div>

      <History records={state.history} />
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  )
}

function PlayerCard({ actor, state }: { actor: Actor; state: GameState }) {
  const money = actor === "player" ? state.playerMoney : state.cpuMoney
  const throws = actor === state.parent ? state.parentThrows : state.childThrows
  const hand = actor === state.parent ? state.parentHand : state.childHand
  const delta = moneyDelta(actor, state)
  return (
    <article className={isActing(state, actor) ? "card card-active" : "card"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs tracking-[0.22em] text-[#f0d7a2]">{actorName(actor)}</p>
            {state.parent === actor && <span className="oya">親</span>}
          </div>
          <p key={money} className="money-pop font-display text-3xl tabular-nums">
            {formatYen(money)}
          </p>
          {delta && (
            <p className={delta.startsWith("+") ? "text-sm text-[#f0d7a2]" : "text-sm text-[#e25a42]"}>
              {delta}
            </p>
          )}
        </div>
        {hand && (
          <div className="flex gap-1" aria-hidden>
            {hand.dice.map((value, index) => (
              <Die key={`${hand.label}-${index}`} value={value} size="sm" />
            ))}
          </div>
        )}
      </div>
      {throws.length > 0 && (
        <p className="mt-2 text-xs leading-5 text-[#f6f0e6]/75">{throws.map(throwText).join(" · ")}</p>
      )}
    </article>
  )
}

function BetPanel({
  state,
  onBet,
  onStart,
}: {
  state: GameState
  onBet: (bet: number) => void
  onStart: () => void
}) {
  const cap = Math.min(state.playerMoney, state.cpuMoney)
  const min = Math.min(MIN_BET, cap)
  return (
    <section>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          className="btn-step"
          onClick={() => onBet(state.bet - 100)}
          disabled={state.bet <= min}
          aria-label="賭け金を100円下げる"
        >
          −
        </button>
        <p className="min-w-36 text-center font-display text-3xl tabular-nums">{formatYen(state.bet)}</p>
        <button
          type="button"
          className="btn-step"
          onClick={() => onBet(state.bet + 100)}
          disabled={state.bet >= cap}
          aria-label="賭け金を100円上げる"
        >
          ＋
        </button>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {BET_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="chip"
            aria-pressed={state.bet === preset}
            disabled={preset > cap}
            onClick={() => onBet(preset)}
          >
            {preset.toLocaleString("ja-JP")}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={state.bet === cap} onClick={() => onBet(cap)}>
          全額
        </button>
      </div>
      <p className="mt-3 text-center text-xs leading-5 text-[#f6f0e6]/70">
        支払いは最大5倍。相手の所持金を超えるときは、そこまでです。
      </p>
      <button type="button" className="btn-main mt-4" onClick={onStart}>
        この賭け金で勝負
      </button>
    </section>
  )
}

function ActionBar({
  state,
  onRoll,
  onReroll,
  onNext,
  onReset,
}: {
  state: GameState
  onRoll: () => void
  onReroll: () => void
  onNext: () => void
  onReset: () => void
}) {
  if (playerCanRoll(state)) {
    return (
      <button type="button" className="btn-main" onClick={onRoll}>
        振る
      </button>
    )
  }
  if (playerCanReroll(state)) {
    return (
      <button type="button" className="btn-main" onClick={onReroll}>
        振り直す
      </button>
    )
  }
  if (state.phase === "result") {
    return (
      <button type="button" className="btn-main" onClick={onNext}>
        次の勝負
      </button>
    )
  }
  if (state.phase === "gameover") {
    return (
      <button type="button" className="btn-main" onClick={onReset}>
        もう一度やる
      </button>
    )
  }
  const waiting =
    state.turn === "cpu"
      ? state.phase === "revealed"
        ? "役を確認しています"
        : "CPUが盃を振っています"
      : state.phase === "rolling"
        ? "振っています"
        : "役を確認しています"
  return <p className="py-4 text-center text-sm text-[#f0d7a2]">{waiting}</p>
}

function History({ records }: { records: RoundRecord[] }) {
  return (
    <details className="mt-6 mb-6 border-t border-[#5c4632] pt-4">
      <summary className="text-sm tracking-[0.16em] text-[#f0d7a2]">勝負の記録</summary>
      {records.length === 0 ? (
        <p className="mt-3 text-sm text-[#f6f0e6]/70">まだ勝負はありません。</p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {records.map((record) => (
            <li key={`${record.round}-${record.title}-${record.payout}`} className="text-sm leading-6">
              <span className="text-[#f0d7a2]">第{record.round}回</span>
              <span> · {record.title}</span>
              <span> · {historyMoney(record)}</span>
              <span className="block text-[#f6f0e6]/70">
                親 {record.parentLabel}
                {record.childLabel ? ` / 子 ${record.childLabel}` : " / 子は振らず"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}

function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="rules"
      onClose={onClose}
      aria-labelledby="rules-title"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="rules-title" className="font-display text-3xl tracking-[0.14em]">
          役一覧
        </h2>
        <button type="button" className="btn-ghost" onClick={onClose}>
          閉じる
        </button>
      </div>
      <div className="mt-4 grid gap-3 text-sm leading-6">
        <p>あなたとCPUが、それぞれ2万円から勝負します。どちらかの所持金が0円になったら終わりです。</p>
        <p>最初の親はあなたです。勝負が終わるたびに親は交代します。親が先に、最大3杯まで振ります。</p>
        <p>役が付けば、その場で確定します。役なしなら振り直し、3杯とも役がなければブタです。</p>
        <p>
          親がピンゾロ・アラシ・シゴロ・ヒフミ・ブタのときは、子は振りません。親の役が通常の目のときだけ子が振り、目の大きい方が1倍を受け取ります。同じ目は引き分けです。
        </p>
      </div>
      <ol className="mt-5 grid gap-3">
        {HAND_GUIDE.map((row, index) => (
          <li key={row.label} className="card flex items-center gap-3">
            <span className="w-5 text-center font-display text-[#f0d7a2]">{index + 1}</span>
            <div className="flex gap-1" aria-hidden>
              {row.example.map((value, dieIndex) => (
                <Die key={dieIndex} value={value} size="sm" />
              ))}
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg">
                {row.label}
                <span className="ml-2 text-sm text-[#f0d7a2]">{row.result}</span>
              </p>
              <p className="text-xs leading-5 text-[#f6f0e6]/75">{row.blurb}</p>
            </div>
          </li>
        ))}
      </ol>
    </dialog>
  )
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReduced(media.matches)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [])
  return reduced
}

function throwText(view: ThrowView): string {
  return `${view.cup}杯目 ${view.label}`
}

function moneyDelta(actor: Actor, state: GameState): string | null {
  const outcome = state.outcome
  if (!outcome || outcome.winner === "draw" || outcome.payout === 0) return null
  if (state.phase !== "result" && state.phase !== "gameover") return null
  const won = outcome.winner === actor
  return `${won ? "+" : "−"}${formatYen(outcome.payout)}`
}

function historyMoney(record: RoundRecord): string {
  if (record.winner === "draw") return "変動なし"
  const sign = record.winner === "player" ? "+" : "−"
  return `${sign}${formatYen(record.payout)}`
}

function sealLabel(state: GameState): string | null {
  if (state.phase === "revealed") {
    const last = lastThrow(state)
    return last?.established ? last.label : null
  }
  if ((state.phase === "result" || state.phase === "gameover") && state.outcome) {
    return state.outcome.seal
  }
  return null
}

function announce(state: GameState): string {
  const who = actorName(state.turn)
  if (state.phase === "betting") return "賭け金を決めてください"
  if (state.phase === "rolling") return `${who}が${state.attempt}杯目を振っています`
  if (state.phase === "ready") {
    const childOpening =
      state.turn !== state.parent && state.childThrows.length === 0 && state.parentHand
    if (childOpening && state.parentHand) {
      return `親は${state.parentHand.label}。${who}が子として振ります`
    }
    return state.turn === "player" ? `${state.attempt}杯目を振ってください` : `${who}の${state.attempt}杯目です`
  }
  if (state.phase === "revealed") {
    const last = lastThrow(state)
    if (!last) return ""
    const eyes = last.dice.join("、")
    return `${who}の${state.attempt}杯目は${eyes}。${last.label}`
  }
  return ""
}
