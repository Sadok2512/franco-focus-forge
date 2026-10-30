import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { changePassword, toUserMessage } from "@/lib/api/http";

export const Route = createFileRoute("/_app/change-password")({ component: ChangePasswordPage });

function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 12) return setError(t("passwordChange.tooShort"));
    if (newPassword !== confirm) return setError(t("passwordChange.mismatch"));
    setBusy(true);
    try {
      await changePassword(oldPassword, newPassword);
      navigate({ to: "/projects" });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "mt-2 h-10 w-full rounded-md border border-input bg-background px-3";
  return (
    <div className="mx-auto flex w-full max-w-2xl justify-center px-6 py-12">
      <form onSubmit={submit} className="w-full rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-primary/10 p-2 text-primary">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{t("passwordChange.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("passwordChange.description")}</p>
          </div>
        </div>
        <label className="mt-6 block text-sm font-medium">
          {t("passwordChange.current")}
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          {t("passwordChange.new")}
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={12}
            required
            className={inputClass}
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          {t("passwordChange.confirm")}
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={12}
            required
            className={inputClass}
          />
        </label>
        <button
          type="button"
          onClick={() => setShow((value) => !value)}
          className="mt-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {t(show ? "passwordChange.hide" : "passwordChange.show")}
        </button>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("passwordChange.submit")}
        </button>
      </form>
    </div>
  );
}
