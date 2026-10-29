"use client"

import { useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { Search } from "lucide-react"
import type { NavItem } from "@/lib/crm/nav"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

/** ⌘K / Ctrl+K palette. Today it jumps between modules; entities and actions plug in with their epics. */
export function CommandPalette({ items, open, onOpenChange }: { items: NavItem[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()

  const go = useCallback(
    (href: string) => {
      onOpenChange(false)
      router.push(href)
    },
    [onOpenChange, router]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 max-md:top-auto max-md:h-auto [&>button]:hidden">
        <DialogTitle className="sr-only">Palette de commandes</DialogTitle>
        <Command label="Palette de commandes" className="flex flex-col">
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Command.Input
              autoFocus
              placeholder="Aller à… ou rechercher"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Échap</kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun résultat.</Command.Empty>
            <Command.Group heading="Navigation" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-semibold">
              {items.map((item) => (
                <Command.Item
                  key={item.id}
                  value={`${item.label} ${(item.keywords ?? []).join(" ")}`}
                  disabled={item.soon}
                  onSelect={() => go(item.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground aria-selected:bg-accent data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  {item.soon && <span className="text-xs text-muted-foreground">Bientôt</span>}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

/** Opens the palette with ⌘K / Ctrl+K from anywhere in the shell. */
export function useCommandShortcut(setOpen: (fn: (open: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setOpen])
}

