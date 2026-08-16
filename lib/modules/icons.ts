import {
  BookText,
  Compass,
  FolderKanban,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  NotebookPen,
  Quote,
  Target,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import type { ModuleIconName } from "@/lib/modules/registry"

/**
 * Binds the icon names modules declare to lucide components. Kept out of
 * [registry.ts](./registry.ts) so the registry stays plain data importable from
 * plain node (`scripts/setup.mjs`) without pulling in React. The
 * `Record<ModuleIconName, …>` type keeps the two in step both ways: a name with
 * no icon fails to compile, and so does an icon no module can name.
 */
export const MODULE_ICONS: Record<ModuleIconName, LucideIcon> = {
  LayoutDashboard,
  NotebookPen,
  BookText,
  Target,
  FolderKanban,
  TrendingUp,
  Compass,
  UserRound,
  ListTodo,
  Quote,
  Lightbulb,
}
