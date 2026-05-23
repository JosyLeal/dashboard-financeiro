(function () {
  "use strict";

  const THEME = {
    muted: "#7a9ec4",
    accent: "#00e5ff",
    accent2: "#007bff",
    success: "#00e5ff",
    warning: "#ffb74d",
    danger: "#ff5252",
    text: "#ffffff",
    grid: "rgba(255,255,255,0.05)",
  };

  const META = window.FINANCE_META || {};
  const DATA = window.FINANCE_DATA || [];
  const GOAL = META.objetivoPorPessoa || 500;
  const COUPLE_GOAL = META.objetivoCasal || 1000;
  const PESSOAS = Object.keys(META.pessoas || { Josy: {}, Nill: {} });
  const FILTER_COLUMNS = (() => {
    const cols = META.colunas || [
      { key: "mesPagamento", label: "Mês do pagamento", tipo: "mes" },
      { key: "formaPagamento", label: "Forma de pagamento" },
      { key: "pessoa", label: "Pessoa" },
      { key: "banco", label: "Banco" },
      { key: "tipo", label: "Tipo de lançamento" },
      { key: "classificacao1", label: "Classificação1" },
      { key: "classificacao2", label: "Classificação2" },
    ];
    if (cols.some((c) => c.key === "ano")) return cols;
    const mesIdx = cols.findIndex((c) => c.key === "mesPagamento");
    const anoCol = { key: "ano", label: "Ano", tipo: "ano", virtual: true };
    if (mesIdx >= 0) return [...cols.slice(0, mesIdx), anoCol, ...cols.slice(mesIdx)];
    return [anoCol, ...cols];
  })();
  const DEFAULT_FILTERS = META.filtrosPadrao || {
    formaPagamento: "Crédito",
    tipo: "Saída",
  };

  const REDUCTION_MAP = {
    "Taxas - Banco": { nivel: "high", dica: "Evite atrasos, juros e IOF — custo 100% evitável." },
    "Parcelamento Fatura": { nivel: "high", dica: "Parcelar fatura aumenta o total pago. Priorize quitar." },
    "Assinaturas": { nivel: "medium", dica: "Revise serviços recorrentes e cancele os pouco usados." },
    "Uber/99": { nivel: "medium", dica: "Substitua por transporte público ou combine deslocamentos." },
    "Restaurante/Lanche": { nivel: "medium", dica: "Reduza refeições fora; planeje marmitas." },
    "Ifood": { nivel: "medium", dica: "Delivery tem taxa + impulso. Defina limite semanal." },
    "Despesas Extra": { nivel: "medium", dica: "Compras não planejadas — aguarde 48h antes de comprar." },
    "Despesas Extras Imprevistas": { nivel: "medium", dica: "Imprevistos acontecem; tenha reserva para não usar o cartão." },
    "Despesas Extras Planejáveis": { nivel: "medium", dica: "Planeje compras extras no orçamento do mês." },
    "Entreterimento": { nivel: "low", dica: "Mantenha lazer, mas com teto mensal definido." },
    "Férias": { nivel: "low", dica: "Planeje viagens com antecedência e orçamento fixo." },
    "Roupas": { nivel: "medium", dica: "Compre por necessidade, não por impulso." },
    "Shopee": { nivel: "medium", dica: "Promoções levam a gastos extras — use lista de compras." },
    "Ativos - Bens Duráveis": { nivel: "low", dica: "Parcelas longas comprometem a meta por meses." },
    "Estudos - PDI": { nivel: "low", dica: "Invista em educação, mas evite acumular cursos." },
    "Outros não classificados": { nivel: "medium", dica: "Classifique lançamentos para enxergar vazamentos." },
    "Não classificado": { nivel: "medium", dica: "Lançamentos sem classificação na planilha — vale revisar e categorizar." },
    "Mercado/Feira": { nivel: "low", dica: "Essencial, mas dá para otimizar com lista e atacado." },
  };

  const NAO_CLASSIFICADO = "Não classificado";

  const ALLOWED_CLASSIFICACAO2 = [
    "Despesas Extra",
    "Ativos - Bens Duráveis",
    "Uber/99",
    "Restaurante/Lanche",
    "Poupança/Investimentos",
    "Parcelamento Fatura",
    "Outros",
    "Despesas Extra - Reembolsada",
    "Transporte Público",
    "Assinaturas",
    "Igreja",
    "Saúde",
    "Estudos - PDI",
    "Taxas - Banco",
    "Mercado/Feira",
  ];
  const ALLOWED_CLASSIFICACAO2_SET = new Set(ALLOWED_CLASSIFICACAO2);

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

  function classificacao2Only(r) {
    return normalizeClassificacao(r.classificacao2) || NAO_CLASSIFICADO;
  }

  function isAllowedClassificacao2(r) {
    return ALLOWED_CLASSIFICACAO2_SET.has(classificacao2Only(r));
  }

  const fmtMonth = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

  function fmtVal(value) {
    const n = Math.round(Number(value));
    if (value == null || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(n);
  }

  let coupleChart;
  let coupleCategoryChart;
  let personSplitChart;
  let activeFilters = {};

  function isValidFilterValue(value) {
    if (value == null || value === "") return false;
    if (isExcelError(value) || value === 0 || value === "0") return false;
    return true;
  }

  function baseRows() {
    return DATA.filter((r) => r.formaPagamento !== "Total" && isAllowedClassificacao2(r));
  }

  function monthLabel(ym) {
    const [y, m] = ym.split("-").map(Number);
    return fmtMonth.format(new Date(y, m - 1, 1));
  }

  function rowYear(row) {
    if (!row.mesPagamento) return "";
    return String(row.mesPagamento).slice(0, 4);
  }

  function filterCellValue(row, col) {
    if (col.key === "ano") return rowYear(row);
    if (col.key === "classificacao1") return normalizeClassificacao(row.classificacao1);
    if (col.key === "classificacao2") return normalizeClassificacao(row.classificacao2);
    return row[col.key];
  }

  function personColor(pessoa) {
    return META.pessoas?.[pessoa]?.cor || THEME.accent2;
  }

  function personLabel(pessoa) {
    return META.pessoas?.[pessoa]?.label || pessoa;
  }

  function isCreditGoalContext() {
    return activeFilters.formaPagamento === "Crédito" && activeFilters.tipo === "Saída";
  }

  function visiblePessoas() {
    if (activeFilters.pessoa) return [activeFilters.pessoa];
    return PESSOAS;
  }

  function statusInfo(value) {
    if (value <= GOAL) {
      return {
        cls: "status-ok",
        emoji: "✅",
        label: "Na meta",
        msg: `Dentro do objetivo — sobram ${fmtVal(GOAL - value)} até o teto.`,
      };
    }
    if (value <= GOAL * 1.5) {
      return {
        cls: "status-warn",
        emoji: "⚠️",
        label: "Atenção",
        msg: `Acima da meta em ${fmtVal(value - GOAL)}. Corte despesas ajustáveis.`,
      };
    }
    return {
      cls: "status-danger",
      emoji: "🚨",
      label: "Crítico",
      msg: `Muito acima da meta (+${fmtVal(value - GOAL)}). Revisão urgente.`,
    };
  }

  function statusBadge(info) {
    return `<span class="status-pill ${info.cls}"><span class="status-emoji">${info.emoji}</span> ${info.label}</span>`;
  }

  function sumBy(rows, keyFn) {
    const map = {};
    rows.forEach((r) => {
      const k = keyFn(r);
      map[k] = (map[k] || 0) + r.valorAbs;
    });
    return map;
  }

  function getFilterValues() {
    const values = {};
    FILTER_COLUMNS.forEach((col) => {
      if (col.origem === "arquivo") {
        values[col.key] = PESSOAS.slice();
        return;
      }
      if (col.key === "classificacao2") {
        values[col.key] = ALLOWED_CLASSIFICACAO2.slice();
        return;
      }
      if (col.key === "ano") {
        const rows = applyFilters(baseRows(), col.key);
        values[col.key] = [...new Set(rows.map(rowYear).filter(Boolean))].sort((a, b) => b.localeCompare(a));
        return;
      }
      if (col.tipo === "mes") {
        const rows = applyFilters(baseRows(), col.key);
        let months = [...new Set(rows.map((r) => r.mesPagamento).filter(Boolean))].sort();
        if (activeFilters.ano) {
          months = months.filter((m) => m.startsWith(`${activeFilters.ano}-`));
        }
        values[col.key] = months;
        return;
      }
      const rows = applyFilters(baseRows(), col.key);
      const uniq = new Set();
      rows.forEach((r) => {
        const v = r[col.key];
        if (isValidFilterValue(v)) uniq.add(String(v));
      });
      values[col.key] = [...uniq].sort((a, b) => {
        if (col.tipo === "mes") return a.localeCompare(b);
        return a.localeCompare(b, "pt-BR");
      });
    });
    return values;
  }

  function applyFilters(rows, excludeKey) {
    return rows.filter((row) =>
      FILTER_COLUMNS.every((col) => {
        if (col.key === excludeKey) return true;
        const selected = activeFilters[col.key];
        if (!selected) return true;
        return String(filterCellValue(row, col)) === selected;
      })
    );
  }

  function getFilteredRows() {
    return applyFilters(baseRows());
  }

  function readFiltersFromUI() {
    FILTER_COLUMNS.forEach((col) => {
      const el = document.getElementById(`filter-${col.key}`);
      activeFilters[col.key] = el ? el.value : "";
    });
  }

  function renderFilters(preserveValues) {
    const container = document.getElementById("filtersContainer");
    const previous = preserveValues ? { ...activeFilters } : {};

    if (!preserveValues) {
      activeFilters = {};
      FILTER_COLUMNS.forEach((col) => {
        const def = DEFAULT_FILTERS[col.key];
        activeFilters[col.key] = def != null ? def : "";
      });
      const years = [...new Set(baseRows().map(rowYear).filter(Boolean))].sort((a, b) => b.localeCompare(a));
      const now = String(new Date().getFullYear());
      activeFilters.ano = years.includes(now) ? now : years[0] || "";
    }

    const options = getFilterValues();

    container.innerHTML = FILTER_COLUMNS.map((col) => {
      const opts = options[col.key] || [];
      const current = preserveValues && previous[col.key] != null ? previous[col.key] : activeFilters[col.key];
      const safeCurrent = current && opts.includes(String(current)) ? current : "";

      if (preserveValues) activeFilters[col.key] = safeCurrent;

      const optionHtml = [
        `<option value="">Todos</option>`,
        ...opts.map((v) => {
          let label = col.tipo === "mes" ? monthLabel(v) : v;
          if (col.tipo === "ano") label = v;
          if (col.origem === "arquivo" && col.mapa) {
            const arquivo = Object.entries(col.mapa).find(([, nome]) => nome === v)?.[0];
            if (arquivo) label = `${v} (${arquivo.replace("Controle_gastos_", "").replace(".xlsx", "")})`;
          }
          const selected = String(v) === String(safeCurrent) ? " selected" : "";
          return `<option value="${escapeHtml(v)}"${selected}>${escapeHtml(label)}</option>`;
        }),
      ].join("");

      return `
        <div class="control-group">
          <label for="filter-${col.key}">${escapeHtml(col.label)}</label>
          <select id="filter-${col.key}" data-filter-key="${col.key}" aria-label="${escapeHtml(col.label)}">
            ${optionHtml}
          </select>
        </div>
      `;
    }).join("");

    if (!preserveValues && !activeFilters.mesPagamento) {
      const months = options.mesPagamento || [];
      const now = new Date();
      const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const preferred = activeFilters.ano && current.startsWith(`${activeFilters.ano}-`) ? current : "";
      activeFilters.mesPagamento = months.includes(preferred) ? preferred : months[months.length - 1] || "";
      const mesEl = document.getElementById("filter-mesPagamento");
      if (mesEl && activeFilters.mesPagamento) mesEl.value = activeFilters.mesPagamento;
    } else if (preserveValues && !activeFilters.mesPagamento) {
      const months = options.mesPagamento || [];
      activeFilters.mesPagamento = months[months.length - 1] || "";
      const mesEl = document.getElementById("filter-mesPagamento");
      if (mesEl && activeFilters.mesPagamento) mesEl.value = activeFilters.mesPagamento;
    }

    container.querySelectorAll("select[data-filter-key]").forEach((select) => {
      select.addEventListener("change", onFilterChange);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function onFilterChange() {
    readFiltersFromUI();
    renderFilters(true);
    updateDashboard();
  }

  function personTotal(rows, pessoa) {
    return rows.filter((r) => r.pessoa === pessoa).reduce((s, r) => s + r.valorAbs, 0);
  }

  function renderPersonCard(pessoa, total, containerId) {
    const card = document.getElementById(containerId);
    const showGoal = isCreditGoalContext();
    const cssClass = pessoa === "Josy" ? "person-josy" : "person-nill";

    if (!showGoal) {
      card.innerHTML = `
        <div class="kpi-head">
          <h3>${personLabel(pessoa)}</h3>
        </div>
        <div class="kpi-value" style="color:${personColor(pessoa)}">${fmtVal(total)}</div>
        <div class="kpi-meta">${escapeHtml(activeFilters.formaPagamento || "Todas as formas")} · meta 500 no cartão</div>
      `;
      return;
    }

    const info = statusInfo(total);
    const pct = Math.min((total / GOAL) * 100, 150);

    card.innerHTML = `
      <div class="kpi-head">
        <h3>${personLabel(pessoa)}</h3>
        ${statusBadge(info)}
      </div>
      <div class="kpi-value" style="color:${personColor(pessoa)}">${fmtVal(total)}</div>
      <div class="kpi-meta">${info.emoji} ${info.msg}</div>
      <div class="progress-wrap ${cssClass}">
        <div class="progress-bar">
          <div class="progress-marker" style="left: ${Math.min(100 / 1.5, 66)}%"></div>
          <div class="progress-fill" style="width: ${Math.min(pct / 1.5, 100)}%"></div>
        </div>
        <div class="progress-caption">Meta ${fmtVal(GOAL)}</div>
      </div>
    `;
  }

  function renderPersonCardsVisibility() {
    const section = document.getElementById("personCards");
    const visible = visiblePessoas();
    section.classList.toggle("single-person", visible.length === 1);
    document.getElementById("cardJosy").style.display = visible.includes("Josy") ? "" : "none";
    document.getElementById("cardNill").style.display = visible.includes("Nill") ? "" : "none";
  }

  function renderSummaryStrip(rows) {
    const pessoas = visiblePessoas();
    const total = pessoas.reduce((s, p) => s + personTotal(rows, p), 0);
    const showGoal = isCreditGoalContext();
    const excess = showGoal ? Math.max(0, total - COUPLE_GOAL) : 0;
    const month = activeFilters.mesPagamento ? monthLabel(activeFilters.mesPagamento) : "Período filtrado";

    const items = [
      `<div class="strip-item strip-highlight"><span>${escapeHtml(month)}</span><strong>${fmtVal(total)}</strong></div>`,
    ];

    if (showGoal && pessoas.length > 1) {
      items.push(
        `<div class="strip-item"><span>Meta casal</span><strong>${fmtVal(COUPLE_GOAL)}</strong></div>`,
        `<div class="strip-item"><span>Excedente</span><strong style="color:${excess > 0 ? "var(--danger)" : "var(--success)"}">${fmtVal(excess)}</strong></div>`
      );
    }

    items.push(`<div class="strip-item"><span>Lançamentos</span><strong>${rows.length}</strong></div>`);
    document.getElementById("summaryStrip").innerHTML = items.join("");
  }

  function renderInsight(rows) {
    const pessoas = visiblePessoas();
    const parts = [];
    const showGoal = isCreditGoalContext();

    if (showGoal) {
      const total = pessoas.reduce((s, p) => s + personTotal(rows, p), 0);
      if (pessoas.length > 1) {
        if (total <= COUPLE_GOAL) {
          parts.push(`O casal está <strong>dentro da meta combinada</strong> de ${fmtVal(COUPLE_GOAL)} em cartão.`);
        } else {
          parts.push(`Para atingir a meta, o casal precisa reduzir <strong>${fmtVal(total - COUPLE_GOAL)}</strong> neste mês.`);
        }
      }

      pessoas.forEach((p) => {
        const v = personTotal(rows, p);
        if (v > GOAL) parts.push(`${personLabel(p)}: cortar <strong>${fmtVal(v - GOAL)}</strong>.`);
        else if (v > 0) parts.push(`${personLabel(p)}: <strong>${fmtVal(GOAL - v)}</strong> abaixo da meta.`);
      });
    } else {
      parts.push(`Visualizando filtros ativos da planilha. Meta de 500 vale para <strong>Crédito + Saída</strong>.`);
    }

    const activeLabels = FILTER_COLUMNS.filter((c) => activeFilters[c.key] && c.key !== "mesPagamento")
      .map((c) => `${c.label}: ${activeFilters[c.key]}`)
      .join(" · ");
    if (activeLabels) parts.push(`<span style="color:var(--muted)">${activeLabels}</span>`);

    const catMap = sumBy(rows, classificacao2Only);
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    if (topCat) parts.push(`Maior gasto: <strong>${topCat[0]}</strong> (${fmtVal(topCat[1])}).`);

    document.getElementById("insightBox").innerHTML = parts.join(" ");
  }

  function getTopCategoriesByPerson(rows, limit = 10) {
    const catMap = {};
    rows.forEach((r) => {
      const cat = classificacao2Only(r);
      if (!catMap[cat]) catMap[cat] = { total: 0 };
      PESSOAS.forEach((p) => {
        if (!catMap[cat][p]) catMap[cat][p] = 0;
      });
      catMap[cat][r.pessoa] = (catMap[cat][r.pessoa] || 0) + r.valorAbs;
      catMap[cat].total += r.valorAbs;
    });
    return Object.entries(catMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, limit);
  }

  function renderCoupleCategoryChart(rows) {
    const top = getTopCategoriesByPerson(rows, 10);
    const pessoas = visiblePessoas();
    const ctx = document.getElementById("coupleCategoryChart");
    if (coupleCategoryChart) coupleCategoryChart.destroy();

    coupleCategoryChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: top.map(([cat]) => cat),
        datasets: pessoas.map((p) => ({
          label: personLabel(p),
          data: top.map(([, v]) => v[p] || 0),
          backgroundColor: personColor(p) + "cc",
          borderRadius: 4,
        })),
      },
      options: {
        ...chartOptions("Classificação2"),
        layout: { padding: { right: 48 } },
        indexAxis: "y",
        scales: {
          x: {
            stacked: true,
            ticks: { color: THEME.muted, callback: (v) => fmtVal(v) },
            grid: { color: THEME.grid },
          },
          y: { stacked: true, ticks: { color: THEME.muted }, grid: { display: false } },
        },
        plugins: {
          legend: { labels: { color: THEME.muted } },
          datalabels: {
            clip: false,
            color: (ctx) => {
              const bar = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex];
              const v = ctx.dataset.data[ctx.dataIndex];
              return v && bar && Math.abs(bar.width) > 32 ? THEME.text : THEME.muted;
            },
            font: { size: 10, weight: "600" },
            anchor: (ctx) => {
              const bar = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex];
              const v = ctx.dataset.data[ctx.dataIndex];
              return v && bar && Math.abs(bar.width) > 32 ? "center" : "end";
            },
            align: (ctx) => {
              const bar = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex];
              const v = ctx.dataset.data[ctx.dataIndex];
              return v && bar && Math.abs(bar.width) > 32 ? "center" : "end";
            },
            offset: 6,
            formatter: (value, ctx) => {
              const bar = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex];
              if (value && bar && Math.abs(bar.width) > 32) return fmtVal(value);
              if (ctx.datasetIndex === ctx.chart.data.datasets.length - 1) {
                const total = ctx.chart.data.datasets.reduce(
                  (s, ds) => s + (Number(ds.data[ctx.dataIndex]) || 0),
                  0
                );
                return total ? fmtVal(total) : "";
              }
              return "";
            },
            display: (ctx) => {
              const value = ctx.dataset.data[ctx.dataIndex];
              const bar = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex];
              if (value && bar && Math.abs(bar.width) > 32) return true;
              return ctx.datasetIndex === ctx.chart.data.datasets.length - 1;
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmtVal(ctx.raw)}`,
              footer: (items) => `Total: ${fmtVal(items.reduce((s, i) => s + i.raw, 0))}`,
            },
          },
        },
      },
    });
  }

  function renderPersonSplitChart(rows) {
    const pessoas = visiblePessoas();
    const totals = pessoas.map((p) => ({ p, v: personTotal(rows, p) })).filter(({ v }) => v > 0);
    const ctx = document.getElementById("personSplitChart");
    if (personSplitChart) personSplitChart.destroy();

    personSplitChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: totals.map(({ p }) => (p === "Nill" ? "Gastos do Nill" : "Gastos de Josy")),
        datasets: [{
          data: totals.map(({ v }) => v),
          backgroundColor: totals.map(({ p }) => personColor(p) + "e6"),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: THEME.muted, boxWidth: 12, font: { size: 11 } } },
          datalabels: {
            display: true,
            clip: false,
            color: THEME.text,
            font: { size: 12, weight: "700" },
            anchor: "center",
            align: "center",
            textAlign: "center",
            formatter: (value, ctx) => {
              const total = ctx.chart.data.datasets[0].data.reduce((s, v) => s + v, 0);
              const pct = total ? Math.round((value / total) * 100) : 0;
              return `${fmtVal(value)}\n${pct}%`;
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.chart.data.datasets[0].data.reduce((s, v) => s + v, 0);
                const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${fmtVal(ctx.raw)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  function renderOpportunities(rows) {
    const catMap = sumBy(rows, classificacao2Only);
    const total = rows.reduce((s, r) => s + r.valorAbs, 0);
    const items = Object.entries(catMap)
      .filter(([cat]) => REDUCTION_MAP[cat])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const el = document.getElementById("opportunityList");
    if (!items.length) {
      el.innerHTML = "<p class='subtitle'>Nenhuma categoria ajustável identificada com os filtros atuais.</p>";
      return;
    }

    el.innerHTML = items
      .map(([cat, val]) => {
        const meta = REDUCTION_MAP[cat];
        const pct = total ? ((val / total) * 100).toFixed(1) : 0;
        return `
          <div class="opportunity-item ${meta.nivel}">
            <div>
              <div class="cat-name">${cat}</div>
              <div class="cat-tip">${meta.dica}</div>
            </div>
            <div class="cat-value">${fmtVal(val)}</div>
            <div class="cat-pct">${pct}%</div>
          </div>
        `;
      })
      .join("");
  }

  function renderTransactions(rows) {
    const sorted = [...rows].sort((a, b) => b.valorAbs - a.valorAbs);
    document.querySelector("#txTable tbody").innerHTML = sorted
      .map(
        (r) => `
      <tr>
        <td>${r.dataLancamento || "—"}</td>
        <td><span class="person-tag person-tag-${r.pessoa?.toLowerCase()}">${personLabel(r.pessoa)}</span></td>
        <td>${r.formaPagamento || "—"}</td>
        <td>${r.banco || "—"}</td>
        <td>${classificacao2Only(r)}</td>
        <td>${normalizeClassificacao(r.classificacao1) || "—"}</td>
        <td>${r.lancamento}</td>
        <td class="amount">${fmtVal(r.valorAbs)}</td>
      </tr>
    `
      )
      .join("");
  }

  function renderCoupleChart() {
    const rows = applyFilters(baseRows(), "mesPagamento");
    const months = [...new Set(rows.map((r) => r.mesPagamento))].sort();
    const ctx = document.getElementById("coupleChart");
    if (coupleChart) coupleChart.destroy();

    if (!months.length) return;

    const totals = months.map((m) =>
      rows.filter((r) => r.mesPagamento === m).reduce((s, r) => s + r.valorAbs, 0)
    );

    coupleChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: months.map(monthLabel),
        datasets: [
          {
            label: "Gasto real",
            data: totals,
            borderColor: THEME.accent2,
            backgroundColor: "rgba(0, 123, 255, 0.12)",
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: totals.map((v) =>
              v <= COUPLE_GOAL ? THEME.success : v <= COUPLE_GOAL * 1.5 ? THEME.warning : THEME.danger
            ),
          },
          {
            label: `Meta (${fmtVal(COUPLE_GOAL)})`,
            data: months.map(() => COUPLE_GOAL),
            borderColor: THEME.accent,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        ...chartOptions("Valor mensal"),
        scales: {
          x: { ticks: { color: THEME.muted, maxRotation: 45 }, grid: { color: THEME.grid } },
          y: {
            ticks: { color: THEME.muted, callback: (v) => fmtVal(v) },
            grid: { color: THEME.grid },
            title: { display: true, text: "Valor mensal", color: THEME.muted },
          },
        },
      },
    });
  }

  function chartOptions(yTitle) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: THEME.muted, boxWidth: 12 } },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtVal(ctx.raw)}` },
        },
      },
      scales: {
        x: { ticks: { color: THEME.muted, maxRotation: 45 }, grid: { color: THEME.grid } },
        y: {
          ticks: { color: THEME.muted, callback: (v) => fmtVal(v) },
          grid: { color: THEME.grid },
          title: { display: !!yTitle, text: yTitle, color: THEME.muted },
        },
      },
    };
  }

  function updateDashboard() {
    readFiltersFromUI();
    const allFiltered = getFilteredRows();
    const monthRows = activeFilters.mesPagamento
      ? allFiltered.filter((r) => r.mesPagamento === activeFilters.mesPagamento)
      : allFiltered;

    renderPersonCardsVisibility();
    renderSummaryStrip(monthRows);
    renderPersonCard("Josy", personTotal(monthRows, "Josy"), "cardJosy");
    renderPersonCard("Nill", personTotal(monthRows, "Nill"), "cardNill");
    renderInsight(monthRows);
    renderOpportunities(monthRows);
    renderTransactions(monthRows);
    renderCoupleChart();
    renderCoupleCategoryChart(monthRows);
    renderPersonSplitChart(monthRows);
  }

  function init() {
    if (!DATA.length) {
      document.body.innerHTML = "<p style='padding:40px;color:#fff'>Dados não carregados. Execute scripts/export-data.js</p>";
      return;
    }

    if (typeof ChartDataLabels !== "undefined") {
      Chart.register(ChartDataLabels);
      Chart.defaults.set("plugins.datalabels", { display: false });
    }

    DATA.forEach((r) => {
      r.classificacao1 = normalizeClassificacao(r.classificacao1);
      r.classificacao2 = normalizeClassificacao(r.classificacao2);
    });

    renderFilters(false);
    updateDashboard();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
