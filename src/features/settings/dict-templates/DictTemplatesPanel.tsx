import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDictTemplates, updateDictTemplate } from "@/lib/api/client";
import type { TemplateCategory } from "@/lib/api/dict-templates";
import { getSession } from "@/lib/auth";
import { useActiveProject } from "@/lib/activeProject";

function Editor({ category }: { category: TemplateCategory }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(() =>
    JSON.stringify(
      {
        revision: category.revision,
        entries: category.entries.map(({ n_in_project: _n, resolved: _r, ...entry }) => entry),
      },
      null,
      2,
    ),
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await updateDictTemplate(category.id, JSON.parse(draft));
      await client.invalidateQueries({ queryKey: ["dict-v2", "templates"] });
      await client.invalidateQueries({ queryKey: ["dict-v2", "template-summary"] });
      await client.invalidateQueries({ queryKey: ["dict-v2", "tree"] });
      setMessage("Template enregistré.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">
        {category.label} · révision {category.revision}
      </h2>
      <p className="text-sm text-muted-foreground">
        Configuration commune à tous les projets. Utilisez les clés ASN.1 complètes et les
        discriminants validés. Les mesures ne sont pas modifiées.
      </p>
      <label className="block text-sm">
        Configuration du template
        <textarea
          aria-label="Configuration du template"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-2 h-96 w-full rounded border bg-background p-3 font-mono text-xs"
        />
      </label>
      <button
        disabled={saving}
        onClick={save}
        className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : "Enregistrer le template"}
      </button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
export function DictTemplatesPanel() {
  const { activeProject } = useActiveProject();
  const [id, setId] = useState("");
  const query = useQuery({
    queryKey: ["dict-v2", "templates", activeProject?.id],
    queryFn: ({ signal }) => getDictTemplates(activeProject!.id, signal),
    enabled: !!activeProject,
  });
  const category = query.data?.categories.find((c) => c.id === id);
  if (getSession()?.role !== "admin")
    return <p role="alert">Administration des templates réservée aux administrateurs.</p>;
  if (!activeProject) return <p>Ouvrez un projet pour consulter la configuration des templates.</p>;
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <h1 className="text-lg font-semibold">Templates RRC</h1>
      {query.isPending ? (
        <p>Chargement…</p>
      ) : query.isError ? (
        <p role="alert">Impossible de charger les templates.</p>
      ) : (
        <select
          aria-label="Catégorie à administrer"
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="rounded border bg-background p-2"
        >
          <option value="">Choisir une catégorie</option>
          {query.data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {category && <Editor key={`${category.id}:${category.revision}`} category={category} />}
    </section>
  );
}
