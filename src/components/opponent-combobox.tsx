"use client";

import { useState } from "react";
import { NameCombobox } from "@/components/name-combobox";

/** Opponent picker for the match form; submits the chosen name through a hidden input. */
export function OpponentCombobox({ name, opponents, defaultValue = "", disabled }: { name: string; opponents: string[]; defaultValue?: string; disabled?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <NameCombobox
        value={value}
        onChange={setValue}
        options={opponents}
        placeholder="Choose or add an opponent"
        searchPlaceholder="Search opponents…"
        emptyLabel="No opponents saved yet. Type a name to add one."
        clearLabel="No opponent"
        disabled={disabled}
        className="h-9"
      />
    </>
  );
}
