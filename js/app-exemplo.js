(function () {
  "use strict";

  const META = window.FINANCE_META || {};
  const DATA = window.FINANCE_DATA || [];
  const GOAL = META.objetivoMensal || 3500;
  const CARD_GOAL = META.objetivoCartao || 800;
  const ACCENT = META.cor || "#5b8def";
  const FILTER_COLUMNS = META.colunas || [];
  const DEFAULT_FILTERS = META.filtrosPadrao || { tipo: "Saída" };

  const REDUCTION_MAP = {
    "Taxas - Banco": { nivel: "high", dica: "Evite atrasos, juros e IOF — custo 100% evitável." },
    "Parcelamento Fatura": { nivel: "high", dica: "Parcelar fatura aumenta o total pago. Priorize quitar." },
    Assinaturas: { nivel: "medium", dica: "Revise serviços recorrentes e cancele os pouco usados." },
    "Uber/99": { nivel: "medium", dica: "Substitua por transporte público ou combine deslocamentos." },
    "Restaurante/Lanche": { nivel: "medium", dica: "Reduza refeições fora; planeje marmitas." },
    Ifood: { nivel: "medium", dica: "Delivery tem taxa + impulso. Defina limite semanal." },
    "Despesas Extras Imprevistas": { nivel: "medium", dica: "Imprevistos acontecem; tenha reserva para não usar o cartão." },
    "Despesas Extras Planejáveis": { nivel: "medium", dica: "Planeje compras extras no orçamento do mês." },
    Férias: { nivel: "low", dica: "Planeje viagens com antecedência e orçamento fixo." },
    "Estudos - PDI": { nivel: "low", dica: "Invista em educação, mas evite acumular cursos." },
    "Ativos - Bens Duráveis": { nivel: "low", dica: "Parcelas longas comprometem a meta por meses." },
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

  let categoryChart;
  let categoryPieChart;
  let centroChart;
  let essencialChart;
  let cashflowChart;
  let goalChart;
  let formaChart;
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

  function isExpenseGoalContext() {
    return activeFilters.tipo === "Saída" || !activeFilters.tipo;
  }

  function statusInfo(value) {
    if (value <= GOAL) {
      return {
        cls: "status-ok",
        label: "Na meta",
        msg: `Dentro do objetivo — sobram ${fmt.format(GOAL - value)} até o teto.`,
      };
    }
    if (value <= GOAL * 1.28) {
      return {
        cls: "status-warn",
        label: "Atenção",
        msg: `Acima da meta em ${fmt.format(value - GOAL)}. Revise gastos não essenciais.`,
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

  function totalByTipo(rows, tipo) {
    return rows.filter((r) => r.tipo === tipo).reduce((s, r) => s + r.valorAbs, 0);
  }

  function getFilterValues() {
    const values = {};
    FILTER_COLUMNS.forEach((col) => {
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
          const label = col.tipo === "mes" ? monthLabel(v) : v;
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

  function onFilterChange() {
    readFiltersFromUI();
    renderFilters(true);
    updateDashboard();
  }

  function renderKpiCard(id, title, value, subtitle, valueClass, extra) {
    document.getElementById(id).innerHTML = `
      <h3>${title}</h3>
      <p class="subtitle">${subtitle}</p>
      <div class="kpi-value ${valueClass}">${fmt.format(value)}</div>
      ${extra || ""}
    `;
  }

  function renderSummaryStrip(monthRows, allMonthRows) {
    const despesas = totalByTipo(monthRows, "Saída");
    const receitasAll = totalByTipo(allMonthRows, "Entrada");
    const saldo = receitasAll - despesas;
    const naoEssencial = monthRows.filter((r) => r.tipo === "Saída" && r.essencial === "Não").reduce((s, r) => s + r.valorAbs, 0);

    document.getElementById("summaryStrip").innerHTML = [
      `<div class="strip-item"><span>Despesas</span><strong style="color:var(--danger)">${fmt.format(despesas)}</strong></div>`,
      `<div class="strip-item"><span>Receitas</span><strong style="color:var(--success)">${fmt.format(receitasAll)}</strong></div>`,
      `<div class="strip-item"><span>Saldo</span><strong style="color:${saldo >= 0 ? "var(--success)" : "var(--danger)"}">${fmt.format(saldo)}</strong></div>`,
      `<div class="strip-item"><span>Não essencial</span><strong style="color:var(--warning)">${fmt.format(naoEssencial)}</strong></div>`,
      `<div class="strip-item"><span>Lançamentos</span><strong>${monthRows.length}</strong></div>`,
    ].join("");
  }

  function renderKpiCards(monthRows, allMonthRows) {
    const despesas = totalByTipo(monthRows, "Saída");
    const receitas = totalByTipo(allMonthRows, "Entrada");
    const saldo = receitas - despesas;
    const showGoal = isExpenseGoalContext();
    const info = statusInfo(despesas);
    const pct = Math.min((despesas / GOAL) * 100, 150);

    renderKpiCard(
      "cardDespesas",
      "Despesas do mês",
      despesas,
      showGoal ? `Meta: ${fmt.format(GOAL)}/mês` : "Total filtrado",
      "negative",
      showGoal
        ? `<span class="status-pill ${info.cls}">${info.label}</span>
           <div class="progress-wrap progress-exemplo">
             <div class="progress-label"><span>R$ 0</span><span>Meta ${fmt.format(GOAL)}</span></div>
             <div class="progress-bar">
               <div class="progress-fill progress-fill-despesa" style="width:${Math.min(pct / 1.5, 100)}%"></div>
             </div>
           </div>`
        : `<div class="kpi-meta">Meta de R$ 3.500 aplica-se a despesas totais.</div>`
    );

    renderKpiCard(
      "cardReceitas",
      "Receitas do mês",
      receitas,
      "Entradas (salário, freelance, reembolso)",
      "positive",
      `<div class="kpi-meta">${receitas > despesas ? "Receitas cobrem as despesas deste mês." : `Déficit de ${fmt.format(despesas - receitas)}.`}</div>`
    );

    renderKpiCard(
      "cardSaldo",
      "Saldo do mês",
      saldo,
      "Receitas − Despesas",
      saldo >= 0 ? "positive" : "negative",
      `<div class="kpi-meta">${saldo >= 0 ? "Resultado positivo no período." : "Gastos superaram as entradas."}</div>`
    );
  }

  function renderInsight(monthRows, allMonthRows) {
    const despesas = totalByTipo(monthRows, "Saída");
    const receitas = totalByTipo(allMonthRows, "Entrada");
    const parts = [];

    if (isExpenseGoalContext()) {
      if (despesas <= GOAL) {
        parts.push(`Despesas <strong>dentro da meta</strong> de ${fmt.format(GOAL)} — sobram ${fmt.format(GOAL - despesas)}.`);
      } else {
        parts.push(`Para atingir a meta, reduza <strong>${fmt.format(despesas - GOAL)}</strong> neste mês.`);
      }
    }

    const saldo = receitas - despesas;
    if (saldo >= 0) parts.push(`Saldo positivo de <strong>${fmt.format(saldo)}</strong>.`);
    else parts.push(`Déficit de <strong>${fmt.format(Math.abs(saldo))}</strong> — receitas não cobrem despesas.`);

    const naoEss = monthRows.filter((r) => r.tipo === "Saída" && r.essencial === "Não");
    const naoEssTotal = naoEss.reduce((s, r) => s + r.valorAbs, 0);
    if (naoEssTotal > 0) {
      parts.push(`Gastos não essenciais: <strong>${fmt.format(naoEssTotal)}</strong> (${despesas ? ((naoEssTotal / despesas) * 100).toFixed(1) : 0}% das despesas).`);
    }

    const catMap = sumBy(monthRows.filter((r) => r.tipo === "Saída"), classificacao2Label);
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    if (topCat) parts.push(`Maior categoria: <strong>${topCat[0]}</strong> (${fmt.format(topCat[1])}).`);

    const activeLabels = FILTER_COLUMNS.filter((c) => activeFilters[c.key])
      .map((c) => `<strong>${c.label}</strong>: ${c.tipo === "mes" ? monthLabel(activeFilters[c.key]) : activeFilters[c.key]}`)
      .join(" · ");
    if (activeLabels) parts.push(`Filtros: ${activeLabels}.`);

    document.getElementById("insightBox").innerHTML = parts.join(" ");
  }

  function expenseRows(rows) {
    return rows.filter((r) => r.tipo === "Saída");
  }

  function chartOptions(yTitle) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#8fa3bc", boxWidth: 12 } },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label || ctx.label}: ${fmt.format(ctx.raw)}` },
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

  function renderCategoryChart(rows) {
    const catMap = sumBy(expenseRows(rows), classificacao2Label);
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ctx = document.getElementById("categoryChart");
    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sorted.map(([c]) => c),
        datasets: [{
          label: "Despesas",
          data: sorted.map(([, v]) => v),
          backgroundColor: sorted.map((_, i) => `hsla(${200 + i * 18}, 65%, 55%, 0.85)`),
          borderRadius: 6,
        }],
      },
      options: {
        ...chartOptions("R$"),
        indexAxis: "y",
        plugins: { legend: { display: false } },
      },
    });
  }

  function renderCategoryPieChart(rows) {
    const catMap = sumBy(expenseRows(rows), classificacao2Label);
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const ctx = document.getElementById("categoryPieChart");
    if (categoryPieChart) categoryPieChart.destroy();

    categoryPieChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: sorted.map(([c]) => c),
        datasets: [{
          data: sorted.map(([, v]) => v),
          backgroundColor: sorted.map((_, i) => `hsla(${160 + i * 28}, 58%, 52%, 0.9)`),
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
                const total = sorted.reduce((s, [, v]) => s + v, 0);
                const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${fmt.format(ctx.raw)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  function renderCentroChart(rows) {
    const map = sumBy(expenseRows(rows), (r) => r.centroCusto || "Sem centro");
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const ctx = document.getElementById("centroChart");
    if (centroChart) centroChart.destroy();

    centroChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sorted.map(([c]) => c),
        datasets: [{
          label: "Despesas",
          data: sorted.map(([, v]) => v),
          backgroundColor: ACCENT + "cc",
          borderRadius: 8,
        }],
      },
      options: chartOptions("R$"),
    });
  }

  function renderEssencialChart(rows) {
    const despesas = expenseRows(rows);
    const essencial = despesas.filter((r) => r.essencial === "Sim").reduce((s, r) => s + r.valorAbs, 0);
    const naoEssencial = despesas.filter((r) => r.essencial === "Não").reduce((s, r) => s + r.valorAbs, 0);
    const outros = despesas.filter((r) => r.essencial !== "Sim" && r.essencial !== "Não").reduce((s, r) => s + r.valorAbs, 0);
    const ctx = document.getElementById("essencialChart");
    if (essencialChart) essencialChart.destroy();

    essencialChart = new Chart(ctx, {
      type: "pie",
      data: {
        labels: ["Essencial", "Não essencial", "Não informado"].filter((_, i) => [essencial, naoEssencial, outros][i] > 0),
        datasets: [{
          data: [essencial, naoEssencial, outros].filter((v) => v > 0),
          backgroundColor: ["rgba(76,175,135,0.85)", "rgba(245,166,35,0.85)", "rgba(143,163,188,0.6)"],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#8fa3bc" } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = essencial + naoEssencial + outros;
                const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${fmt.format(ctx.raw)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  function renderCashflowChart(allFiltered) {
    const months = [...new Set(allFiltered.map((r) => r.mesPagamento))].sort();
    const ctx = document.getElementById("cashflowChart");
    if (cashflowChart) cashflowChart.destroy();

    cashflowChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: months.map(monthLabel),
        datasets: [
          {
            label: "Despesas",
            data: months.map((m) => totalByTipo(allFiltered.filter((r) => r.mesPagamento === m), "Saída")),
            borderColor: "#ef5350",
            backgroundColor: "rgba(239,83,80,0.12)",
            tension: 0.3,
            fill: true,
          },
          {
            label: "Receitas",
            data: months.map((m) => totalByTipo(allFiltered.filter((r) => r.mesPagamento === m), "Entrada")),
            borderColor: "#4caf87",
            backgroundColor: "rgba(76,175,135,0.12)",
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: chartOptions("R$"),
    });
  }

  function renderGoalChart(allFiltered) {
    const months = [...new Set(allFiltered.map((r) => r.mesPagamento))].sort();
    const month = activeFilters.mesPagamento;
    const idx = Math.max(0, months.indexOf(month) - 5);
    const slice = months.slice(idx, months.indexOf(month) + 1);
    const ctx = document.getElementById("goalChart");
    if (goalChart) goalChart.destroy();

    const totals = slice.map((m) => totalByTipo(allFiltered.filter((r) => r.mesPagamento === m), "Saída"));

    goalChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: slice.map(monthLabel),
        datasets: [
          {
            label: "Despesas",
            data: totals,
            backgroundColor: totals.map((v) =>
              v <= GOAL ? "rgba(76,175,135,0.8)" : v <= GOAL * 1.28 ? "rgba(245,166,35,0.85)" : "rgba(239,83,80,0.85)"
            ),
            borderRadius: 8,
          },
          {
            label: "Meta mensal",
            data: slice.map(() => GOAL),
            type: "line",
            borderColor: "#3dd6b5",
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: chartOptions("R$"),
    });
  }

  function renderFormaChart(rows) {
    const map = sumBy(expenseRows(rows), (r) => r.formaPagamento || "Outros");
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const ctx = document.getElementById("formaChart");
    if (formaChart) formaChart.destroy();

    formaChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sorted.map(([c]) => c),
        datasets: [{
          label: "Despesas",
          data: sorted.map(([, v]) => v),
          backgroundColor: ["#5b8def", "#3dd6b5", "#ec7000", "#8a05be"].slice(0, sorted.length),
          borderRadius: 6,
        }],
      },
      options: {
        ...chartOptions("R$"),
        indexAxis: "y",
        plugins: { legend: { display: false } },
      },
    });
  }

  function renderOpportunities(rows) {
    const catMap = sumBy(expenseRows(rows).filter((r) => r.essencial === "Não"), classificacao2Label);
    const total = expenseRows(rows).reduce((s, r) => s + r.valorAbs, 0);
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

  function renderCategoryTable(rows) {
    const despesas = expenseRows(rows);
    const catMap = {};
    despesas.forEach((r) => {
      const cat = classificacao2Label(r);
      if (!catMap[cat]) catMap[cat] = { total: 0, c1: r.classificacao1, essencial: r.essencial };
      catMap[cat].total += r.valorAbs;
    });
    const sorted = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total).slice(0, 15);
    const totalGeral = despesas.reduce((s, r) => s + r.valorAbs, 0);

    document.querySelector("#catTable tbody").innerHTML = sorted
      .map(([cat, v]) => {
        const pct = totalGeral ? ((v.total / totalGeral) * 100).toFixed(1) : 0;
        const essTag = v.essencial === "Sim"
          ? '<span class="tag-essencial sim">Sim</span>'
          : v.essencial === "Não"
            ? '<span class="tag-essencial nao">Não</span>'
            : "—";
        return `
          <tr>
            <td>${cat}</td>
            <td>${v.c1 || "—"}</td>
            <td class="amount">${fmt.format(v.total)}</td>
            <td class="amount">${pct}%</td>
            <td>${essTag}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderTransactions(rows) {
    const top = [...rows].sort((a, b) => b.valorAbs - a.valorAbs).slice(0, 15);
    document.querySelector("#txTable tbody").innerHTML = top
      .map((r) => {
        const tipoCls = r.tipo === "Entrada" ? "entrada" : "saida";
        return `
          <tr>
            <td>${r.dataLancamento || "—"}</td>
            <td><span class="tag-tipo ${tipoCls}">${r.tipo || "—"}</span></td>
            <td>${r.formaPagamento || "—"}</td>
            <td>${r.banco || "—"}</td>
            <td>${r.lancamento}</td>
            <td>${r.centroCusto || "—"}</td>
            <td>${classificacao2Label(r)}</td>
            <td class="amount">${r.tipo === "Entrada" ? "+" : "−"}${fmt.format(r.valorAbs)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function updateDashboard() {
    readFiltersFromUI();
    const allFiltered = getFilteredRows();
    const allMonthRows = activeFilters.mesPagamento
      ? baseRows().filter((r) => r.mesPagamento === activeFilters.mesPagamento)
      : baseRows();
    const monthRows = activeFilters.mesPagamento
      ? allFiltered.filter((r) => r.mesPagamento === activeFilters.mesPagamento)
      : allFiltered;

    renderSummaryStrip(monthRows, allMonthRows);
    renderKpiCards(monthRows, allMonthRows);
    renderInsight(monthRows, allMonthRows);
    renderCategoryChart(monthRows);
    renderCategoryPieChart(monthRows);
    renderCentroChart(monthRows);
    renderEssencialChart(monthRows);
    renderCashflowChart(allFiltered);
    renderGoalChart(allFiltered);
    renderFormaChart(monthRows);
    renderOpportunities(monthRows);
    renderCategoryTable(monthRows);
    renderTransactions(monthRows);
  }

  function init() {
    if (!DATA.length) {
      document.body.innerHTML =
        "<p style='padding:40px;color:#fff'>Dados não carregados. Execute: node scripts/export-data-exemplo.js</p>";
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
