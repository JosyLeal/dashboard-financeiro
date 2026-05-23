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

  fs.rmSync(tempDir, { recursive: true, force: true });
  return rows;
}

const rows = parseXlsx(excelPath);
console.log("Headers:", JSON.stringify(rows[1], null, 2));
console.log("\nSample rows:");
for (let i = 2; i <= Math.min(8, Object.keys(rows).length); i++) {
  console.log(`Row ${i}:`, JSON.stringify(rows[i]));
}
console.log("\nTotal rows:", Object.keys(rows).length);
