import type { SessionHealth } from '../db/health'
import { formatTime } from '../lib/format'
import { LineChart } from './LineChart'

interface HeartRateCardProps {
  health: SessionHealth
  /** When each set was logged, drawn as ticks on the chart. */
  setTimes: number[]
}

export function HeartRateCard({ health, setTimes }: HeartRateCardProps) {
  const { avgBpm, maxBpm, kcal, heartRate, dense } = health
  if (avgBpm === null && kcal === null) {
    return (
      <section className="card">
        <h2>Pulso y calorías</h2>
        <p className="hint">Sin datos de la pulsera para esta sesión. Impórtalos desde Ajustes → Amazfit / Salud.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Pulso y calorías</h2>
      <dl className="stat-row">
        {avgBpm !== null && (
          <div>
            <dt>Pulso medio</dt>
            <dd>
              {avgBpm} <small>lpm</small>
            </dd>
          </div>
        )}
        {maxBpm !== null && (
          <div>
            <dt>Pulso máx.</dt>
            <dd>
              {maxBpm} <small>lpm</small>
            </dd>
          </div>
        )}
        {kcal !== null && (
          <div>
            <dt>Calorías activas</dt>
            <dd>
              {kcal} <small>kcal</small>
            </dd>
          </div>
        )}
      </dl>
      {dense ? (
        <>
          <p className="hint">Frecuencia cardíaca (lpm). Las marcas verticales son el momento en que registraste cada serie.</p>
          <LineChart
            points={heartRate.map((h) => ({ x: h.at, y: h.bpm }))}
            label="Frecuencia cardíaca durante la sesión"
            formatY={(v) => String(Math.round(v))}
            formatX={formatTime}
            markers={setTimes}
            height={180}
          />
        </>
      ) : (
        heartRate.length > 0 && (
          <p className="hint">
            {heartRate.length} lecturas de pulso: muy espaciadas para dibujar la evolución durante la sesión.
          </p>
        )
      )}
    </section>
  )
}
