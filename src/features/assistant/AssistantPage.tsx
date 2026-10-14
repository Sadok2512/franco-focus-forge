import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  Bot,
  FileText,
  GitCompare,
  History,
  Lightbulb,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Send,
  Square,
  Trash2,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { DemoBadge, LoadingSkeleton } from "@/components/bc4/States";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  appendMessages,
  cancelledResponse,
  createConversation,
  deleteConversation,
  effectiveFilters,
  getProjects,
  listConversations,
  newId,
  postAssistant,
  renameConversation,
} from "@/lib/api/client";
import type {
  AssistantRequest,
  AssistantResponse,
  Conversation,
  ExecStep,
} from "@/lib/api/assistant-schemas";
import type { FilterContext, Project } from "@/lib/api/schemas";
import { SUGGESTED_QUESTIONS } from "@/mocks/assistant";
import { BlockView, EvidenceTag, fmtNum, ResponseCard } from "./ResponseRenderer";

type Status =
  "idle" | "submitting" | "analyzing" | "rendering" | "completed" | "failed" | "cancelled";
const STATUS_LABEL: Record<Status, string> = {
  idle: "Prêt",
  submitting: "Envoi…",
  analyzing: "Analyse en cours…",
  rendering: "Mise en forme…",
  completed: "Terminé",
  failed: "Échec",
  cancelled: "Annulé",
};

function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function groupOf(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 864e5;
  return diff < 1 ? "Aujourd'hui" : diff < 2 ? "Hier" : diff < 7 ? "Cette semaine" : "Plus ancien";
}

export function AssistantPage({
  filters,
  setFilters,
}: {
  filters: FilterContext;
  setFilters: (p: Partial<FilterContext>) => void;
}) {
  const width = useWidth();
  const qc = useQueryClient();
  const projectId = filters.project;
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: ({ signal }) => getProjects(signal),
  });
  const project = projects.data?.find((p) => p.id === projectId);
  const convs = useQuery({
    queryKey: ["assistant-convs", projectId],
    queryFn: () => listConversations(projectId!),
    enabled: !!projectId,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [steps, setSteps] = useState<{ list: ExecStep[]; current: number }>({
    list: [],
    current: -1,
  });
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [full, setFull] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Project change invalidates incompatible filters.
  useEffect(() => {
    if (!project) return;
    const { dropped, filters: eff } = effectiveFilters(project, filters);
    if (dropped.length)
      setFilters({ op: eff.op, tech: eff.tech, svc: eff.svc, band: eff.band, dep: eff.dep });
    setActiveId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const list = convs.data ?? [];
  const active: Conversation | undefined =
    list.find((c) => c.id === activeId) ?? (activeId === null ? list[0] : undefined);
  const lastResponse = [...(active?.messages ?? [])].reverse().find((m) => m.role === "assistant");
  const evidenceResp = lastResponse?.role === "assistant" ? lastResponse.response : undefined;
  const busy = status === "submitting" || status === "analyzing" || status === "rendering";

  useEffect(() => {
    const el = streamRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, pendingQ, steps.current, atBottom]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["assistant-convs", projectId] });

  async function send(question: string) {
    const q = question.trim();
    if (!q || !projectId || busy) return;
    setInput("");
    setStatus("submitting");
    setPendingQ(q);
    setAtBottom(true);
    let convId = active?.id;
    if (!convId) {
      convId = (await createConversation(projectId)).id;
      setActiveId(convId);
    }
    const req: AssistantRequest = {
      project_id: projectId,
      conversation_id: convId,
      question: q,
      filters: {
        op: filters.op,
        tech: filters.tech,
        svc: filters.svc,
        band: filters.band,
        dep: filters.dep,
      },
    };
    const userMsg = {
      role: "user" as const,
      id: newId("u"),
      at: new Date().toISOString(),
      text: q,
    };
    abort.current = new AbortController();
    setStatus("analyzing");
    let resp: AssistantResponse;
    try {
      resp = await postAssistant(req, {
        signal: abort.current.signal,
        onStep: (s, i) => setSteps((p) => ({ list: i === 0 ? [s] : [...p.list, s], current: i })),
      });
      setStatus("rendering");
    } catch (e) {
      resp =
        e instanceof DOMException && e.name === "AbortError"
          ? cancelledResponse(req)
          : {
              ...cancelledResponse(req),
              status: "failed",
              error: {
                code: "CLIENT",
                message: (e as { message?: string }).message ?? "Erreur inconnue",
              },
            };
    }
    await appendMessages(projectId, convId, [
      userMsg,
      { role: "assistant", id: resp.message_id, at: new Date().toISOString(), response: resp },
    ]);
    await refresh();
    setPendingQ(null);
    setSteps({ list: [], current: -1 });
    setStatus(resp.status);
  }

  const retryOf = (idx: number) => {
    const m = active?.messages[idx - 1];
    if (m?.role === "user") void send(m.text);
  };

  if (!projectId || projects.isLoading || !project)
    return (
      <div className="p-4">
        <LoadingSkeleton className="h-96" />
      </div>
    );

  const history = (
    <ConversationSidebar
      list={list}
      activeId={active?.id ?? null}
      onSelect={(id) => {
        setActiveId(id);
        setHistoryOpen(false);
      }}
      onNew={async () => {
        const c = await createConversation(projectId);
        await refresh();
        setActiveId(c.id);
        setHistoryOpen(false);
      }}
      onRename={async (id, t) => {
        await renameConversation(projectId, id, t);
        await refresh();
      }}
      onDelete={async (id) => {
        await deleteConversation(projectId, id);
        if (id === active?.id) setActiveId(null);
        await refresh();
      }}
      onAsk={(q) => {
        setInput(q);
        setHistoryOpen(false);
      }}
    />
  );
  const evidence = (
    <AnalysisPanel
      project={project}
      filters={filters}
      setFilters={setFilters}
      response={evidenceResp}
    />
  );

  const center = (
    <section className="panel flex h-full min-h-0 flex-col" aria-label="Conversation">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        {width < 768 && (
          <button
            aria-label="Historique"
            onClick={() => setHistoryOpen(true)}
            className="rounded p-1 hover:bg-muted"
          >
            <History className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold">Assistant IA</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Analyses limitées au projet <b className="text-foreground">{project.name}</b> et aux
            filtres actifs. Chaque chiffre est relié à sa source.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <ActionBtn
            icon={<GitCompare className="h-3.5 w-3.5" />}
            onClick={() => setInput("Compare le RRC Success Rate entre Orange et SFR à Paris.")}
          >
            Comparer
          </ActionBtn>
          <ActionBtn
            icon={<FileText className="h-3.5 w-3.5" />}
            disabled={!active?.messages.length}
            onClick={() => active && exportConversation(active)}
          >
            Générer un rapport
          </ActionBtn>
          {width < 1280 && (
            <button
              aria-label="Détails de l'analyse"
              onClick={() => setEvidenceOpen(true)}
              className="rounded p-1.5 hover:bg-muted"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          )}
          {width >= 1280 && (
            <button
              aria-label={
                showRight ? "Masquer le panneau d'analyse" : "Afficher le panneau d'analyse"
              }
              onClick={() => setShowRight((s) => !s)}
              className="rounded p-1.5 hover:bg-muted"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          )}
          <button
            aria-label={full ? "Quitter le plein écran" : "Plein écran"}
            onClick={() => setFull((f) => !f)}
            className="rounded p-1.5 hover:bg-muted"
          >
            {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>
      <div
        ref={streamRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
        className="relative min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {!active?.messages.length && !pendingQ && (
          <div className="mx-auto max-w-xl py-8 text-center">
            <Bot className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 text-sm font-semibold">Posez une question d'ingénierie radio</p>
            <p className="text-xs text-muted-foreground">
              Les réponses distinguent observé, calculé, interprété et indisponible.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {SUGGESTED_QUESTIONS.slice(0, 4).map((q) => (
                <button
                  key={q}
                  onClick={() => void send(q)}
                  className="rounded-full border px-2.5 py-1 text-[11px] hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {active?.messages.map((m, i) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end gap-2">
              <p className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">
                {m.text}
              </p>
              <User className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          ) : (
            <div key={m.id} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 rounded-lg border p-3">
                <ResponseCard
                  r={m.response}
                  onFollowUp={(q) => void send(q)}
                  onRetry={() => retryOf(i)}
                />
              </div>
            </div>
          ),
        )}
        {pendingQ && (
          <>
            <div className="flex justify-end">
              <p className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">
                {pendingQ}
              </p>
            </div>
            <div className="flex gap-3" role="status" aria-label={STATUS_LABEL[status]}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              </span>
              <div className="text-xs">
                <p className="font-medium">{STATUS_LABEL[status]}</p>
                <ol className="mt-1 space-y-0.5 text-muted-foreground">
                  {steps.list.map((s, i) => (
                    <li key={s.id}>
                      {i < steps.current ? "✓" : "…"} {s.label}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        )}
        {!atBottom && (
          <button
            aria-label="Aller au dernier message"
            onClick={() => {
              const el = streamRef.current;
              if (el) el.scrollTop = el.scrollHeight;
              setAtBottom(true);
            }}
            className="sticky bottom-2 left-full flex h-8 w-8 items-center justify-center rounded-full border bg-card shadow"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t p-3"
      >
        <div className="flex items-end gap-2">
          <label htmlFor="assistant-input" className="sr-only">
            Votre question
          </label>
          <textarea
            id="assistant-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Posez votre question… (Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne)"
            className="min-h-[44px] flex-1 resize-y rounded-md border border-input bg-card px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {busy ? (
            <button
              type="button"
              aria-label="Arrêter l'analyse"
              onClick={() => abort.current?.abort()}
              className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Envoyer"
              disabled={!input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Statut : {STATUS_LABEL[status]}</span>
          <span>Données démo — aucune donnée d'abonné n'est transmise.</span>
        </p>
      </form>
    </section>
  );

  return (
    <div className={`${full ? "fixed inset-0 z-40 bg-background" : "h-[calc(100vh-3.5rem)]"} p-3`}>
      {width >= 1280 ? (
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize="19%" minSize="14%">
            {history}
          </ResizablePanel>
          <ResizableHandle withHandle className="mx-1" />
          <ResizablePanel defaultSize={showRight ? "56%" : "81%"} minSize="35%">
            {center}
          </ResizablePanel>
          {showRight && (
            <>
              <ResizableHandle withHandle className="mx-1" />
              <ResizablePanel defaultSize="25%" minSize="18%">
                {evidence}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      ) : (
        <div
          className={`grid h-full gap-3 ${width >= 768 ? "grid-cols-[240px_minmax(0,1fr)]" : "grid-cols-1"}`}
        >
          {width >= 768 && history}
          {center}
        </div>
      )}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetTitle className="sr-only">Historique</SheetTitle>
          {history}
        </SheetContent>
      </Sheet>
      <Sheet open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <SheetContent side="right" className="w-[min(420px,100vw)] overflow-y-auto p-0">
          <SheetTitle className="sr-only">Détails de l'analyse</SheetTitle>
          {evidence}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ActionBtn({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="hidden items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-40 md:inline-flex"
    >
      {icon}
      {children}
    </button>
  );
}

function exportConversation(c: Conversation) {
  const lines = [`# ${c.title}`, `Projet : ${c.project_id} — Données démo`, ""];
  for (const m of c.messages) {
    if (m.role === "user") lines.push(`## Question\n${m.text}\n`);
    else {
      const r = m.response;
      lines.push(
        `## Réponse (${r.status})`,
        `Filtres effectifs : ${JSON.stringify(r.effective_filters)}`,
      );
      r.warnings.forEach((w) => lines.push(`> ⚠ ${w}`));
      for (const b of r.blocks) {
        lines.push(`### ${b.heading}`);
        if (b.type === "text") b.claims.forEach((x) => lines.push(`- [${x.kind}] ${x.text}`));
        if (b.type === "table") {
          lines.push(
            `| ${b.columns.map((x) => x.label).join(" | ")} |`,
            `|${b.columns.map(() => "---").join("|")}|`,
          );
          b.rows.forEach((row) =>
            lines.push(`| ${b.columns.map((x) => fmtNum(row[x.key])).join(" | ")} |`),
          );
        }
      }
      r.evidence.forEach((e) =>
        lines.push(`- Source ${e.source_id} : ${e.label}, n = ${e.sample_count}`),
      );
      lines.push("");
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
  a.download = `rapport_${c.id}.md`;
  a.click();
}

function ConversationSidebar({
  list,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onAsk,
}: {
  list: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, t: string) => void;
  onDelete: (id: string) => void;
  onAsk: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [toDelete, setToDelete] = useState<Conversation | null>(null);
  const groups = useMemo(() => {
    const g = new Map<string, Conversation[]>();
    for (const c of list.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()))) {
      const k = groupOf(c.updated_at);
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return [...g.entries()];
  }, [list, q]);
  return (
    <aside className="panel flex h-full min-h-0 flex-col" aria-label="Historique des conversations">
      <div className="space-y-2 border-b p-3">
        <h2 className="text-sm font-bold">Assistant IA</h2>
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Nouvelle conversation
        </button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Rechercher une conversation"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            className="h-8 w-full rounded-md border border-input bg-card pl-7 pr-2 text-xs"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">Aucune conversation.</p>
        )}
        {groups.map(([g, items]) => (
          <div key={g} className="mb-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g}
            </p>
            <ul>
              {items.map((c) => (
                <li
                  key={c.id}
                  className={`group flex items-center gap-1 rounded px-2 py-1.5 ${c.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                >
                  {editing === c.id ? (
                    <input
                      autoFocus
                      aria-label="Nouveau titre"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => {
                        onRename(c.id, draft);
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onRename(c.id, draft);
                          setEditing(null);
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="h-6 min-w-0 flex-1 rounded border bg-card px-1 text-xs"
                    />
                  ) : (
                    <button
                      onClick={() => onSelect(c.id)}
                      className="min-w-0 flex-1 truncate text-left text-xs"
                      aria-current={c.id === activeId}
                    >
                      {c.title}
                    </button>
                  )}
                  <button
                    aria-label={`Renommer ${c.title}`}
                    onClick={() => {
                      setEditing(c.id);
                      setDraft(c.title);
                    }}
                    className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-card focus:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    aria-label={`Supprimer ${c.title}`}
                    onClick={() => setToDelete(c)}
                    className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-card focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-3 flex items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Lightbulb className="h-3 w-3" /> Exemples
        </p>
        <ul className="mt-1 space-y-1">
          {SUGGESTED_QUESTIONS.map((s) => (
            <li key={s}>
              <button
                onClick={() => onAsk(s)}
                className="w-full rounded-md border px-2 py-1.5 text-left text-[11px] hover:bg-muted"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la conversation ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {toDelete?.title} » sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) onDelete(toDelete.id);
                setToDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

function AnalysisPanel({
  project,
  filters,
  setFilters,
  response,
}: {
  project: Project;
  filters: FilterContext;
  setFilters: (p: Partial<FilterContext>) => void;
  response?: AssistantResponse | undefined;
}) {
  const eff = response?.effective_filters;
  const pts = response?.evidence.find((e) => e.source_type === "measurement_points");
  const visual = response?.blocks.find((b) => b.type === "chart" || b.type === "map");
  const claims = response?.blocks.flatMap((b) => (b.type === "text" ? b.claims : [])) ?? [];
  const insights = claims.filter((c) => c.kind !== "UNAVAILABLE").slice(0, 4);
  const limits = [
    ...claims.filter((c) => c.kind === "UNAVAILABLE").map((c) => c.text),
    ...(response?.warnings ?? []),
  ];
  const all = (v?: string[]) => (v?.length ? v.join(", ") : "Tous");
  return (
    <aside className="panel flex h-full min-h-0 flex-col" aria-label="Détails de l'analyse">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h2 className="text-sm font-bold">Détails de l'analyse</h2>
        <DemoBadge />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Projet</dt>
          <dd className="font-medium">{project.name}</dd>
          <dt className="text-muted-foreground">Période</dt>
          <dd className="font-mono">
            {project.periodStart} → {project.periodEnd}
          </dd>
          <dt className="text-muted-foreground">Opérateurs</dt>
          <dd>{all(eff?.op ?? filters.op)}</dd>
          <dt className="text-muted-foreground">Technologies</dt>
          <dd>{all(eff?.tech ?? filters.tech)}</dd>
          <dt className="text-muted-foreground">Service</dt>
          <dd>{all(eff?.svc ?? filters.svc)}</dd>
          <dt className="text-muted-foreground">Bandes</dt>
          <dd>{all(eff?.band ?? filters.band)}</dd>
          <dt className="text-muted-foreground">Géographie</dt>
          <dd>
            {eff?.dep?.length || filters.dep?.length
              ? `Dép. ${all(eff?.dep ?? filters.dep)}`
              : project.geography}
          </dd>
          <dt className="text-muted-foreground">Échantillons</dt>
          <dd className="num font-mono">{pts ? fmtNum(pts.sample_count) : "N/D"}</dd>
        </dl>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Filtres partagés
          </p>
          <div className="flex flex-wrap gap-1.5">
            <MultiSelect
              label="Opérateur"
              options={project.operators}
              value={filters.op ?? []}
              onChange={(v) => setFilters({ op: v })}
            />
            <MultiSelect
              label="Techno"
              options={project.technologies}
              value={filters.tech ?? []}
              onChange={(v) => setFilters({ tech: v })}
            />
            <MultiSelect
              label="Service"
              options={project.services}
              value={filters.svc ?? []}
              onChange={(v) => setFilters({ svc: v })}
            />
            <MultiSelect
              label="Bande"
              options={project.bands}
              value={filters.band ?? []}
              onChange={(v) => setFilters({ band: v })}
            />
            <MultiSelect
              label="Département"
              options={project.departements}
              value={filters.dep ?? []}
              onChange={(v) => setFilters({ dep: v })}
            />
          </div>
          {response && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Les filtres modifiés s'appliquent à la prochaine question.
            </p>
          )}
        </div>
        {!response ? (
          <p className="rounded-md border p-3 text-xs text-muted-foreground">
            Aucune donnée disponible
          </p>
        ) : (
          <>
            {visual && <BlockView b={visual} />}
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Insights clés
              </p>
              {insights.length ? (
                <ul className="space-y-1">
                  {insights.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      <EvidenceTag kind={c.kind} />
                      <span>{c.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune donnée disponible</p>
              )}
            </section>
            {limits.length > 0 && (
              <section>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Limites
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                  {limits.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
