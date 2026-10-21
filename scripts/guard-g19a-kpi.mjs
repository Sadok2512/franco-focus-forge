// Scoped guard: front-owned KPI/Metrics strings; comments, fixtures and tests are not inspected.
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
const files = readdirSync("src/features/kpi")
  .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
  .map((f) => `src/features/kpi/${f}`)
  .concat([
    "src/routes/_app.kpi.tsx",
    "src/components/bc4/NoActiveProject.tsx",
    "src/features/dict-v2/FilterSelect.tsx",
  ]);
const french =
  /[àâéèêëîïôùûüçœ]|\b(Réinitialiser|Paramètres|Aucun|Aucune|Valeur|Tous|Toutes|Regrouper|Appliquer|Ligne|Tableau|Histogramme|Chronogramme|Grouper|Fermer|indisponible)\b/;
const failures = [];
for (const file of files) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(node) {
    // These strings are input matching rules, never displayed or translated.
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "isIdentifiedOperator")
      return;
    const literal =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail;
    if (literal && french.test(node.text))
      failures.push(
        `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${node.text}`,
      );
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `G19a KPI/Metrics PASS: ${files.length} production files; no French UI literals. Backend text remains outside this guard.`,
  );
