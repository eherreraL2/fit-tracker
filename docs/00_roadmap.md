# Fit Tracker — Viabilidad y hoja de ruta

## Objetivo

App personal para iPhone para registrar entrenamientos de fuerza: series, repeticiones y peso por ejercicio, y la progresión de cargas. Sin suscripciones ni APIs de pago. Input opcional de una smartband Amazfit.

## 1. Viabilidad

| Vía | Coste | Dev desde Windows | HealthKit | Problema |
|---|---|---|---|---|
| **A. PWA** (web app instalada en pantalla de inicio) | 0 € | ✅ | ❌ directo (puente vía Atajos) | Sin acceso nativo a sensores |
| B. Nativa Swift + Apple ID gratuito | 0 € | ❌ requiere Mac/Xcode | ✅ | Firma caduca cada 7 días |
| C. Nativa + Apple Developer Program | 99 $/año | ❌ | ✅ | Suscripción → descartada |
| D. Expo / React Native con Expo Go | 0 € | ✅ | ❌ en Expo Go | Dependiente del servidor de desarrollo |

**Decisión: vía A (PWA).**

- Se instala desde Safari → Compartir → "Añadir a pantalla de inicio"; abre a pantalla completa y funciona offline.
- Datos locales en IndexedDB; sin backend.
- Hosting gratuito con HTTPS (GitHub Pages / Cloudflare Pages).

**Riesgo:** iOS puede purgar almacenamiento web. Mitigación: `navigator.storage.persist()` + export/import JSON a Archivos / iCloud Drive con recordatorio periódico.

## 2. Integración Amazfit

Flujo: **Amazfit → app Zepp → Apple Salud**.

Puentes gratuitos hacia la PWA:

1. **Atajos de iOS** (recomendado): lee FC/calorías de Salud en la ventana de la sesión y las pasa a la PWA (URL o portapapeles).
2. **Exportación completa de Salud** (XML) para carga histórica.

Métricas útiles: FC media/máx por sesión, calorías, recuperación de FC entre series, sueño y FC en reposo previos (readiness).

Descartado por coste/beneficio: mini-app Zepp OS en la pulsera.

## 3. Funcionalidades

**Núcleo (MVP)**
- Catálogo de ejercicios (grupo muscular, equipo).
- Sesión: añadir ejercicios, registrar series peso × reps.
- Mostrar "la última vez" del ejercicio al registrar.
- Historial de sesiones.
- Gráfica de progreso por ejercicio: peso máx, 1RM estimado (Epley), volumen.

**Extras baratos**
- Temporizador de descanso con vibración.
- Plantillas de rutina.
- RPE / RIR por serie.
- Detección automática de PRs.
- Volumen semanal por grupo muscular.
- Sugerencia de doble progresión.
- Calculadora de discos.
- Notas por sesión/ejercicio.
- Export CSV/JSON.

**Posteriores**
- Datos de la pulsera vía Atajos.
- Peso corporal.
- Detección de estancamiento / sugerencia de deload.
- Calendario de constancia.

## 4. Stack

- Vite + React o Svelte + TypeScript
- Dexie.js (IndexedDB, versionado y migraciones)
- Chart.js o uPlot
- vite-plugin-pwa (offline + manifest)
- GitHub Pages / Cloudflare Pages
- Vitest para la lógica (1RM, PRs, progresión)

**Modelo de datos mínimo:** `exercises`, `routines` → `routine_exercises`, `sessions` → `session_exercises` → `sets` (peso, reps, RPE, calentamiento, timestamp), `health_samples`.

## 5. Hoja de ruta

| Fase | Contenido | Esfuerzo |
|---|---|---|
| 0. Prueba de concepto ✅ | Vite "hola mundo" publicado, instalado en el iPhone, offline y persistencia verificados (2026-11-02, https://eherreral2.github.io/fit-tracker/) | 1 tarde |
| 1. MVP ✅ | Ejercicios, sesión, registro de series, "la última vez", historial (2026-11-02; kg, catálogo precargado, sesión libre, sin calentamientos) | 1–2 semanas |
| 2. Progreso | Gráficas, 1RM estimado, PRs, volumen semanal | ~1 semana |
| 3. Comodidad | Temporizador, plantillas, RPE, calculadora de discos | ~1 semana |
| 4. Seguridad de datos (adelantada, parcial ✅) | Export/import JSON, almacenamiento persistente, recordatorio de backup (2026-11-02). Pendiente: export CSV | 2–3 días |
| 5. Pulsera | Atajo Salud → PWA, FC/calorías vinculadas a la sesión | ~1 semana |
| 6. Inteligencia ligera | Sugerencia de progresión, estancamiento, readiness | Opcional |
| 7. Nativa | Envoltorio o reescritura SwiftUI con HealthKit (si hay Mac) | Opcional |

## Pendiente de definir

- Estética y flujo de pantallas.
- Elección final React vs Svelte.
