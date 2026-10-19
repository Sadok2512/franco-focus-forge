import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OperatorChip } from "@/features/projects/shared";

/** Local dictionary control: native checkboxes provide Tab/Space navigation. */
export function FilterSelect({
  label,
  options: sourceOptions,
  value,
  onChange,
  operatorBadges = false,
  showLabel = false,
}: {
  operatorBadges?: boolean;
  showLabel?: boolean;
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const isIdentifiedOperator = (label: string) =>
    !["", "n/d", "nd", "n/a", "non attribué", "non attribue", "unknown", "inconnu", "—"].includes(
      label.trim().toLocaleLowerCase(),
    );
  const options = operatorBadges ? sourceOptions.filter(isIdentifiedOperator) : sourceOptions;
  const selectedValues = operatorBadges ? value.filter(isIdentifiedOperator) : value;
  // An empty API operator filter means all operators, not an empty population.
  const selected = operatorBadges && !selectedValues.length ? [...options] : selectedValues;
  const commit = (next: string[]) =>
    onChange(operatorBadges && options.every((option) => next.includes(option)) ? [] : next);
  const [search, setSearch] = useState("");
  const shown = options.filter((option) =>
    option.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`rrc-control ${showLabel ? "rrc-geographic-select" : ""}`}
          aria-label={`${label} — ${selected.length ? (operatorBadges ? selected.join(", ") : `${selected.length} sélectionné(s)`) : "Tous"}`}
        >
          {showLabel && <span className="font-medium">{label}</span>}
          {showLabel && !operatorBadges && (
            <span className="rrc-selection-count">{selected.length || "Tous"}</span>
          )}
          <span
            className={
              showLabel && !operatorBadges ? "sr-only" : "flex min-w-0 flex-wrap items-center gap-1"
            }
          >
            {operatorBadges && selected.length > 0
              ? selected.map((operator) => <OperatorChip key={operator} label={operator} />)
              : selected.length > 1 && selected.length === options.length
                ? `Tous (${selected.length})`
                : selected.length === 1
                  ? selected[0]
                  : selected.length
                    ? `${selected.length} sélectionnés`
                    : "Tous"}
          </span>
          <ChevronDown size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="rrc-premium-popover w-64 p-3">
        <input
          aria-label={`Rechercher ${label}`}
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        />
        <div className="my-2 flex justify-between gap-2 text-xs">
          <button onClick={() => commit([...options])} className="rounded px-1 py-2 text-primary">
            Tout sélectionner
          </button>
          <button onClick={() => onChange([])} className="rounded px-1 py-2 text-primary">
            {operatorBadges ? "Réinitialiser" : "Effacer"}
          </button>
        </div>
        <div className="max-h-60 overflow-auto" role="group" aria-label={label}>
          {shown.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                disabled={operatorBadges && selected.length === 1 && selected.includes(option)}
                onChange={() =>
                  commit(
                    selected.includes(option)
                      ? selected.filter((v) => v !== option)
                      : [...selected, option],
                  )
                }
              />
              {operatorBadges ? <OperatorChip label={option} /> : option}
            </label>
          ))}
          {!shown.length && <p className="p-2 text-sm text-muted-foreground">Aucune option</p>}
        </div>
        <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
          {selected.length} sélectionné(s) · {options.length} options
        </p>
      </PopoverContent>
    </Popover>
  );
}
