import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function MultiSelect<T extends string>({
  label, options, value, onChange,
}: { label: string; options: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const shown = options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
  const toggle = (o: T) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors duration-150 hover:bg-muted ${value.length ? "border-primary/50 bg-accent text-accent-foreground" : "bg-card"}`}
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value.length ? (value.length === 1 ? value[0] : `${value.length} sél.`) : "Tous"}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 w-52 rounded-md border bg-popover p-1 shadow-lg">
          {options.length > 5 && (
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…"
              className="mb-1 h-7 w-full rounded border bg-background px-2 text-xs" />
          )}
          <ul role="listbox" aria-multiselectable className="max-h-60 overflow-auto">
            {shown.map((o) => (
              <li key={o}>
                <button type="button" role="option" aria-selected={value.includes(o)} onClick={() => toggle(o)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted">
                  <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${value.includes(o) ? "border-primary bg-primary text-primary-foreground" : ""}`}>
                    {value.includes(o) && <Check className="h-2.5 w-2.5" />}
                  </span>
                  {o}
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-1.5 text-xs text-muted-foreground">Aucune option</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
