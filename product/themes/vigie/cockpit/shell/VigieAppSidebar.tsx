import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@platform/react/primitives/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@platform/react/primitives/components/ui/sidebar"
import { Check, ChevronsUpDown, Radar } from "lucide-react"
import type { VigieSection } from "../VigieCockpit.context"
import { useVigieCockpit } from "../VigieCockpit.context"
import { VIGIE_NAV } from "./vigie-nav"

// Adapted from shadcn-admin's AppSidebar/TeamSwitcher pattern: a device
// switcher in the header (fleet dimension), an observability-tool nav group,
// and a status footer.

export function VigieAppSidebar() {
  const { device, fleet, selectDevice, subsystems, section, setSection } =
    useVigieCockpit()
  const degraded = subsystems.filter(s => s.status !== "nominal").length

  return (
    <Sidebar collapsible="icon" className="vigie-portal">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Radar className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {device.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {device.role}
                    </span>
                  </div>
                  <ChevronsUpDown className="ms-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="vigie-portal w-(--radix-dropdown-menu-trigger-width) min-w-56"
                align="start"
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Fleet
                </DropdownMenuLabel>
                {fleet.map(member => (
                  <DropdownMenuItem
                    key={member.id}
                    disabled={!member.online}
                    className="gap-2"
                    onSelect={() => selectDevice(member.id)}
                  >
                    <span
                      className="size-2 rounded-full"
                      data-online={member.online}
                      style={{
                        background: member.online
                          ? "var(--vigie-nominal)"
                          : "var(--vigie-idle)",
                      }}
                    />
                    <span className="flex-1">{member.name}</span>
                    {member.id === device.id ? (
                      <Check className="size-4" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Observability</SidebarGroupLabel>
          <SidebarMenu>
            {VIGIE_NAV.map(item => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={item.id === section}
                  tooltip={{ children: item.label, className: "vigie-portal" }}
                  onClick={() => setSection(item.id as VigieSection)}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={{
                children: "Subsystem health",
                className: "vigie-portal",
              }}
              className="gap-2"
            >
              <span
                className="size-2 rounded-full"
                style={{
                  background:
                    degraded > 0
                      ? "var(--vigie-caution)"
                      : "var(--vigie-nominal)",
                }}
              />
              <span className="truncate text-xs">
                {degraded > 0
                  ? `${degraded} subsystem${degraded > 1 ? "s" : ""} degraded`
                  : "All subsystems nominal"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
