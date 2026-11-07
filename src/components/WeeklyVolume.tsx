import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { addWeeks, getWeeklyMuscleSets, weekStart } from '../db/progress'

const dayMonth = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

function weekLabel(start: number, current: number): string {
  if (start === current) return 'Esta semana'
  if (start === addWeeks(current, -1)) return 'Semana pasada'
  const end = addWeeks(start, 1) - 1
  return `${dayMonth.format(start)} – ${dayMonth.format(end)}`
}

const formatAvg = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','))

export function WeeklyVolume() {
  const [current] = useState(() => weekStart(Date.now()))
  const [start, setStart] = useState(current)
  const rows = useLiveQuery(() => getWeeklyMuscleSets(db, start), [start])
  const max = Math.max(1, ...(rows ?? []).flatMap((r) => [r.sets, r.previousAvg]))
  const total = rows?.reduce((n, r) => n + r.sets, 0) ?? 0

  return (
    <section className="card">
      <div className="week-nav">
        <button type="button" className="icon-button" aria-label="Semana anterior" onClick={() => setStart(addWeeks(start, -1))}>
          ‹
        </button>
        <h2>{weekLabel(start, current)}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Semana siguiente"
          disabled={start >= current}
          onClick={() => setStart(addWeeks(start, 1))}
        >
          ›
        </button>
      </div>
      <p className="hint">
        Series por grupo muscular · {total} en total. La marca vertical es tu media de las 4 semanas anteriores.
      </p>

      {rows?.length === 0 && <p className="hint">Sin series registradas en este periodo.</p>}
      <ul className="bars">
        {rows?.map((r) => (
          <li key={r.muscleGroup}>
            <span className="bar-label">{r.muscleGroup}</span>
            <span className="bar-track">
              {r.sets > 0 && <span className="bar-fill" style={{ width: `${(r.sets / max) * 100}%` }} />}
              {r.previousAvg > 0 && (
                <span
                  className="bar-avg"
                  style={{ left: `${(r.previousAvg / max) * 100}%` }}
                  title={`Media 4 semanas: ${formatAvg(r.previousAvg)}`}
                />
              )}
            </span>
            <span className="bar-value">
              {r.sets}
              <small> / {formatAvg(r.previousAvg)}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
