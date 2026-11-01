// Le lien partagé doit rouvrir exactement la même vue : les panneaux sont déjà
// dans l'URL (?tabs=), les filtres aussi ; seul le projet vit dans le
// localStorage du poste, donc on l'ajoute à l'URL partagée.
export const SHARE_PROJECT_PARAM = "project";

/** Ajoute (ou remplace) `project` dans l'URL courante sans toucher aux autres
 * paramètres : `tabs` est du base64 brut, une réécriture par URLSearchParams
 * corromprait ses `+` et ses `=`. */
export function buildShareUrl(projectId: string, href = window.location.href): string {
  const [beforeHash, hash = ""] = href.split("#");
  const [base, query = ""] = beforeHash.split("?");
  const kept = query
    .split("&")
    .filter((pair) => pair && !pair.startsWith(`${SHARE_PROJECT_PARAM}=`))
    .join("&");
  const added = `${SHARE_PROJECT_PARAM}=${encodeURIComponent(projectId)}`;
  return `${base}?${kept ? `${kept}&${added}` : added}${hash ? `#${hash}` : ""}`;
}

/** Copie via l'API presse-papiers, avec repli textarea pour les contextes non
 * sécurisés (http) où `navigator.clipboard` est indisponible. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* API refusée : on tente le repli. */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
