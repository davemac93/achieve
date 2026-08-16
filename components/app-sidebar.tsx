"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles } from "lucide-react"

import { MODULE_ICONS } from "@/lib/modules/icons"
import { sidebarModules, type ModuleId } from "@/lib/modules/registry"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

/** Nav entries come from the module registry, filtered by what this vault has
 * enabled (resolved server-side in the layout — the browser never reads disk). */
export function AppSidebar({
  enabledModules,
  ...props
}: React.ComponentProps<typeof Sidebar> & { enabledModules: ModuleId[] }) {
  const pathname = usePathname()
  const navItems = sidebarModules(enabledModules)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Sparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">achieve</span>
                  <span className="truncate text-xs">Personal OS</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const url = item.route
                const isActive =
                  url === "/" ? pathname === "/" : pathname.startsWith(url)
                const Icon = MODULE_ICONS[item.icon]
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link href={url}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: "You", email: "Edit in profile", avatar: "" }} />
      </SidebarFooter>
    </Sidebar>
  )
}
