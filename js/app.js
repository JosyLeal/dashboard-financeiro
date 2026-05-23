(function () {
  "use strict";

  const META = window.FINANCE_META || {};
  const DATA = window.FINANCE_DATA || [];
  const GOAL = META.objetivoPorPessoa || 500;
  const COUPLE_GOAL = META.objetivoCasal || 1000;
  const PESSOAS = Object.keys(META.pessoas || { Josy: {}, Nill: {} });
  const FILTER_COLUMNS = META.colunas || [
    { key: "mesPagamento", label: "Mês do pagamento", tipo: "mes" },
    { key: "formaPagamento", label: "Forma de pagamento" },
    { key: "pessoa", label: "Pessoa" },
    { key: "banco", label: "Banco" },
    { key: "tipo", label: "Tipo de lançamento" },
    { key: "classificacao1", label: "Classificação1" },
    { key: "classificacao2", label: "Classificação2" },
  ];
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

  function classificacao2Label(r) {
    return normalizeClassificacao(r.classificacao2) || normalizeClassificacao(r.classificacao1) || "Sem categoria";
  }

  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const fmtMonth = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

  let trendChart;
  let categoryChart;
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
    return DATA.filter((r) => r.formaPagamento !== "Total");
  }

  function monthLabel(ym) {
    const [y, m] = ym.split("-").map(Number);
    return fmtMonth.format(new Date(y, m - 1, 1));
  }

  function personColor(pessoa) {
    return META.pessoas?.[pessoa]?.cor || "#5b8def";
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
        label: "Na meta",
        msg: `Dentro do objetivo — sobram ${fmt.format(GOAL - value)} até o teto.`,
      };
    }
    if (value <= GOAL * 1.5) {
      return {
        cls: "status-warn",
        label: "Atenção",
        msg: `Acima da meta em ${fmt.format(value - GOAL)}. Corte despesas ajustáveis.`,
      };
    }
    return {
      cls: "status-danger",
      label: "Crítico",
      msg: `Muito acima da meta (+${fmt.format(value - GOAL)}). Revisão urgente.`,
    };
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
        let cell = row[col.key];
        if (col.key === "classificacao1") cell = normalizeClassificacao(row.classificacao1);
        if (col.key === "classificacao2") cell = normalizeClassificacao(row.classificacao2);
        return String(cell) === selected;
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

    if (!activeFilters.mesPagamento) {
      const months = options.mesPagamento || [];
      const now = new Date();
      const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      activeFilters.mesPagamento = months.includes(current) ? current : months[months.length - 1] || "";
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
        <h3>${personLabel(pessoa)}</h3>
        <p class="subtitle">Total filtrado no mês · ${escapeHtml(activeFilters.formaPagamento || "Todas as formas")}</p>
        <div class="kpi-value" style="color:${personColor(pessoa)}">${fmt.format(total)}</div>
        <div class="kpi-meta">Meta de R$ 500 aplica-se a gastos com cartão (Crédito + Saída).</div>
      `;
      return;
    }

    const info = statusInfo(total);
    const pct = Math.min((total / GOAL) * 100, 150);

    card.innerHTML = `
      <h3>${personLabel(pessoa)}</h3>
      <p class="subtitle">Meta: ${fmt.format(GOAL)}/mês no cartão</p>
      <div class="kpi-value" style="color:${personColor(pessoa)}">${fmt.format(total)}</div>
      <div class="kpi-meta">${info.msg}</div>
      <span class="status-pill ${info.cls}">${info.label}</span>
      <div class="progress-wrap ${cssClass}">
        <div class="progress-label">
          <span>R$ 0</span>
          <span>Meta ${fmt.format(GOAL)}</span>
          <span>${fmt.format(Math.max(total, GOAL * 1.2))}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-marker" style="left: ${Math.min(100 / 1.5, 66)}%"></div>
          <div class="progress-fill" style="width: ${Math.min(pct / 1.5, 100)}%"></div>
        </div>
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
    const totals = pessoas.map((p) => ({ p, v: personTotal(rows, p) }));
    const total = totals.reduce((s, x) => s + x.v, 0);
    const showGoal = isCreditGoalContext();
    const excess = showGoal ? Math.max(0, total - COUPLE_GOAL) : 0;

    const items = [
      `<div class="strip-item"><span>Total no mês</span><strong>${fmt.format(total)}</strong></div>`,
      ...totals.map(
        ({ p, v }) =>
          `<div class="strip-item"><span>${personLabel(p)}</span><strong style="color:${personColor(p)}">${fmt.format(v)}</strong></div>`
      ),
    ];

    if (showGoal && pessoas.length > 1) {
      items.push(
        `<div class="strip-item"><span>Meta do casal</span><strong>${fmt.format(COUPLE_GOAL)}</strong></div>`,
        `<div class="strip-item"><span>Excedente</span><strong style="color:${excess > 0 ? "var(--danger)" : "var(--success)"}">${fmt.format(excess)}</strong></div>`
      );
    }

    items.push(`<div class="strip-item"><span>Registros</span><strong>${rows.length}</strong></div>`);
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
          parts.push(`O casal está <strong>dentro da meta combinada</strong> de ${fmt.format(COUPLE_GOAL)} em cartão.`);
        } else {
          parts.push(`Para atingir a meta, o casal precisa reduzir <strong>${fmt.format(total - COUPLE_GOAL)}</strong> neste mês.`);
        }
      }

      pessoas.forEach((p) => {
        const v = personTotal(rows, p);
        if (v > GOAL) parts.push(`${personLabel(p)}: cortar <strong>${fmt.format(v - GOAL)}</strong>.`);
        else if (v > 0) parts.push(`${personLabel(p)}: <strong>${fmt.format(GOAL - v)}</strong> abaixo da meta.`);
      });
    } else {
      parts.push(`Visualizando filtros ativos da planilha. Meta de R$ 500 vale para <strong>Crédito + Saída</strong>.`);
    }

    const activeLabels = FILTER_COLUMNS.filter((c) => activeFilters[c.key])
      .map((c) => `<strong>${c.label}</strong>: ${c.tipo === "mes" ? monthLabel(activeFilters[c.key]) : activeFilters[c.key]}`)
      .join(" · ");
    if (activeLabels) parts.push(`Filtros: ${activeLabels}.`);

    const catMap = sumBy(rows, classificacao2Label);
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    if (topCat) parts.push(`Maior Classificação2: <strong>${topCat[0]}</strong> (${fmt.format(topCat[1])}).`);

    document.getElementById("insightBox").innerHTML = parts.join(" ");
  }

  function getTopCategoriesByPerson(rows, limit = 10) {
    const catMap = {};
    rows.forEach((r) => {
      const cat = classificacao2Label(r);
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
        ...chartOptions("Classificação2 (R$)"),
        indexAxis: "y",
        scales: {
          x: {
            stacked: true,
            ticks: { color: "#8fa3bc", callback: (v) => fmt.format(v) },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
          y: { stacked: true, ticks: { color: "#8fa3bc" }, grid: { display: false } },
        },
        plugins: {
          legend: { labels: { color: "#8fa3bc" } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmt.format(ctx.raw)}`,
              footer: (items) => `Total: ${fmt.format(items.reduce((s, i) => s + i.raw, 0))}`,
            },
          },
        },
      },
    });
  }

  function renderPersonSplitChart(rows) {
    const top = getTopCategoriesByPerson(rows, 8);
    const ctx = document.getElementById("personSplitChart");
    if (personSplitChart) personSplitChart.destroy();

    personSplitChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: top.map(([cat]) => cat),
        datasets: [{
          data: top.map(([, v]) => v.total),
          backgroundColor: top.map((_, i) => `hsla(${160 + i * 22}, 60%, 52%, 0.9)`),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: "#8fa3bc", boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = rows.reduce((s, r) => s + r.valorAbs, 0);
                const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${fmt.format(ctx.raw)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  function renderCategoryTable(rows) {
    const top = getTopCategoriesByPerson(rows, 15);
    const totalGeral = rows.reduce((s, r) => s + r.valorAbs, 0);
    const pessoas = visiblePessoas();
    const thead = document.querySelector("#catTable thead tr");

    thead.innerHTML = `
      <th>Classificação2</th>
      ${pessoas.map((p) => `<th>${personLabel(p)}</th>`).join("")}
      <th>Total</th>
      <th>% do mês</th>
    `;

    document.querySelector("#catTable tbody").innerHTML = top
      .map(([cat, v]) => {
        const pct = totalGeral ? ((v.total / totalGeral) * 100).toFixed(1) : 0;
        return `
          <tr>
            <td>${cat}</td>
            ${pessoas
              .map((p) => {
                const cls = p === "Josy" ? "person-josy-cell" : "person-nill-cell";
                return `<td class="amount ${cls}">${fmt.format(v[p] || 0)}</td>`;
              })
              .join("")}
            <td class="amount"><strong>${fmt.format(v.total)}</strong></td>
            <td class="amount">${pct}%</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderOpportunities(rows) {
    const catMap = sumBy(rows, classificacao2Label);
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
            <div class="cat-value">${fmt.format(val)}</div>
            <div class="cat-pct">${pct}%</div>
          </div>
        `;
      })
      .join("");
  }

  function renderTransactions(rows) {
    const top = [...rows].sort((a, b) => b.valorAbs - a.valorAbs).slice(0, 15);
    document.querySelector("#txTable tbody").innerHTML = top
      .map(
        (r) => `
      <tr>
        <td>${r.dataLancamento || "—"}</td>
        <td><span class="person-tag person-tag-${r.pessoa?.toLowerCase()}">${personLabel(r.pessoa)}</span></td>
        <td>${r.formaPagamento || "—"}</td>
        <td>${r.banco || "—"}</td>
        <td>${r.lancamento}</td>
        <td>${classificacao2Label(r)}</td>
        <td class="amount">${fmt.format(r.valorAbs)}</td>
      </tr>
    `
      )
      .join("");
  }

  function renderTrendChart(allFiltered) {
    const months = [...new Set(allFiltered.map((r) => r.mesPagamento))].sort();
    const pessoas = visiblePessoas();
    const showGoal = isCreditGoalContext();
    const ctx = document.getElementById("trendChart");
    if (trendChart) trendChart.destroy();

    const datasets = pessoas.map((p) => ({
      label: personLabel(p),
      data: months.map((m) => personTotal(allFiltered.filter((r) => r.mesPagamento === m), p)),
      borderColor: personColor(p),
      backgroundColor: personColor(p) + "22",
      tension: 0.3,
      fill: true,
    }));

    if (showGoal) {
      datasets.push(
        {
          label: `Meta/pessoa (${fmt.format(GOAL)})`,
          data: months.map(() => GOAL),
          borderColor: "#3dd6b5",
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
        {
          label: `Meta casal (${fmt.format(COUPLE_GOAL)})`,
          data: months.map(() => COUPLE_GOAL),
          borderColor: "#5b8def",
          borderDash: [2, 4],
          pointRadius: 0,
          fill: false,
        }
      );
    }

    trendChart = new Chart(ctx, {
      type: "line",
      data: { labels: months.map(monthLabel), datasets },
      options: chartOptions("Evolução mensal (R$)"),
    });
  }

  function renderCategoryChart(rows) {
    const catMap = sumBy(rows, classificacao2Label);
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ctx = document.getElementById("categoryChart");
    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sorted.map(([c]) => c),
        datasets: [{
          label: "Total",
          data: sorted.map(([, v]) => v),
          backgroundColor: sorted.map((_, i) => `hsla(${170 + i * 18}, 65%, 52%, 0.85)`),
          borderRadius: 6,
        }],
      },
      options: {
        ...chartOptions("Classificação2 (R$)"),
        indexAxis: "y",
        plugins: { legend: { display: false } },
      },
    });
  }

  function renderCoupleChart(allFiltered) {
    const month = activeFilters.mesPagamento;
    const months = [...new Set(allFiltered.map((r) => r.mesPagamento))].sort();
    const idx = Math.max(0, months.indexOf(month) - 5);
    const slice = months.slice(idx, months.indexOf(month) + 1);
    const showGoal = isCreditGoalContext();
    const ctx = document.getElementById("coupleChart");
    if (coupleChart) coupleChart.destroy();

    const totals = slice.map((m) => allFiltered.filter((r) => r.mesPagamento === m).reduce((s, r) => s + r.valorAbs, 0));

    const datasets = [{
      label: "Total filtrado",
      data: totals,
      backgroundColor: showGoal
        ? totals.map((v) => (v <= COUPLE_GOAL ? "rgba(76,175,135,0.8)" : v <= COUPLE_GOAL * 1.5 ? "rgba(245,166,35,0.85)" : "rgba(239,83,80,0.85)"))
        : "rgba(91,141,239,0.75)",
      borderRadius: 8,
    }];

    if (showGoal) {
      datasets.push({
        label: "Meta casal",
        data: slice.map(() => COUPLE_GOAL),
        type: "line",
        borderColor: "#3dd6b5",
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      });
    }

    coupleChart = new Chart(ctx, {
      type: "bar",
      data: { labels: slice.map(monthLabel), datasets },
      options: chartOptions("Total mensal (R$)"),
    });
  }

  function chartOptions(yTitle) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#8fa3bc", boxWidth: 12 } },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt.format(ctx.raw)}` },
        },
      },
      scales: {
        x: { ticks: { color: "#8fa3bc", maxRotation: 45 }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: {
          ticks: { color: "#8fa3bc", callback: (v) => fmt.format(v) },
          grid: { color: "rgba(255,255,255,0.05)" },
          title: { display: !!yTitle, text: yTitle, color: "#8fa3bc" },
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
    renderCategoryChart(monthRows);
    renderCoupleChart(allFiltered);
    renderCoupleCategoryChart(monthRows);
    renderPersonSplitChart(monthRows);
    renderCategoryTable(monthRows);
    renderTrendChart(allFiltered);
  }

  function init() {
    if (!DATA.length) {
      document.body.innerHTML = "<p style='padding:40px;color:#fff'>Dados não carregados. Execute scripts/export-data.js</p>";
      return;
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
