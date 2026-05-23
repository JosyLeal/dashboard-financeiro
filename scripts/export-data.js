const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE = path.resolve(__dirname, "..");
const FILES = [
  { file: "Controle_gastos_Josy.xlsx", pessoa: "Josy" },
  { file: "Controle_gastos_Nill.xlsx", pessoa: "Nill" },
];

const NAO_CLASSIFICADO = "Não classificado";

function isExcelError(value) {
  if (value == null || value === "") return false;
  const s = String(value).trim().toUpperCase();
  return s === "#N/A" || s === "#N/D";
}

function normalizeClassificacao(value) {
  if (value == null || value === "" || value === 0 || value === "0") return null;
  if (isExcelError(value)) return NAO_CLASSIFICADO;
  return String(value).trim();
}

function normalizeText(value) {
  if (value == null || value === "" || value === 0 || value === "0") return null;
  if (isExcelError(value)) return null;
  return String(value).trim();
}

function excelToIso(serial) {
  if (serial == null || serial === "") return null;
  const d = new Date(Date.UTC(1899, 11, 30 + Number(serial)));
  return d.toISOString().slice(0, 10);
}

function monthKey(serial) {
  if (serial == null || serial === "") return null;
  const d = new Date(Date.UTC(1899, 11, 30 + Number(serial)));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseXlsx(excelPath) {
  const tempDir = path.join(require("os").tmpdir(), `xlsx_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const zipPath = path.join(tempDir, "file.zip");
  const contentDir = path.join(tempDir, "content");
  fs.copyFileSync(excelPath, zipPath);
  execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${contentDir.replace(/'/g, "''")}' -Force"`, {
    stdio: "pipe",
  });

  const sharedXml = fs.readFileSync(path.join(contentDir, "xl", "sharedStrings.xml"), "utf8");
  const strings = [];
  const siRegex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(sharedXml))) {
    const chunk = siMatch[1];
    const parts = chunk.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
    strings.push(
      parts
        .map((p) => p.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
        .join("")
    );
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
      if (value == null) {
        rowData[col] = null;
      } else if (type === "s") {
        rowData[col] = strings[Number(value)] ?? null;
      } else if (type === "b") {
        rowData[col] = value === "1";
      } else {
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
    const valorRaw = get(r, "Valor");
    if (valorRaw == null || valorRaw === "" || valorRaw === "#N/A") continue;
    const valor = Number(valorRaw);
    if (!Number.isFinite(valor)) continue;

    records.push({
      pessoa: null,
      arquivoFonte: null,
      formaPagamento: get(r, "Forma de pagamento"),
      banco: get(r, "Banco"),
      mesPagamento: monthKey(get(r, "Mês do pagamento")),
      dataLancamento: excelToIso(get(r, "Data do lançamento")),
      lancamento: normalizeText(get(r, "Lançamento")),
      valor: Math.round(valor * 100) / 100,
      valorAbs: Math.round(Math.abs(valor) * 100) / 100,
      tipo: normalizeText(get(r, "Tipo de lançamento")),
      classificacao1: normalizeClassificacao(get(r, "Classificação1")),
      classificacao2: normalizeClassificacao(get(r, "Classificação2")),
      lancamento2: get(r, "Lançamento2"),
      lancamento3: normalizeText(get(r, "Lançamento3")),
      lancamento4: normalizeText(get(r, "Lançamento4")),
    });
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  return records;
}

const all = [];
for (const { file, pessoa } of FILES) {
  const fullPath = path.join(BASE, file);
  if (!fs.existsSync(fullPath)) {
    console.error("Arquivo não encontrado:", fullPath);
    process.exit(1);
  }
  const rows = parseXlsx(fullPath).map((r) => ({ ...r, pessoa, arquivoFonte: file }));
  all.push(...rows);
  console.log(`${pessoa}: ${rows.length} lançamentos`);
}

const meta = {
  objetivoPorPessoa: 500,
  objetivoCasal: 1000,
  pessoas: {
    Josy: { label: "Josy", cor: "#00e5ff" },
    Nill: { label: "Nill", cor: "#007bff" },
  },
  fontes: FILES.map((f) => f.file),
  colunas: [
    { key: "mesPagamento", label: "Mês do pagamento", tipo: "mes" },
    { key: "formaPagamento", label: "Forma de pagamento" },
    { key: "pessoa", label: "Pessoa", origem: "arquivo", mapa: {
      "Controle_gastos_Josy.xlsx": "Josy",
      "Controle_gastos_Nill.xlsx": "Nill",
    }},
    { key: "banco", label: "Banco" },
    { key: "tipo", label: "Tipo de lançamento" },
    { key: "classificacao1", label: "Classificação1" },
    { key: "classificacao2", label: "Classificação2" },
  ],
  filtrosPadrao: {
    mesPagamento: null,
    formaPagamento: "Crédito",
    pessoa: "",
    banco: "",
    tipo: "Saída",
    classificacao1: "",
    classificacao2: "",
  },
};

fs.writeFileSync(path.join(BASE, "data.json"), JSON.stringify(all), "utf8");

const dataJs = `window.FINANCE_DATA=${JSON.stringify(all)};\nwindow.FINANCE_META=${JSON.stringify(meta)};\n`;
fs.writeFileSync(path.join(BASE, "js", "data.js"), dataJs, "utf8");
console.log("Total:", all.length, "registros exportados.");
