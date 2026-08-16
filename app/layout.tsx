import type { Metadata } from "next"

import "./globals.css"
import { getEnabledModuleIds } from "@/lib/dashboard/config"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { SiteHeader } from "@/components/site-header"

export const metadata: Metadata = {
  title: "achieve",
  description: "A local-first, open-source personal operating system.",
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read once, server-side, and hand the chrome the ids it should render.
  const enabledModules = await getEnabledModuleIds()

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <SidebarProvider>
          <AppSidebar enabledModules={enabledModules} />
          <SidebarInset>
            <SiteHeader enabledModules={enabledModules} />
            <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  )
}
