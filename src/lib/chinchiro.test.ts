import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  HAND_GUIDE,
  STARTING_MONEY,
  applyOutcome,
  clampBet,
  evaluateDice,
  formatYen,
  rollDice,
  settle,
  type Dice,
  type Hand,
} from "./chinchiro"
import {
  createGame,
  playerCanReroll,
  reduce,
  type GameState,
} from "./game"

function dice(a: number, b: number, c: number): Dice {
  return [a as Dice[0], b as Dice[1], c as Dice[2]]
}

function mustHand(value: Dice): Hand {
  const hand = evaluateDice(value)
  assert.ok(hand)
  return hand
}

describe("evaluateDice", () => {
  it("216通りを役へ分類する", () => {
    const counts = { pinzoro: 0, arashi: 0, shigoro: 0, me: 0, hifumi: 0, buta: 0, none: 0 }
    const faces = [0, 0, 0, 0, 0, 0, 0]
    for (let a = 1; a <= 6; a += 1) {
      for (let b = 1; b <= 6; b += 1) {
        for (let c = 1; c <= 6; c += 1) {
          const hand = evaluateDice(dice(a, b, c))
          counts[hand?.kind ?? "none"] += 1
          if (hand?.kind === "me" && hand.face) faces[hand.face] += 1
        }
      }
    }
    assert.deepEqual(counts, {
      pinzoro: 1,
      arashi: 5,
      shigoro: 6,
      hifumi: 6,
      me: 90,
      buta: 0,
      none: 108,
    })
    for (let face = 1; face <= 6; face += 1) assert.equal(faces[face], 15)
  })

  it("役一覧の見本と判定が一致する", () => {
    for (const row of HAND_GUIDE) {
      const hand = evaluateDice(row.example)
      if (row.label === "ブタ") assert.equal(hand, null)
      else assert.equal(hand?.label, row.label)
    }
  })

  it("順不同のシゴロとヒフミを認める", () => {
    assert.equal(evaluateDice(dice(6, 4, 5))?.kind, "shigoro")
    assert.equal(evaluateDice(dice(3, 1, 2))?.kind, "hifumi")
    assert.equal(evaluateDice(dice(2, 5, 2))?.face, 5)
  })
})

describe("settle", () => {
  const base = { bet: 1_000, playerMoney: 20_000, cpuMoney: 20_000, parent: "player" as const }

  it("親の即決役で子は振らない", () => {
    const pin = settle({ ...base, parentHand: mustHand(dice(1, 1, 1)), childHand: null })
    assert.equal(pin.winner, "player")
    assert.equal(pin.payout, 5_000)

    const arashi = settle({ ...base, parentHand: mustHand(dice(3, 3, 3)), childHand: null })
    assert.equal(arashi.payout, 3_000)

    const shigoro = settle({ ...base, parentHand: mustHand(dice(4, 5, 6)), childHand: null })
    assert.equal(shigoro.payout, 2_000)

    const hifumi = settle({ ...base, parentHand: mustHand(dice(1, 2, 3)), childHand: null })
    assert.equal(hifumi.winner, "cpu")
    assert.equal(hifumi.payout, 2_000)
  })

  it("通常の目は大小で決め、同じ目は引き分け", () => {
    const parent = mustHand(dice(4, 2, 2))
    const higher = settle({ ...base, parentHand: parent, childHand: mustHand(dice(6, 1, 1)) })
    assert.equal(higher.winner, "cpu")
    assert.equal(higher.payout, 1_000)

    const lower = settle({ ...base, parentHand: parent, childHand: mustHand(dice(1, 3, 3)) })
    assert.equal(lower.winner, "player")

    const tie = settle({ ...base, parentHand: parent, childHand: mustHand(dice(4, 5, 5)) })
    assert.equal(tie.winner, "draw")
    assert.equal(tie.payout, 0)
  })

  it("子の特殊役はその倍率で勝つ", () => {
    const parent = mustHand(dice(6, 1, 1))
    const child = settle({ ...base, parentHand: parent, childHand: mustHand(dice(1, 1, 1)) })
    assert.equal(child.winner, "cpu")
    assert.equal(child.payout, 5_000)
  })

  it("支払いは敗者の所持金で頭打ちになる", () => {
    const outcome = settle({
      parent: "player",
      parentHand: mustHand(dice(1, 1, 1)),
      childHand: null,
      bet: 1_000,
      playerMoney: 20_000,
      cpuMoney: 3_000,
    })
    assert.equal(outcome.payout, 3_000)
    assert.equal(outcome.capped, true)
    const money = applyOutcome(20_000, 3_000, outcome)
    assert.deepEqual(money, { playerMoney: 23_000, cpuMoney: 0 })
  })
})

describe("clampBet", () => {
  it("下限100円、上限は少ない方の所持金", () => {
    assert.equal(clampBet(1_000, 20_000, 20_000), 1_000)
    assert.equal(clampBet(50, 20_000, 20_000), 100)
    assert.equal(clampBet(100, 80, 20_000), 80)
    assert.equal(clampBet(5_000, 3_000, 8_000), 3_000)
    assert.equal(clampBet(0, 0, 100), 0)
  })

  it("円表示にする", () => {
    assert.equal(formatYen(STARTING_MONEY), "20,000円")
  })
})

describe("reduce", () => {
  it("親のブタは1倍払いで子の勝ち", () => {
    let state = createGame()
    state = reduce(state, { type: "confirmBet" })
    const eyes = [dice(1, 2, 4), dice(2, 3, 5), dice(1, 3, 6)]
    for (let cup = 0; cup < eyes.length; cup += 1) {
      state = reduce(state, { type: cup === 0 ? "startRoll" : "reroll" })
      state = reduce(state, { type: "reveal", dice: eyes[cup] })
    }
    state = reduce(state, { type: "advance" })
    assert.equal(state.parentHand?.kind, "buta")
    assert.equal(state.phase, "result")
    assert.equal(state.outcome?.winner, "cpu")
    assert.equal(state.playerMoney, 19_000)
    assert.equal(state.cpuMoney, 21_000)
    assert.equal(state.childHand, null)
  })

  it("役なしの振り直しはプレイヤーの操作を待つ", () => {
    let state = reduce(createGame(), { type: "confirmBet" })
    state = reduce(state, { type: "startRoll" })
    state = reduce(state, { type: "reveal", dice: dice(1, 2, 4) })
    assert.equal(playerCanReroll(state), true)
    assert.equal(reduce(state, { type: "advance" }), state)
    state = reduce(state, { type: "reroll" })
    assert.equal(state.phase, "rolling")
    assert.equal(state.attempt, 2)
  })

  it("親の通常目のあと子が振り、特殊役で決着する", () => {
    let state = reduce(createGame(), { type: "confirmBet" })
    state = reduce(state, { type: "startRoll" })
    state = reduce(state, { type: "reveal", dice: dice(6, 6, 1) })
    state = reduce(state, { type: "advance" })
    assert.equal(state.turn, "cpu")
    assert.equal(state.attempt, 1)
    state = reduce(state, { type: "startRoll" })
    state = reduce(state, { type: "reveal", dice: dice(6, 6, 6) })
    state = reduce(state, { type: "advance" })
    assert.equal(state.outcome?.winner, "cpu")
    assert.equal(state.playerMoney, 17_000)
    assert.equal(state.cpuMoney, 23_000)
  })

  it("所持金が尽きたら終了し、次の勝負へは進めない", () => {
    let state: GameState = { ...createGame(), playerMoney: 500, cpuMoney: 20_000 }
    state = reduce(state, { type: "setBet", bet: 500 })
    state = reduce(state, { type: "confirmBet" })
    state = reduce(state, { type: "startRoll" })
    state = reduce(state, { type: "reveal", dice: dice(1, 2, 3) })
    state = reduce(state, { type: "advance" })
    assert.equal(state.phase, "gameover")
    assert.equal(state.playerMoney, 0)
    assert.equal(state.cpuMoney, 20_500)
    assert.equal(state.outcome?.capped, true)
    assert.equal(reduce(state, { type: "nextRound" }), state)
    const reset = reduce(state, { type: "reset" })
    assert.equal(reset.playerMoney, STARTING_MONEY)
    assert.equal(reset.phase, "betting")
    assert.equal(reset.parent, "player")
  })

  it("何回勝負しても所持金の合計は4万円で、負にならない", () => {
    const script = [
      dice(1, 2, 4),
      dice(2, 3, 5),
      dice(1, 3, 6),
      dice(6, 6, 1),
      dice(5, 5, 2),
      dice(1, 1, 1),
      dice(4, 5, 6),
      dice(2, 2, 2),
      dice(1, 2, 3),
      dice(4, 4, 4),
      dice(6, 5, 4),
      dice(1, 1, 6),
      dice(2, 2, 6),
      dice(3, 3, 5),
      dice(6, 6, 2),
      dice(1, 4, 2),
      dice(1, 5, 3),
      dice(2, 5, 3),
    ]
    let state = createGame()
    let index = 0
    for (let step = 0; step < 240 && state.phase !== "gameover"; step += 1) {
      const next = stepGame(state, script[index % script.length])
      if (next === state) throw new Error(`状態が止まりました: ${state.phase}`)
      if (state.phase === "rolling") index += 1
      state = next
      assert.ok(state.playerMoney >= 0)
      assert.ok(state.cpuMoney >= 0)
      assert.equal(state.playerMoney + state.cpuMoney, STARTING_MONEY * 2)
    }
  })
})

describe("rollDice", () => {
  it("与えた乱数で出目を作る", () => {
    const values = [0, 0.99, 0.5]
    let i = 0
    assert.deepEqual(
      rollDice(() => values[i++]),
      dice(1, 6, 4),
    )
  })
})

function stepGame(state: GameState, eyes: Dice): GameState {
  if (state.phase === "betting") return reduce(state, { type: "confirmBet" })
  if (state.phase === "ready") return reduce(state, { type: "startRoll" })
  if (state.phase === "rolling") return reduce(state, { type: "reveal", dice: eyes })
  if (state.phase === "revealed" && playerCanReroll(state)) return reduce(state, { type: "reroll" })
  if (state.phase === "revealed") return reduce(state, { type: "advance" })
  if (state.phase === "result") return reduce(state, { type: "nextRound" })
  return state
}
