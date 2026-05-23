const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE = path.resolve(__dirname, "..");
const excelPath = path.join(BASE, process.argv[2] || "Controle_gastos_Josy.xlsx");

function parseXlsx(excelPath) {
  const tempDir = path.join(require("os").tmpdir(), `xlsx_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const zipPath = path.join(tempDir, "file.zip");
  const contentDir = path.join(tempDir, "content");
  fs.copyFileSync(excelPath, zipPath);
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${contentDir.replace(/'/g, "''")}' -Force"`,
    { stdio: "pipe" }
  );

  const sharedXml = fs.readFileSync(path.join(contentDir, "xl", "sharedStrings.xml"), "utf8");
  const strings = [];
  const siRegex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(sharedXml))) {
    const chunk = siMatch[1];
    const parts = chunk.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
    strings.push(parts.map((p) => p.replace(/<[^>]+>/g, "")).join(""));
  }

  const sheetXml = fs.readFileSync(path.join(contentDir, "xl", "worksheets", "sheet1.xml"), "utf8");
  const rows = {};
  const rowRegex = /<row[^>]*\sr="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const rowNum = Number(rowMatch[1]);
    const rowContent = rowMatch[2];
    const rowData = {};
    const cellRegex = /<c\b([^>]*)\/?>(?:([\s\S]*?)<\/c>)?/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent))) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] || "";
      const ref = attrs.match(/\sr="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;
      const col = ref.replace(/\d/g, "");
      const type = attrs.match(/\st="([^"]+)"/)?.[1];
      const value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? null;
      if (value == null) rowData[col] = null;
      else if (type === "s") rowData[col] = strings[Number(value)] ?? null;
      else {
        const num = Number(value);
        rowData[col] = Number.isFinite(num) ? num : value;
      }
    }
    rows[rowNum] = rowData;
  }

  const headerRow = rows[1] || {};
  const colMap = Object.entries(headerRow).reduce((acc, [col, name]) => {
    if (name) acc[name] = col;
    return acc;
  }, {});

  const get = (obj, ...keys) => {
    for (const key of keys) {
      const col = colMap[key];
      if (col && obj[col] != null && obj[col] !== "") return obj[col];
    }
    return null;
  };

  const records = [];
  const maxRow = Math.max(...Object.keys(rows).map(Number));
  for (let i = 2; i <= maxRow; i++) {
    const r = rows[i];
    if (!r) continue;
    records.push({
      formaPagamento: get(r, "Forma de pagamento"),
      banco: get(r, "Banco"),
      tipo: get(r, "Tipo de lançamento"),
      classificacao1: get(r, "Classificação1"),
      classificacao2: get(r, "Classificação2"),
      lancamento: get(r, "Lançamento"),
      valor: get(r, "Valor"),
    });
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  return records;
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

const rows = parseXlsx(excelPath);

const formas = uniq(rows.map((r) => r.formaPagamento));
const bancos = uniq(rows.map((r) => r.banco));
const tipos = uniq(rows.map((r) => r.tipo));
const c1 = uniq(rows.map((r) => r.classificacao1));
const c2 = uniq(rows.map((r) => r.classificacao2));

// Pares c1 -> c2 observados
const pairs = {};
rows.forEach((r) => {
  if (!r.classificacao1 || !r.classificacao2) return;
  const k = String(r.classificacao1);
  if (!pairs[k]) pairs[k] = new Set();
  pairs[k].add(String(r.classificacao2));
});
const pairsObj = {};
Object.keys(pairs)
  .sort((a, b) => a.localeCompare(b, "pt-BR"))
  .forEach((k) => {
    pairsObj[k] = [...pairs[k]].sort((a, b) => a.localeCompare(b, "pt-BR"));
  });

// Lançamentos por c2
const lancByC2 = {};
rows.forEach((r) => {
  if (!r.classificacao2 || !r.lancamento) return;
  const k = String(r.classificacao2);
  if (!lancByC2[k]) lancByC2[k] = new Set();
  lancByC2[k].add(String(r.lancamento));
});
const lancObj = {};
Object.keys(lancByC2)
  .sort((a, b) => a.localeCompare(b, "pt-BR"))
  .forEach((k) => {
    lancObj[k] = [...lancByC2[k]].slice(0, 8);
  });

console.log(JSON.stringify({ formas, bancos, tipos, classificacao1: c1, classificacao2: c2, pairs: pairsObj, lancamentos: lancObj }, null, 2));
