"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Searchable picker over remembered names (opponents, players…) that also lets
 * you add a new one by typing it. Controlled: `value` / `onChange`.
 */
export function NameCombobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  clearLabel,
  disabled,
  size = "default",
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  clearLabel: string;
  disabled?: boolean;
  size?: "default" | "sm";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const exists = options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  function choose(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size={size} disabled={disabled} className={`w-full justify-between font-normal ${className}`} />}
      >
        <span className={`truncate ${value ? "" : "text-muted-foreground"}`}>{value || placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {options.length > 0 ? (
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o} value={o} onSelect={() => choose(o)}>
                    <Check className={`size-4 ${value === o ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
                    {o}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {trimmed && !exists ? (
              <CommandGroup forceMount>
                <CommandItem value={`__add__${trimmed}`} onSelect={() => choose(trimmed)}>
                  <Plus className="size-4" aria-hidden="true" />
                  Add &ldquo;{trimmed}&rdquo;
                </CommandItem>
              </CommandGroup>
            ) : null}
            {value ? (
              <CommandGroup forceMount>
                <CommandItem value="__clear__" onSelect={() => choose("")} className="text-muted-foreground">
                  {clearLabel}
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
