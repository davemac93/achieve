import "server-only"

import { randomUUID } from "node:crypto"

import { openVault } from "@/lib/vault"
import type { Task } from "@/lib/dashboard/types"

const REL = "tasks.yaml"

interface TasksFile {
  tasks: Task[]
}

/** Read all tasks. Returns an empty list if the file is missing or empty. */
export async function getTasks(): Promise<Task[]> {
  const vault = openVault()
  if (!(await vault.exists(REL))) return []
  const data = await vault.readYaml<TasksFile | null>(REL)
  return data?.tasks ?? []
}

async function writeTasks(tasks: Task[], message: string): Promise<void> {
  const vault = openVault()
  await vault.writeYaml(REL, { tasks }, { message })
}

/** Add a task. Returns the created task. */
export async function addTask(title: string, goal?: string): Promise<Task> {
  const trimmed = title.trim()
  if (!trimmed) throw new Error("Task title must not be empty.")

  const task: Task = {
    id: randomUUID(),
    title: trimmed,
    done: false,
    created: new Date().toISOString(),
    ...(goal ? { goal } : {}),
  }

  const tasks = await getTasks()
  await writeTasks([...tasks, task], "dashboard: add task")
  return task
}

/** Toggle a task's done state. */
export async function toggleTask(id: string): Promise<void> {
  const tasks = await getTasks()
  const next = tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
  await writeTasks(next, "dashboard: toggle task")
}

/** Delete a task. */
export async function deleteTask(id: string): Promise<void> {
  const tasks = await getTasks()
  await writeTasks(
    tasks.filter((t) => t.id !== id),
    "dashboard: delete task"
  )
}
