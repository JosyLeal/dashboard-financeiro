/**
 * Gera Controle_gastos_Exemplo.xlsx — base fictícia para estudo.
 * Categorias, bancos e classificações extraídos de Controle_gastos_Josy.xlsx.
 * Uso: node scripts/generate-sample-xlsx.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

const BASE = path.resolve(__dirname, "..");
const SOURCE = path.join(BASE, "Controle_gastos_Josy.xlsx");
const OUT = path.join(BASE, "Controle_gastos_Exemplo.xlsx");

const HEADERS = [
  "Forma de pagamento",
  "Banco",
  "Mês do pagamento",
  "Data do lançamento",
  "Lançamento",
  "Valor",
  "Tipo de lançamento",
  "Classificação1",
  "Classificação2",
  "Centro de custo",
  "Essencial",
  "Observações",
];

const FORMAS = ["Crédito", "A vista"];
const BANCOS = ["Itaú", "Nubank"];

const CENTRO_BY_C2 = {
  "Casa - Despesas Fixas": "Casa",
  "Mercado/Feira": "Casa",
  "Saúde": "Saúde",
  "Assinaturas": "Pessoal",
  "Restaurante/Lanche": "Lazer",
  "Uber/99": "Transporte",
  "Transporte Público": "Trabalho",
  "Estudos - PDI": "Estudos",
  "Férias": "Lazer",
  Igreja: "Igreja",
  "Despesas Extras Planejáveis": "Variados",
  "Despesas Extras Imprevistas": "Variados",
  "Taxas - Banco": "Financeiro",
  "Parcelamento Fatura": "Financeiro",
  "Ativos - Bens Duráveis": "Casa",
  "Poupança/Investimentos": "Financeiro",
  Salário: "Trabalho",
  "Transferencias Pix": "Variados",
};

const ESSENCIAL_BY_C2 = {
  "Casa - Despesas Fixas": "Sim",
  "Mercado/Feira": "Sim",
  Saúde: "Sim",
  Salário: "Sim",
  "Transporte Público": "Sim",
  Igreja: "Sim",
  "Taxas - Banco": "Sim",
  Assinaturas: "Não",
  "Restaurante/Lanche": "Não",
  "Uber/99": "Não",
  "Estudos - PDI": "Não",
  Férias: "Não",
  "Despesas Extras Planejáveis": "Não",
  "Despesas Extras Imprevistas": "Não",
  "Parcelamento Fatura": "Não",
  "Ativos - Bens Duráveis": "Não",
  "Poupança/Investimentos": "Não",
  "Transferencias Pix": "Não",
};

const AMOUNT_BY_C2 = {
  "Casa - Despesas Fixas": [80, 2500],
  "Mercado/Feira": [15, 420],
  Saúde: [12, 280],
  Assinaturas: [9, 89],
  "Restaurante/Lanche": [8, 120],
  "Uber/99": [6, 85],
  "Transporte Público": [4.5, 180],
  "Estudos - PDI": [29, 350],
  Férias: [40, 1200],
  Igreja: [20, 500],
  "Despesas Extras Planejáveis": [15, 450],
  "Despesas Extras Imprevistas": [25, 800],
  "Taxas - Banco": [1, 45],
  "Parcelamento Fatura": [1, 120],
  "Ativos - Bens Duráveis": [50, 900],
  "Poupança/Investimentos": [100, 1500],
  Salário: [2800, 5500],
  "Transferencias Pix": [30, 600],
};

const ENTRADA_C2 = new Set(["Salário", "Transferencias Pix"]);
const ENTRADA_LANC = ["DESC ANTECIPA PARCELAS", "ESTORNO JUROS DE FINANC", "ESTORNO CUSTO DE IOF", "APLICACAO COFRINHOS"];

function parseSourceXlsx(excelPath) {
  const tempDir = path.join(os.tmpdir(), `xlsx_src_${Date.now()}`);
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

  const get = (obj, key) => {
    const col = colMap[key];
    if (col && obj[col] != null && obj[col] !== "") return obj[col];
    return null;
  };

  const records = [];
  const maxRow = Math.max(...Object.keys(rows).map(Number));
  for (let i = 2; i <= maxRow; i++) {
    const r = rows[i];
    if (!r) continue;
    const valor = get(r, "Valor");
    if (valor == null || valor === "#N/A") continue;
    records.push({
      formaPagamento: get(r, "Forma de pagamento"),
      banco: get(r, "Banco"),
      tipo: get(r, "Tipo de lançamento"),
      classificacao1: get(r, "Classificação1"),
      classificacao2: get(r, "Classificação2"),
      lancamento: get(r, "Lançamento"),
      valor: Number(valor),
    });
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  return records;
}

function buildTaxonomy(sourceRows) {
  const skip = (v) => !v || v === "#N/A" || v === "Total" || v === 0 || v === "0";

  const pairs = [];
  const pairSet = new Set();
  const lancByC2 = {};
  const weightByC2 = {};

  sourceRows.forEach((r) => {
    if (skip(r.classificacao1) || skip(r.classificacao2)) return;
    const c1 = String(r.classificacao1).trim();
    const c2 = String(r.classificacao2).trim();
    const key = `${c1}|${c2}`;
    if (!pairSet.has(key)) {
      pairSet.add(key);
      pairs.push({ c1, c2 });
    }
    weightByC2[c2] = (weightByC2[c2] || 0) + 1;
    if (r.lancamento && !skip(r.lancamento)) {
      if (!lancByC2[c2]) lancByC2[c2] = new Set();
      lancByC2[c2].add(String(r.lancamento).trim());
    }
  });

  const lancamentos = {};
  Object.keys(lancByC2).forEach((c2) => {
    lancamentos[c2] = [...lancByC2[c2]];
  });

  return { pairs, lancamentos, weightByC2 };
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function dateToExcel(d) {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

function monthStart(year, month) {
  return new Date(year, month - 1, 1);
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted(rng, items, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function pairsForC2(pairs, c2) {
  return pairs.filter((p) => p.c2 === c2);
}

function amountFor(c2, rng, isEntrada) {
  const [min, max] = AMOUNT_BY_C2[c2] || [10, 150];
  let v = min + rng() * (max - min);
  if (c2 === "Taxas - Banco" || c2 === "Parcelamento Fatura") v = Math.min(v, 80);
  if (isEntrada && c2 === "Salário") v = Math.max(v, 2500);
  return Math.round(v * 100) / 100;
}

function formaFor(c2, lancamento, rng) {
  const lanc = String(lancamento).toUpperCase();
  if (lanc.includes("PIX") || lanc.includes("TED") || lanc.includes("MOBILEPAG") || lanc.includes("PAG BOLETO")) {
    return "A vista";
  }
  if (c2 === "Salário") return "A vista";
  if (c2 === "Taxas - Banco" || c2 === "Parcelamento Fatura") return "Crédito";
  if (c2 === "Casa - Despesas Fixas" && rng() > 0.4) return "A vista";
  return rng() > 0.25 ? "Crédito" : "A vista";
}

function bancoFor(forma, rng) {
  if (forma === "Crédito") return rng() > 0.35 ? "Itaú" : "Nubank";
  return pick(rng, BANCOS);
}

function generateRows(taxonomy) {
  const { pairs, lancamentos, weightByC2 } = taxonomy;
  const rng = seededRandom(20260524);
  const rows = [];

  const saidaC2 = Object.keys(weightByC2).filter((c2) => !ENTRADA_C2.has(c2));
  const saidaWeights = saidaC2.map((c2) => weightByC2[c2]);

  for (let year = 2024; year <= 2025; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === 2025 && month > 5) break;

      const mesExcel = dateToExcel(monthStart(year, month));
      const txCount = 20 + Math.floor(rng() * 12);

      // Salário mensal
      const salPairs = pairsForC2(pairs, "Salário");
      if (salPairs.length) {
        const sp = pick(rng, salPairs);
        const lancList = lancamentos.Salário || ["TED DEPOSITO SALARIO"];
        rows.push(makeRow(rng, {
          year, month, mesExcel, c1: sp.c1, c2: "Salário",
          lancamento: pick(rng, lancList), isEntrada: true,
        }));
      }

      for (let t = 0; t < txCount; t++) {
        const c2 = pickWeighted(rng, saidaC2, saidaWeights);
        const c1Pool = pairsForC2(pairs, c2);
        if (!c1Pool.length) continue;
        const cat = pick(rng, c1Pool);
        const lancList = lancamentos[c2] || [`${cat.c1.toUpperCase()} -CT`];
        rows.push(makeRow(rng, {
          year, month, mesExcel, c1: cat.c1, c2,
          lancamento: pick(rng, lancList), isEntrada: false,
        }));
      }

      // Entradas ocasionais (estornos / resgates)
      if (rng() > 0.55) {
        const c2 = rng() > 0.5 ? "Transferencias Pix" : "Parcelamento Fatura";
        const c1Pool = pairsForC2(pairs, c2);
        if (c1Pool.length) {
          const cat = pick(rng, c1Pool);
          const lancList = c2 === "Parcelamento Fatura"
            ? ENTRADA_LANC.filter((l) => l.includes("ESTORNO") || l.includes("DESC"))
            : lancamentos[c2] || ENTRADA_LANC;
          rows.push(makeRow(rng, {
            year, month, mesExcel, c1: cat.c1, c2,
            lancamento: pick(rng, lancList.length ? lancList : ENTRADA_LANC),
            isEntrada: true, small: true,
          }));
        }
      }
    }
  }

  rows.sort((a, b) => a.dataLancamento - b.dataLancamento || a.lancamento.localeCompare(b.lancamento));
  return rows;
}

function makeRow(rng, { year, month, mesExcel, c1, c2, lancamento, isEntrada, small }) {
  const day = 1 + Math.floor(rng() * 28);
  const valor = amountFor(c2, rng, isEntrada);
  const signed = isEntrada ? (small ? valor * (0.05 + rng() * 0.3) : valor) : -valor;
  const forma = formaFor(c2, lancamento, rng);

  const obs = [];
  if (rng() > 0.78) obs.push("Planejado");
  if (rng() > 0.9) obs.push("Revisar categoria");

  return {
    formaPagamento: forma,
    banco: bancoFor(forma, rng),
    mesPagamento: mesExcel,
    dataLancamento: dateToExcel(new Date(year, month - 1, day)),
    lancamento,
    valor: Math.round(signed * 100) / 100,
    tipo: isEntrada ? "Entrada" : "Saída",
    classificacao1: c1,
    classificacao2: c2,
    centroCusto: CENTRO_BY_C2[c2] || "Variados",
    essencial: ESSENCIAL_BY_C2[c2] || "Não",
    observacoes: obs.join("; ") || "",
  };
}

function colLetter(n) {
  let s = "";
  n++;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSharedStrings(allStrings) {
  const index = new Map();
  const unique = [];
  for (const s of allStrings) {
    const key = String(s);
    if (!index.has(key)) {
      index.set(key, unique.length);
      unique.push(key);
    }
  }
  const items = unique.map((s) => `<si><t>${xmlEscape(s)}</t></si>`).join("");
  return {
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${allStrings.length}" uniqueCount="${unique.length}">${items}</sst>`,
    index,
  };
}

function strRef(index, si) {
  return `<c r="${colLetter(index)}ROW" t="s"><v>${si}</v></c>`;
}

function numRef(index, value) {
  return `<c r="${colLetter(index)}ROW"><v>${value}</v></c>`;
}

function buildSheet(rows, stringIndex) {
  const si = (text) => stringIndex.get(String(text));
  const dataRows = rows.map((r, idx) => {
    const rowNum = idx + 2;
    const cells = [
      strRef(0, si(r.formaPagamento)),
      strRef(1, si(r.banco)),
      numRef(2, r.mesPagamento),
      numRef(3, r.dataLancamento),
      strRef(4, si(r.lancamento)),
      numRef(5, r.valor),
      strRef(6, si(r.tipo)),
      strRef(7, si(r.classificacao1)),
      strRef(8, si(r.classificacao2)),
      strRef(9, si(r.centroCusto)),
      strRef(10, si(r.essencial)),
      r.observacoes ? strRef(11, si(r.observacoes)) : `<c r="${colLetter(11)}${rowNum}"/>`,
    ]
      .map((c) => c.replace(/ROW/g, rowNum))
      .join("");
    return `<row r="${rowNum}">${cells}</row>`;
  });

  const headerCells = HEADERS.map((h, i) => strRef(i, si(h)).replace(/ROW/g, "1")).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">${headerCells}</row>
    ${dataRows.join("\n    ")}
  </sheetData>
</worksheet>`;
}

function writeXlsx(rows, outPath) {
  const allStrings = [...HEADERS];
  for (const r of rows) {
    allStrings.push(r.formaPagamento, r.banco, r.lancamento, r.tipo, r.classificacao1, r.classificacao2, r.centroCusto, r.essencial);
    if (r.observacoes) allStrings.push(r.observacoes);
  }

  const { xml: sharedStrings, index: stringIndex } = buildSharedStrings(allStrings);
  const sheet = buildSheet(rows, stringIndex);

  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Lançamentos" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font/></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="1"><xf/></cellXfs>
</styleSheet>`,
    "xl/sharedStrings.xml": sharedStrings,
    "xl/worksheets/sheet1.xml": sheet,
  };

  const tempDir = path.join(os.tmpdir(), `xlsx_gen_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(tempDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }

  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  const tempZip = path.join(tempDir, "out.zip");
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${tempDir.replace(/'/g, "''")}\\*' -DestinationPath '${tempZip.replace(/'/g, "''")}' -Force"`,
    { stdio: "pipe" }
  );
  fs.copyFileSync(tempZip, outPath);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (!fs.existsSync(SOURCE)) {
  console.error("Planilha fonte não encontrada:", SOURCE);
  process.exit(1);
}

const sourceRows = parseSourceXlsx(SOURCE);
const taxonomy = buildTaxonomy(sourceRows);
const rows = generateRows(taxonomy);
writeXlsx(rows, OUT);

const saidas = rows.filter((r) => r.tipo === "Saída").length;
const entradas = rows.filter((r) => r.tipo === "Entrada").length;
const c2uniq = [...new Set(rows.map((r) => r.classificacao2))].sort();
console.log(`Arquivo gerado: ${OUT}`);
console.log(`Fonte categorias: ${SOURCE}`);
console.log(`Total: ${rows.length} lançamentos (${saidas} saídas, ${entradas} entradas)`);
console.log(`Classificação2 (${c2uniq.length}):`, c2uniq.join(", "));
console.log(`Bancos: ${BANCOS.join(", ")} · Formas: ${FORMAS.join(", ")}`);
