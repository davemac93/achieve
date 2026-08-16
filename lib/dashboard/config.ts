import "server-only"

import { openVault } from "@/lib/vault"
import {
  CONFIG_FILE,
  resolveEnabledModules,
  type ModuleId,
} from "@/lib/modules/registry"

interface ConfigFile {
  /** Enabled module ids, as written by `npm run setup` (or by hand). */
  modules?: unknown
}

/**
 * Which modules this vault runs, resolved against the registry. A missing
 * `config.yaml` — every vault scaffolded before v2 — means all of them, so the
 * dashboard behaves exactly as it did before modules were configurable. An
 * explicit empty list means none: silence is not the same as an empty choice.
 */
export async function getEnabledModuleIds(): Promise<ModuleId[]> {
  const vault = openVault()
  if (!(await vault.exists(CONFIG_FILE))) return resolveEnabledModules(null)

  const data = await vault.readYaml<ConfigFile | null>(CONFIG_FILE)
  const listed = Array.isArray(data?.modules)
    ? data.modules.filter((id): id is string => typeof id === "string")
    : null
  return resolveEnabledModules(listed)
}
