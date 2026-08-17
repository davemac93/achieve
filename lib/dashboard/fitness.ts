import "server-only"

import { randomUUID } from "node:crypto"

import { openVault } from "@/lib/vault"
import { parseFrontmatter } from "@/lib/dashboard/markdown"
import {
  DATE,
  INTAKE_FILE,
  MEASUREMENTS_FILE,
  PLAN_FILE,
  WORKOUTS_FILE,
  normalizeIntake,
  normalizeMeasurements,
  normalizeTrainingPlan,
  normalizeWorkouts,
  type Intake,
  type Measurement,
  type TrainingPlan,
  type Workout,
} from "@/lib/dashboard/fitness-content"

export type { Intake, Measurement, TrainingPlan, Workout } from "@/lib/dashboard/fitness-content"

/**
 * Read side of the Fitness module, plus the dashboard's two writes: the workout
 * log and the measurement log.
 *
 * The store splits along its writers. `intake.yaml` (the interview answers) and
 * `plan.md` (the program) belong to the `/fitness` skill and are only read here;
 * `workouts.yaml` and `measurements.yaml` are the dashboard's, because what
 * actually happened is the user's claim to make, not the AI's.
 *
 * The photos folder is deliberately absent from this file and from every other
 * one under `lib/`. Body photos are gitignored and carry a permission deny rule
 * (`template/.claude/settings.json`), exactly like the diary — the dashboard has
 * no reader for them, and `tests/fitness.test.ts` keeps it that way by failing
 * on any file here that so much as names the path.
 */

/** The intake answers, or `null` when the interview hasn't been run (or finished). */
export async function getIntake(): Promise<Intake | null> {
  const vault = openVault()
  if (!(await vault.exists(INTAKE_FILE))) return null
  return normalizeIntake(await vault.readYaml(INTAKE_FILE))
}

/** The training plan, or `null` when `/fitness` hasn't written one yet. */
export async function getTrainingPlan(): Promise<TrainingPlan | null> {
  const vault = openVault()
  if (!(await vault.exists(PLAN_FILE))) return null
  const { frontmatter, body } = parseFrontmatter(await vault.read(PLAN_FILE))
  return normalizeTrainingPlan(frontmatter, body)
}

/** Logged sessions, newest first. */
export async function getWorkouts(): Promise<Workout[]> {
  const vault = openVault()
  if (!(await vault.exists(WORKOUTS_FILE))) return []
  const workouts = normalizeWorkouts(await vault.readYaml(WORKOUTS_FILE))
  return workouts.sort((a, b) => b.date.localeCompare(a.date))
}

/** Logged measurements, newest first. */
export async function getMeasurements(): Promise<Measurement[]> {
  const vault = openVault()
  if (!(await vault.exists(MEASUREMENTS_FILE))) return []
  const measurements = normalizeMeasurements(await vault.readYaml(MEASUREMENTS_FILE))
  return measurements.sort((a, b) => b.date.localeCompare(a.date))
}

/** The user-editable fields of a workout (everything but the id). */
export interface WorkoutInput {
  date: string
  title: string
  session?: string
  durationMin?: number
  rpe?: number
  notes?: string
}

function normalizeWorkoutInput(input: WorkoutInput): Omit<Workout, "id"> {
  const date = input.date?.trim() ?? ""
  if (!DATE.test(date)) throw new Error(`Invalid workout date: ${date} (want YYYY-MM-DD)`)
  const title = input.title?.trim() ?? ""
  if (!title) throw new Error("A workout needs a title — what you actually did.")

  const workout: Omit<Workout, "id"> = { date, title }
  const session = input.session?.trim()
  if (session) workout.session = session
  if (input.durationMin !== undefined) {
    if (!Number.isFinite(input.durationMin) || input.durationMin <= 0) {
      throw new Error("Duration must be a positive number of minutes.")
    }
    workout.durationMin = Math.round(input.durationMin)
  }
  if (input.rpe !== undefined) {
    if (!Number.isFinite(input.rpe) || input.rpe < 1 || input.rpe > 10) {
      throw new Error("RPE must be between 1 and 10.")
    }
    workout.rpe = input.rpe
  }
  const notes = input.notes?.trim()
  if (notes) workout.notes = notes
  return workout
}

async function writeWorkouts(workouts: Workout[], message: string): Promise<void> {
  const vault = openVault()
  await vault.writeYaml(WORKOUTS_FILE, { workouts }, { message })
}

/** Log a session. Returns the created row. */
export async function logWorkout(input: WorkoutInput): Promise<Workout> {
  const workout: Workout = { id: randomUUID(), ...normalizeWorkoutInput(input) }
  const workouts = await getWorkouts()
  await writeWorkouts([...workouts, workout], "dashboard: log workout")
  return workout
}

/** Delete a logged session — a mislog, not a rewrite of history. */
export async function deleteWorkout(id: string): Promise<void> {
  const workouts = await getWorkouts()
  await writeWorkouts(
    workouts.filter((w) => w.id !== id),
    "dashboard: delete workout",
  )
}

/** The user-editable fields of a measurement (everything but the id). */
export interface MeasurementInput {
  date: string
  weightKg?: number
  waistCm?: number
  notes?: string
}

function normalizeMeasurementInput(input: MeasurementInput): Omit<Measurement, "id"> {
  const date = input.date?.trim() ?? ""
  if (!DATE.test(date)) throw new Error(`Invalid measurement date: ${date} (want YYYY-MM-DD)`)

  const measurement: Omit<Measurement, "id"> = { date }
  if (input.weightKg !== undefined) {
    if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
      throw new Error("Weight must be a positive number of kilograms.")
    }
    measurement.weightKg = input.weightKg
  }
  if (input.waistCm !== undefined) {
    if (!Number.isFinite(input.waistCm) || input.waistCm <= 0) {
      throw new Error("Waist must be a positive number of centimetres.")
    }
    measurement.waistCm = input.waistCm
  }
  const notes = input.notes?.trim()
  if (notes) measurement.notes = notes
  if (
    measurement.weightKg === undefined &&
    measurement.waistCm === undefined &&
    measurement.notes === undefined
  ) {
    throw new Error("A measurement needs at least one value.")
  }
  return measurement
}

async function writeMeasurements(
  measurements: Measurement[],
  message: string,
): Promise<void> {
  const vault = openVault()
  await vault.writeYaml(MEASUREMENTS_FILE, { measurements }, { message })
}

/** Log a body measurement. Returns the created row. */
export async function logMeasurement(input: MeasurementInput): Promise<Measurement> {
  const measurement: Measurement = { id: randomUUID(), ...normalizeMeasurementInput(input) }
  const measurements = await getMeasurements()
  await writeMeasurements([...measurements, measurement], "dashboard: log measurement")
  return measurement
}

/** Delete a measurement. */
export async function deleteMeasurement(id: string): Promise<void> {
  const measurements = await getMeasurements()
  await writeMeasurements(
    measurements.filter((m) => m.id !== id),
    "dashboard: delete measurement",
  )
}
