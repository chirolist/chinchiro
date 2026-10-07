export const STARTING_MONEY = 20_000
export const MIN_BET = 100
export const BET_PRESETS = [100, 500, 1_000, 5_000] as const

export type Actor = "player" | "cpu"
export type DieFace = 1 | 2 | 3 | 4 | 5 | 6
export type Dice = [DieFace, DieFace, DieFace]
export type HandKind = "pinzoro" | "arashi" | "shigoro" | "me" | "hifumi" | "buta"

export interface Hand {
  kind: HandKind
  dice: Dice
  /** 通常の目、またはゾロ目の数字 */
  face: number | null
  rank: number
  multiplier: number
  /** 出した側が支払う役 */
  loses: boolean
  /** 親のこの役だけでラウンドが決まる */
  instant: boolean
  label: string
}

export interface Outcome {
  winner: Actor | "draw"
  multiplier: number
  payout: number
  capped: boolean
  title: string
  subtitle: string
  detail: string
  seal: string
}

export interface HandGuideRow {
  label: string
  example: Dice
  result: string
  blurb: string
}

export const HAND_GUIDE: HandGuideRow[] = [
  {
    label: "ピンゾロ",
    example: [1, 1, 1],
    result: "5倍の勝ち",
    blurb: "1が3つ揃った最強の役です。",
  },
  {
    label: "アラシ",
    example: [6, 6, 6],
    result: "3倍の勝ち",
    blurb: "2から6のゾロ目です。数字による強さの差はありません。",
  },
  {
    label: "シゴロ",
    example: [4, 5, 6],
    result: "2倍の勝ち",
    blurb: "4・5・6。順不同でも同じ役です。",
  },
  {
    label: "6の目",
    example: [6, 1, 1],
    result: "1倍",
    blurb: "ペアが揃ったとき、残りの1個が目です。6が最も強く、1が最も弱いです。",
  },
  {
    label: "5の目",
    example: [5, 3, 3],
    result: "1倍",
    blurb: "ペアと5。",
  },
  {
    label: "4の目",
    example: [4, 2, 2],
    result: "1倍",
    blurb: "ペアと4。",
  },
  {
    label: "3の目",
    example: [3, 6, 6],
    result: "1倍",
    blurb: "ペアと3。",
  },
  {
    label: "2の目",
    example: [2, 5, 5],
    result: "1倍",
    blurb: "ペアと2。",
  },
  {
    label: "1の目",
    example: [1, 4, 4],
    result: "1倍",
    blurb: "ペアと1。通常の目では最弱です。",
  },
  {
    label: "ヒフミ",
    example: [1, 2, 3],
    result: "2倍払い",
    blurb: "1・2・3。出した方が負けます。",
  },
  {
    label: "ブタ",
    example: [1, 2, 4],
    result: "1倍払い",
    blurb: "この出目は役なしです。3杯とも役がなければブタになり、出した方が負けます。",
  },
]

export function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`
}

export function actorName(actor: Actor): string {
  return actor === "player" ? "あなた" : "CPU"
}

export function opponent(actor: Actor): Actor {
  return actor === "player" ? "cpu" : "player"
}

export function rollDice(rng: () => number = Math.random): Dice {
  const face = (): DieFace => (1 + Math.floor(rng() * 6)) as DieFace
  return [face(), face(), face()]
}

export function evaluateDice(dice: Dice): Hand | null {
  const [a, b, c] = dice
  const sorted = [a, b, c].slice().sort((x, y) => x - y)

  if (a === b && b === c) {
    if (a === 1) return makeHand("pinzoro", dice, 1, 100, 5, false, true, "ピンゾロ")
    return makeHand("arashi", dice, a, 80, 3, false, true, "アラシ")
  }

  if (sorted[0] === 1 && sorted[1] === 2 && sorted[2] === 3) {
    return makeHand("hifumi", dice, null, 1, 2, true, true, "ヒフミ")
  }

  if (sorted[0] === 4 && sorted[1] === 5 && sorted[2] === 6) {
    return makeHand("shigoro", dice, null, 70, 2, false, true, "シゴロ")
  }

  if (a === b || a === c || b === c) {
    const face = a === b ? c : a === c ? b : a
    return makeHand("me", dice, face, 10 + face, 1, false, false, `${face}の目`)
  }

  return null
}

export function buta(dice: Dice): Hand {
  return makeHand("buta", dice, null, 0, 1, true, true, "ブタ")
}

export function clampBet(bet: number, playerMoney: number, cpuMoney: number): number {
  const cap = Math.min(playerMoney, cpuMoney)
  if (cap <= 0) return 0
  const min = Math.min(MIN_BET, cap)
  const safe = Number.isFinite(bet) ? Math.floor(bet) : min
  return Math.min(cap, Math.max(min, safe))
}

export function settle(input: {
  parent: Actor
  parentHand: Hand
  childHand: Hand | null
  bet: number
  playerMoney: number
  cpuMoney: number
}): Outcome {
  const decision = decide(input.parent, input.parentHand, input.childHand)

  if (decision.winner === "draw") {
    return {
      winner: "draw",
      multiplier: 0,
      payout: 0,
      capped: false,
      title: "引き分け",
      subtitle: "賭け金は動きません",
      detail: decision.reason,
      seal: decision.seal,
    }
  }

  const loser = opponent(decision.winner)
  const loserMoney = loser === "player" ? input.playerMoney : input.cpuMoney
  const raw = input.bet * decision.multiplier
  const payout = Math.min(raw, loserMoney)
  const capped = payout < raw
  const detail = capped
    ? `${decision.reason} ${decision.multiplier}倍なら${formatYen(raw)}ですが、所持金の上限で${formatYen(payout)}です`
    : decision.reason

  return {
    winner: decision.winner,
    multiplier: decision.multiplier,
    payout,
    capped,
    title: decision.winner === "player" ? "あなたの勝ち" : "CPUの勝ち",
    subtitle:
      decision.winner === "player"
        ? `${formatYen(payout)}を受け取りました`
        : `${formatYen(payout)}を支払いました`,
    detail,
    seal: decision.seal,
  }
}

export function applyOutcome(
  playerMoney: number,
  cpuMoney: number,
  outcome: Outcome,
): { playerMoney: number; cpuMoney: number } {
  if (outcome.winner === "draw") return { playerMoney, cpuMoney }
  if (outcome.winner === "player") {
    return {
      playerMoney: playerMoney + outcome.payout,
      cpuMoney: cpuMoney - outcome.payout,
    }
  }
  return {
    playerMoney: playerMoney - outcome.payout,
    cpuMoney: cpuMoney + outcome.payout,
  }
}

function decide(
  parent: Actor,
  parentHand: Hand,
  childHand: Hand | null,
): { winner: Actor | "draw"; multiplier: number; reason: string; seal: string } {
  const child = opponent(parent)

  if (childHand === null) {
    if (!parentHand.instant) throw new Error("親の通常の目では子が振ります")
    if (parentHand.loses) {
      return {
        winner: child,
        multiplier: parentHand.multiplier,
        reason: `親の${parentHand.label}は${parentHand.multiplier}倍払いです`,
        seal: parentHand.label,
      }
    }
    return {
      winner: parent,
      multiplier: parentHand.multiplier,
      reason: `親の${parentHand.label}は${parentHand.multiplier}倍です`,
      seal: parentHand.label,
    }
  }

  if (parentHand.instant) throw new Error("親の即決役では子は振りません")

  if (
    childHand.kind === "pinzoro" ||
    childHand.kind === "arashi" ||
    childHand.kind === "shigoro"
  ) {
    return {
      winner: child,
      multiplier: childHand.multiplier,
      reason: `子の${childHand.label}は${childHand.multiplier}倍です`,
      seal: childHand.label,
    }
  }

  if (childHand.loses) {
    return {
      winner: parent,
      multiplier: childHand.multiplier,
      reason: `子の${childHand.label}は${childHand.multiplier}倍払いです`,
      seal: childHand.label,
    }
  }

  if (
    parentHand.kind !== "me" ||
    childHand.kind !== "me" ||
    parentHand.face === null ||
    childHand.face === null
  ) {
    throw new Error("目の比較ができません")
  }

  if (childHand.face > parentHand.face) {
    return {
      winner: child,
      multiplier: 1,
      reason: `子の${childHand.label}が親の${parentHand.label}を上回りました`,
      seal: childHand.label,
    }
  }

  if (childHand.face < parentHand.face) {
    return {
      winner: parent,
      multiplier: 1,
      reason: `親の${parentHand.label}が子の${childHand.label}を上回りました`,
      seal: parentHand.label,
    }
  }

  return {
    winner: "draw",
    multiplier: 0,
    reason: `${parentHand.label}同士で引き分けです`,
    seal: "引分",
  }
}

function makeHand(
  kind: HandKind,
  dice: Dice,
  face: number | null,
  rank: number,
  multiplier: number,
  loses: boolean,
  instant: boolean,
  label: string,
): Hand {
  return { kind, dice, face, rank, multiplier, loses, instant, label }
}
