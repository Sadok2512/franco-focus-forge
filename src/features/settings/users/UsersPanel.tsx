import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Power, Search } from "lucide-react";
import { useState } from "react";
import { createUser, getUsers, passwordProblems, patchUser, resetPassword } from "@/lib/api/client";
import { ROLE_LABEL, RoleSchema, type PasswordPolicy, type Role, type User } from "@/lib/api/settings-schemas";
import { can } from "@/lib/permissions";
import { ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { btn, btnPrimary, errField, errMsg, Field, fmtDate, Forbidden, inputCls, Modal, Pill, SettingsSection, useActor } from "../shared";

export function UsersPanel() {
  const actor = useActor();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings", "users", actor.role], queryFn: () => getUsers(actor), retry: false, enabled: can(actor.role, "users.read") });
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const [confirm, setConfirm] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = useMutation({
    mutationFn: (u: User) => patchUser(actor, u.id, { active: !u.active }),
    onSuccess: (u) => { setNotice(`${u.login} ${u.active ? "réactivé" : "désactivé"}.`); qc.invalidateQueries({ queryKey: ["settings", "users"] }); },
    onError: (e) => setNotice(errMsg(e)),
    onSettled: () => setConfirm(null),
  });
  const reset = useMutation({ mutationFn: (u: User) => resetPassword(actor, u.id), onSuccess: (_r, u) => setNotice(`Réinitialisation simulée pour ${u.login} : aucun mot de passe n'est affiché ni stocké.`), onError: (e) => setNotice(errMsg(e)) });

  if (!can(actor.role, "users.read")) return <SettingsSection title="Utilisateurs" description="Gestion des comptes et des rôles."><Forbidden /></SettingsSection>;
  const write = can(actor.role, "users.write");
  const rows = (q.data?.users ?? []).filter((u) => `${u.login} ${u.display_name}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <SettingsSection title="Utilisateurs" description="Comptes, rôles et statut. Démo : la sécurité effective exigera un contrôle côté serveur."
      actions={<>
        <div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" aria-hidden />
          <input aria-label="Rechercher un utilisateur" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className={`${inputCls} w-52 pl-8`} /></div>
        {write && <button className={btnPrimary} onClick={() => setEdit("new")}><Plus className="h-3.5 w-3.5" />Ajouter</button>}
      </>}>
      {notice && <p role="status" className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">{notice}</p>}
      <div className="overflow-x-auto rounded-lg border bg-card">
        {q.isLoading ? <LoadingSkeleton className="h-40" /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-muted-foreground"><tr>
              {["Identifiant", "Nom affiché", "Rôle", "Statut", "Créé le", "Dernière connexion", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2 font-mono">{u.login}{u.login === actor.login && <span className="ml-1 text-muted-foreground">(vous)</span>}</td>
                  <td className="px-3 py-2">{u.display_name}</td>
                  <td className="px-3 py-2"><Pill tone={u.role === "admin" ? "primary" : "muted"}>{ROLE_LABEL[u.role]}</Pill></td>
                  <td className="px-3 py-2"><Pill tone={u.active ? "good" : "bad"}>{u.active ? "● Actif" : "○ Inactif"}</Pill></td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(u.created_at)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{u.last_login_at ? fmtDate(u.last_login_at) : "Jamais / N/D"}</td>
                  <td className="px-3 py-2">
                    {write && <div className="flex justify-end gap-1">
                      <button className={btn} aria-label={`Modifier ${u.login}`} onClick={() => setEdit(u)}><Pencil className="h-3.5 w-3.5" /></button>
                      <button className={btn} aria-label={`Réinitialiser le mot de passe de ${u.login}`} onClick={() => reset.mutate(u)}><KeyRound className="h-3.5 w-3.5" /></button>
                      <button className={btn} onClick={() => (u.active ? setConfirm(u) : toggle.mutate(u))}><Power className="h-3.5 w-3.5" />{u.active ? "Désactiver" : "Réactiver"}</button>
                    </div>}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Aucun utilisateur ne correspond.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {confirm && (
        <Modal title={`Désactiver ${confirm.login} ?`} onClose={() => setConfirm(null)}>
          <p className="mb-4 text-xs text-muted-foreground">L'utilisateur ne pourra plus se connecter. Vous pourrez le réactiver.</p>
          <div className="flex justify-end gap-2"><button className={btn} onClick={() => setConfirm(null)}>Annuler</button>
            <button className={btnPrimary} autoFocus disabled={toggle.isPending} onClick={() => toggle.mutate(confirm)}>Confirmer</button></div>
        </Modal>
      )}
      {edit && q.data && <UserForm user={edit === "new" ? null : edit} policy={q.data.policy} onClose={() => setEdit(null)}
        onDone={(m) => { setEdit(null); setNotice(m); qc.invalidateQueries({ queryKey: ["settings", "users"] }); }} />}
    </SettingsSection>
  );
}

function UserForm({ user, policy, onClose, onDone }: { user: User | null; policy: PasswordPolicy; onClose: () => void; onDone: (m: string) => void }) {
  const actor = useActor();
  const [f, setF] = useState({ login: user?.login ?? "", display_name: user?.display_name ?? "", role: (user?.role ?? "viewer") as Role, password: "", password_confirm: "" });
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null);
  const m = useMutation({
    mutationFn: () => user ? patchUser(actor, user.id, { display_name: f.display_name, role: f.role }) : createUser(actor, f),
    onSuccess: (u) => { setF((x) => ({ ...x, password: "", password_confirm: "" })); onDone(user ? `${u.login} mis à jour.` : `Compte ${u.login} créé (simulation, mot de passe non conservé).`); },
    onError: (e) => setErr({ field: errField(e), message: errMsg(e) }),
  });
  const pb = !user && f.password ? passwordProblems(f.password, policy) : [];
  const e = (k: string) => (err?.field === k ? err.message : null);
  return (
    <Modal title={user ? `Modifier ${user.login}` : "Ajouter un utilisateur"} onClose={onClose}>
      <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); setErr(null); m.mutate(); }}>
        <Field label="Identifiant" htmlFor="u-login" error={e("login")}><input id="u-login" className={inputCls} value={f.login} disabled={!!user} onChange={(x) => setF({ ...f, login: x.target.value })} autoComplete="off" required /></Field>
        <Field label="Nom affiché" htmlFor="u-name" error={e("display_name")}><input id="u-name" className={inputCls} value={f.display_name} onChange={(x) => setF({ ...f, display_name: x.target.value })} required /></Field>
        <Field label="Rôle" htmlFor="u-role"><select id="u-role" className={inputCls} value={f.role} onChange={(x) => setF({ ...f, role: x.target.value as Role })}>
          {RoleSchema.options.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        {!user && <>
          <Field label="Mot de passe initial" htmlFor="u-pw" error={e("password") ?? (pb.length ? `Requis : ${pb.join(", ")}` : null)}
            hint={`Politique : ${policy.min_length} caractères min.${policy.require_digit ? ", un chiffre" : ""}${policy.require_upper ? ", une majuscule" : ""}.`}>
            <input id="u-pw" type="password" autoComplete="new-password" className={inputCls} value={f.password} onChange={(x) => setF({ ...f, password: x.target.value })} required /></Field>
          <Field label="Confirmation" htmlFor="u-pw2" error={e("password_confirm") ?? (f.password_confirm && f.password_confirm !== f.password ? "La confirmation ne correspond pas." : null)}>
            <input id="u-pw2" type="password" autoComplete="new-password" className={inputCls} value={f.password_confirm} onChange={(x) => setF({ ...f, password_confirm: x.target.value })} required /></Field>
        </>}
        {err && !err.field && <p role="alert" className="text-xs text-destructive">{err.message}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className={btn} onClick={onClose}>Annuler</button>
          <button className={btnPrimary} disabled={m.isPending}>{m.isPending ? "Enregistrement…" : "Enregistrer"}</button></div>
      </form>
    </Modal>
  );
}
