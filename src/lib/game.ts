import {
  applyOutcome,
  buta,
  clampBet,
  evaluateDice,
  opponent,
  settle,
  STARTING_MONEY,
  type Actor,
  type Dice,
  type Hand,
  type Outcome,
} from "./chinchiro"

export type Phase = "betting" | "ready" | "rolling" | "revealed" | "result" | "gameover"

export interface ThrowView {
  cup: number
  dice: Dice
  label: string
  established: boolean
}

export interface RoundRecord {
  round: number
  parent: Actor
  bet: number
  parentLabel: string
  childLabel: string | null
  title: string
  winner: Outcome["winner"]
  payout: number
}

export interface GameState {
  playerMoney: number
  cpuMoney: number
  parent: Actor
  round: number
  bet: number
  phase: Phase
  turn: Actor
  attempt: number
  parentThrows: ThrowView[]
  childThrows: ThrowView[]
  parentHand: Hand | null
  childHand: Hand | null
  outcome: Outcome | null
  history: RoundRecord[]
}

export type Action =
  | { type: "setBet"; bet: number }
  | { type: "confirmBet" }
  | { type: "startRoll" }
  | { type: "reroll" }
  | { type: "reveal"; dice: Dice }
  | { type: "advance" }
  | { type: "nextRound" }
  | { type: "reset" }

export function createGame(): GameState {
  return {
    playerMoney: STARTING_MONEY,
    cpuMoney: STARTING_MONEY,
    parent: "player",
    round: 1,
    bet: 1_000,
    phase: "betting",
    turn: "player",
    attempt: 1,
    parentThrows: [],
    childThrows: [],
    parentHand: null,
    childHand: null,
    outcome: null,
    history: [],
  }
}

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "setBet":
      if (state.phase !== "betting") return state
      return {
        ...state,
        bet: clampBet(action.bet, state.playerMoney, state.cpuMoney),
      }
    case "confirmBet":
      return confirmBet(state)
    case "startRoll":
      if (state.phase !== "ready") return state
      return { ...state, phase: "rolling" }
    case "reroll":
      return reroll(state)
    case "reveal":
      return reveal(state, action.dice)
    case "advance":
      return advance(state)
    case "nextRound":
      return nextRound(state)
    case "reset":
      return createGame()
    default:
      return state
  }
}

export function currentThrows(state: GameState): ThrowView[] {
  return state.turn === state.parent ? state.parentThrows : state.childThrows
}

export function lastThrow(state: GameState): ThrowView | undefined {
  const throws = currentThrows(state)
  return throws[throws.length - 1]
}

export function playerCanRoll(state: GameState): boolean {
  return state.phase === "ready" && state.turn === "player"
}

export function playerCanReroll(state: GameState): boolean {
  const last = lastThrow(state)
  return (
    state.phase === "revealed" &&
    state.turn === "player" &&
    state.attempt < 3 &&
    last !== undefined &&
    !last.established
  )
}

export function shouldAutoRoll(state: GameState): boolean {
  return state.phase === "ready" && state.turn === "cpu"
}

export function shouldAutoAdvance(state: GameState): boolean {
  return state.phase === "revealed" && !playerCanReroll(state)
}

export function isActing(state: GameState, actor: Actor): boolean {
  return (
    state.turn === actor &&
    (state.phase === "ready" || state.phase === "rolling" || state.phase === "revealed")
  )
}

function confirmBet(state: GameState): GameState {
  if (state.phase !== "betting") return state
  const bet = clampBet(state.bet, state.playerMoney, state.cpuMoney)
  if (bet <= 0) return state
  return {
    ...state,
    bet,
    phase: "ready",
    turn: state.parent,
    attempt: 1,
    parentThrows: [],
    childThrows: [],
    parentHand: null,
    childHand: null,
    outcome: null,
  }
}

function reroll(state: GameState): GameState {
  if (!playerCanReroll(state)) return state
  return { ...state, phase: "rolling", attempt: state.attempt + 1 }
}

function reveal(state: GameState, dice: Dice): GameState {
  if (state.phase !== "rolling") return state
  const evaluated = evaluateDice(dice)
  const established = evaluated ?? (state.attempt === 3 ? buta(dice) : null)
  const view: ThrowView = {
    cup: state.attempt,
    dice,
    label: established ? established.label : "役なし",
    established: established !== null,
  }
  const parentTurn = state.turn === state.parent
  return {
    ...state,
    phase: "revealed",
    parentThrows: parentTurn ? [...state.parentThrows, view] : state.parentThrows,
    childThrows: parentTurn ? state.childThrows : [...state.childThrows, view],
    parentHand: parentTurn ? (established ?? state.parentHand) : state.parentHand,
    childHand: parentTurn ? state.childHand : (established ?? state.childHand),
  }
}

function advance(state: GameState): GameState {
  if (state.phase !== "revealed") return state
  if (playerCanReroll(state)) return state
  const parentTurn = state.turn === state.parent
  const hand = parentTurn ? state.parentHand : state.childHand
  const last = lastThrow(state)

  if (last && !last.established && state.attempt < 3) {
    return { ...state, phase: "ready", attempt: state.attempt + 1 }
  }

  if (!hand) return state

  if (parentTurn && hand.kind === "me") {
    return {
      ...state,
      phase: "ready",
      turn: opponent(state.parent),
      attempt: 1,
    }
  }

  const outcome = settle({
    parent: state.parent,
    parentHand: state.parentHand ?? hand,
    childHand: parentTurn ? null : state.childHand,
    bet: state.bet,
    playerMoney: state.playerMoney,
    cpuMoney: state.cpuMoney,
  })
  const money = applyOutcome(state.playerMoney, state.cpuMoney, outcome)
  const over = money.playerMoney === 0 || money.cpuMoney === 0

  return {
    ...state,
    playerMoney: money.playerMoney,
    cpuMoney: money.cpuMoney,
    outcome,
    phase: over ? "gameover" : "result",
    history: [
      {
        round: state.round,
        parent: state.parent,
        bet: state.bet,
        parentLabel: (state.parentHand ?? hand).label,
        childLabel: parentTurn ? null : (state.childHand?.label ?? null),
        title: outcome.title,
        winner: outcome.winner,
        payout: outcome.payout,
      },
      ...state.history,
    ].slice(0, 8),
  }
}

function nextRound(state: GameState): GameState {
  if (state.phase !== "result") return state
  const parent = opponent(state.parent)
  return {
    ...state,
    parent,
    round: state.round + 1,
    bet: clampBet(state.bet, state.playerMoney, state.cpuMoney),
    phase: "betting",
    turn: parent,
    attempt: 1,
    parentThrows: [],
    childThrows: [],
    parentHand: null,
    childHand: null,
    outcome: null,
  }
}
