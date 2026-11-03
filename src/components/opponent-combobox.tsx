"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Searchable opponent picker. Lists opponents already saved and lets you add a
 * new one by typing it. The chosen value is submitted through a hidden input.
 */
export function OpponentCombobox({
  name,
  opponents,
  defaultValue = "",
  disabled,
}: {
  name: string;
  opponents: string[];
  defaultValue?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const exists = opponents.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  function choose(next: string) {
    setValue(next);
    setQuery("");
    setOpen(false);
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button variant="outline" disabled={disabled} className="h-9 w-full justify-between font-normal" />}
        >
          <span className={value ? "" : "text-muted-foreground"}>{value || "Choose or add an opponent"}</span>
          <ChevronsUpDown className="size-4 opacity-50" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search opponents…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>{trimmed ? "No opponent with that name yet." : "No opponents saved yet. Type a name to add one."}</CommandEmpty>
              {opponents.length > 0 ? (
                <CommandGroup heading="Opponents">
                  {opponents.map((o) => (
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
                    No opponent
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
