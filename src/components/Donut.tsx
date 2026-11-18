export interface Slice {
  label: string
  value: number
  color: string
}

export default function Donut({
  slices,
  size = 176,
  thickness = 20,
  children,
}: {
  slices: Slice[]
  size?: number
  thickness?: number
  children?: React.ReactNode
}) {
  const total = slices.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const gap = slices.length > 1 ? 2.2 : 0

  let offset = 0
  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          slices.map((s, i) => {
            const frac = s.value / total
            const len = Math.max(0, frac * c - gap)
            const dash = `${len} ${c - len}`
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap={slices.length > 1 ? 'round' : 'butt'}
                style={{ transition: 'stroke-dasharray .5s, stroke-dashoffset .5s' }}
              />
            )
            offset += frac * c
            return el
          })}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  )
}
