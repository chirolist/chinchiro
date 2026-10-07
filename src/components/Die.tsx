import type { DieFace } from "@/lib/chinchiro"

const PIPS: Record<DieFace, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function Die({
  value,
  rolling = false,
  size = "md",
  delay = 0,
}: {
  value: DieFace
  rolling?: boolean
  size?: "sm" | "md"
  delay?: number
}) {
  const red = value === 1 || value === 4
  const spots = PIPS[value]
  return (
    <div
      className={`die die-${size} ${rolling ? "die-rolling" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      role="img"
      aria-label={`${value}`}
    >
      <span className="die-grid">
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            className={spots.includes(index) ? (red ? "pip pip-red" : "pip") : "pip pip-off"}
          />
        ))}
      </span>
    </div>
  )
}
