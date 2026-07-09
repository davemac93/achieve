"use client"

import { usePathname } from "next/navigation"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/notes": "Notes",
  "/diary": "Diary",
  "/goals": "Goals",
  "/projects": "Projects",
  "/investments": "Investments",
  "/profile": "Profile",
}

export function SiteHeader() {
  const pathname = usePathname()
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
