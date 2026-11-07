import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { nearestIndex, niceTicks } from '../lib/chart'

export interface ChartPoint {
  x: number
  y: number
}

interface LineChartProps {
  points: ChartPoint[]
  label: string
  formatY: (v: number) => string
  formatX: (v: number) => string
  height?: number
  /** x values of events to mark with a short tick above the plot (e.g. when each set was logged). */
  markers?: number[]
}

const PAD = { top: 16, right: 52, bottom: 26, left: 40 }
const MAX_MARKERS = 24

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(320)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/** Single-series time line chart with a touch crosshair. */
export function LineChart({ points, label, formatY, formatX, height = 200, markers = [] }: LineChartProps) {
  const [containerRef, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const ys = points.map((p) => p.y)
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys))
  const yMin = ticks[0]
  const yMax = ticks.at(-1)!
  const xMin = points[0].x
  const xMax = points.at(-1)!.x
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const sx = (x: number) => PAD.left + (xMax === xMin ? plotW / 2 : ((x - xMin) / (xMax - xMin)) * plotW)
  const sy = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin)) * plotH
  const px = points.map((p) => sx(p.x))
  const py = points.map((p) => sy(p.y))

  const line = px.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${py[i].toFixed(1)}`).join('')
  const baseline = PAD.top + plotH
  const area = `${line}L${px.at(-1)!.toFixed(1)},${baseline}L${px[0].toFixed(1)},${baseline}Z`
  const showAllMarkers = points.length <= MAX_MARKERS
  const last = points.length - 1

  function onPointer(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect()
    setActive(nearestIndex(px, event.clientX - rect.left))
  }

  const tooltipLeft = active === null ? 0 : Math.min(Math.max(px[active] - 60, 0), width - 120)

  return (
    <div className="chart" ref={containerRef}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={PAD.left} x2={PAD.left + plotW} y1={sy(t)} y2={sy(t)} />
            <text className="chart-tick" x={PAD.left - 6} y={sy(t)} dy="0.32em" textAnchor="end">
              {formatY(t)}
            </text>
          </g>
        ))}
        <text className="chart-tick" x={px[0]} y={height - 6} textAnchor={points.length > 1 ? 'start' : 'middle'}>
          {formatX(xMin)}
        </text>
        {points.length > 1 && (
          <text className="chart-tick" x={px[last]} y={height - 6} textAnchor="end">
            {formatX(xMax)}
          </text>
        )}

        {markers
          .filter((m) => m >= xMin && m <= xMax)
          .map((m) => (
            <line key={m} className="chart-marker" x1={sx(m)} x2={sx(m)} y1={PAD.top - 8} y2={baseline} />
          ))}
        <path className="chart-area" d={area} />
        <path className="chart-line" d={line} />
        {points.map((_, i) =>
          showAllMarkers || i === last || i === active ? (
            <circle key={i} className="chart-dot" cx={px[i]} cy={py[i]} r={i === active ? 6 : 4} />
          ) : null,
        )}
        <text className="chart-end-label" x={px[last] + 10} y={py[last]} dy="0.32em">
          {formatY(points[last].y)}
        </text>

        {active !== null && (
          <line className="chart-crosshair" x1={px[active]} x2={px[active]} y1={PAD.top} y2={baseline} />
        )}
        <rect
          x={PAD.left - 12}
          y={0}
          width={plotW + 24}
          height={height}
          fill="transparent"
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
          style={{ touchAction: 'pan-y' }}
        />
      </svg>
      {active !== null && (
        <div className="chart-tooltip" style={{ left: tooltipLeft }}>
          <span>{formatX(points[active].x)}</span>
          <strong>{formatY(points[active].y)}</strong>
        </div>
      )}
    </div>
  )
}
