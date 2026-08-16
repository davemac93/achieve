"use client"

import { usePathname } from "next/navigation"

import { routeTitles, type ModuleId } from "@/lib/modules/registry"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

/** Titles are the enabled modules' labels — nested routes (`/notes/<slug>`)
 * fall back to their first segment, so a note page still reads "Notes". */
export function SiteHeader({ enabledModules }: { enabledModules: ModuleId[] }) {
  const pathname = usePathname()
  const titles = routeTitles(enabledModules)
  const segment = "/" + (pathname.split("/")[1] ?? "")
  const title = titles[pathname] ?? titles[segment] ?? "achieve"

  return (
    <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <h1 className="text-base font-medium">{title}</h1>
    </header>
  )
}
