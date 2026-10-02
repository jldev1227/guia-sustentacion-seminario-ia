/* Simulador del tablero + motor del guion.
   Lee los mismos CSV que consume Power BI (00_DATOS/limpio) y calcula las medidas
   con la misma lógica que el DAX de 06_DASHBOARD_GUIA_CONSTRUCCION.md. */
(function () {
  'use strict';

  // En el repo los CSV viven en el proyecto; en la versión publicada (github.io)
  // la Action los copia a guion/datos/. Se prueba la primera ruta que responda.
  const RUTAS = ['../../JulianLopez_Dashboard_Proyecto/00_DATOS/', 'datos/'];
  let RUTA = RUTAS[0];
  const C = { tinta: '#13302D', verde: '#2C6A4F', ocre: '#A85F22', suave: '#8FB5A6', alerta: '#A3382E' };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const D = {};          // datos
  const F = { desde: null, hasta: null, op: 'Todas', mes: null };   // filtros del tablero
  const UI = {
    stage: 'portada', pagina: 1, escena: 0, foco: null,
    pq: { consulta: 'Liquidaciones', paso: 2, avanzado: false },
    iqrTipo: null,
    corriendo: false, t0: 0, acum: 0, eT0: 0, eAcum: 0
  };
  let LAY = { movil: false, medio: false, report: 1000, sheet: 1100 };   // anchos reales del contenido
  let M0 = null;         // medidas globales, sin filtros: alimentan el guion
  let V = null;          // cifras del guion ya formateadas

  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');

  /* ─── Utilidades ─────────────────────────────────────── */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function nf(v, dec = 0) {
    if (v == null || isNaN(v)) return '(En blanco)';
    const s = Math.abs(v).toFixed(dec);
    let [i, d] = s.split('.');
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '−' : '') + i + (d ? ',' + d : '');
  }
  const fmtM = (v) => v == null ? '(En blanco)' : '$' + nf(v / 1e6, Math.abs(v) >= 1e8 ? 0 : 1) + ' M';
  const fmtMill = (v) => '$' + nf(v / 1e6, Math.abs(v) >= 1e8 ? 0 : 1) + ' millones';
  const fmtD = (v) => nf(v, 1);
  const fmtP = (v) => v == null ? '(En blanco)' : nf(v, 1) + '%';
  const mesCorto = (k) => MESES[+k.slice(5, 7) - 1] + ' ' + k.slice(2, 4);
  const mesLargo = (k) => MESES_LARGOS[+k.slice(5, 7) - 1] + ' de ' + k.slice(0, 4);
  const div = (a, b) => (b ? a / b : null);
  const pct = (a, b) => { const r = div(a, b); return r == null ? null : r * 100; };
  const sum = (a, k) => a.reduce((s, r) => s + (r[k] || 0), 0);
  function avg(a, k) {
    const v = a.map((r) => r[k]).filter((x) => x != null && !isNaN(x));
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  }
  function quantile(sorted, p) {            // interpolación lineal, como pandas
    const pos = (sorted.length - 1) * p, lo = Math.floor(pos), fr = pos - lo;
    return sorted[lo + 1] !== undefined ? sorted[lo] + fr * (sorted[lo + 1] - sorted[lo]) : sorted[lo];
  }
  function escala(v) {                       // máximo y paso redondos para el eje
    if (!(v > 0)) return { max: 1, step: 0.25 };
    const raw = v / 4, e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
    return { max: Math.ceil(v / step) * step, step };
  }
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (V[k] != null ? V[k] : '{' + k + '}'));

  /* ─── Carga de datos ─────────────────────────────────── */
  function parseCSV(t) {
    t = t.replace(/^\uFEFF/, '');
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  const toObj = (rows) => rows.slice(1).map((r) => Object.fromEntries(rows[0].map((k, i) => [k, r[i]])));
  const num = (x) => (x === '' || x == null ? null : +x);
  const bool = (x) => x === 'True';

  async function cargar() {
    const archivos = {
      liquidaciones: 'limpio/liquidaciones.csv',
      items: 'limpio/items.csv',
      tiempos: 'limpio/tiempos_proceso.csv',
      kpis: 'limpio/kpis_mensuales.csv',
      validaciones: 'limpio/validaciones.csv',
      raw: 'raw/liquidaciones_items.csv'
    };
    for (const r of RUTAS) {
      const ok = await fetch(r + archivos.validaciones, { method: 'HEAD' }).then((x) => x.ok).catch(() => false);
      if (ok) { RUTA = r; break; }
    }
    D.rows = {};
    await Promise.all(Object.entries(archivos).map(async ([k, f]) => {
      const r = await fetch(RUTA + f);
      if (!r.ok) throw new Error(f);
      D.rows[k] = parseCSV(await r.text()).filter((x) => x.length > 1);
    }));

    D.liq = toObj(D.rows.liquidaciones).map((r) => ({
      ...r, mesK: r.periodo.slice(0, 7),
      total: num(r.total), valor_servicios: num(r.valor_servicios), valor_recargos: num(r.valor_recargos),
      valor_transporte_adicional: num(r.valor_transporte_adicional), valor_pernoctes: num(r.valor_pernoctes),
      dias_a_facturacion: num(r.dias_a_facturacion), es_anulada: bool(r.es_anulada), es_facturada: bool(r.es_facturada)
    }));
    D.items = toObj(D.rows.items).map((r) => ({
      ...r, cantidad: num(r.cantidad), valor_unitario: num(r.valor_unitario), valor_final: num(r.valor_final),
      porcentaje_descuento: num(r.porcentaje_descuento), es_tercero: bool(r.es_tercero), es_anomalia: bool(r.es_anomalia)
    }));
    D.tiempos = toObj(D.rows.tiempos).map((r) => ({ ...r, dias_en_etapa: num(r.dias_en_etapa) }));
    D.valid = toObj(D.rows.validaciones);
    D.raw = toObj(D.rows.raw);
    D.meses = [...new Set(D.liq.map((r) => r.mesK))].sort();
    F.desde = D.meses[0]; F.hasta = D.meses[D.meses.length - 1];
  }

  /* ─── Medidas (equivalentes al DAX) ──────────────────── */
  function filtrar(f) {
    const L = D.liq.filter((r) => r.mesK >= f.desde && r.mesK <= f.hasta && (f.op === 'Todas' || r.operadora === f.op) && (!f.mes || r.mesK === f.mes));
    const set = new Set(L.map((r) => r.consecutivo));
    return { L, I: D.items.filter((r) => set.has(r.consecutivo)), T: D.tiempos.filter((r) => set.has(r.consecutivo)) };
  }

  function medidas(f) {
    const { L, I, T } = filtrar(f);
    const na = L.filter((r) => !r.es_anulada);
    const etapa = (t) => avg(T.filter((r) => r.transicion === t), 'dias_en_etapa');
    return {
      L, I, T, na,
      K01: sum(na, 'total'),
      K02: sum(L.filter((r) => r.es_facturada), 'total'),
      K03: avg(na, 'total'),
      K04: avg(na, 'dias_a_facturacion'),
      K05: etapa('LIQUIDADA -> APROBADA'),
      K06: pct(sum(na, 'valor_recargos'), sum(na, 'valor_servicios')),
      K07: pct(sum(na, 'valor_transporte_adicional'), sum(na, 'valor_servicios')),
      K10: pct(L.filter((r) => r.es_anulada).length, L.length),
      K11: avg(I, 'porcentaje_descuento'),
      K12: pct(sum(I.filter((r) => r.es_tercero), 'valor_final'), sum(I, 'valor_final')),
      etapa,
      nAnom: I.filter((r) => r.es_anomalia).length
    };
  }

  const MEDIDAS = {
    K01: { nombre: 'Valor liquidado', fmt: fmtM, dax: 'Valor liquidado =\nCALCULATE(SUM(Liquidaciones[total]), Liquidaciones[es_anulada] = FALSE)', lee: 'Suma el total de las liquidaciones, pero sin contar las anuladas.' },
    K02: { nombre: 'Valor facturado', fmt: fmtM, dax: 'Valor facturado =\nCALCULATE(SUM(Liquidaciones[total]), Liquidaciones[es_facturada] = TRUE)', lee: 'Suma el total solo de las liquidaciones que ya llegaron a factura.' },
    K03: { nombre: 'Ticket promedio', fmt: fmtM, dax: 'Ticket promedio =\nCALCULATE(AVERAGE(Liquidaciones[total]), Liquidaciones[es_anulada] = FALSE)', lee: 'Promedio del valor de una liquidación, sin anuladas.' },
    K04: { nombre: 'Días a facturación', fmt: fmtD, dax: 'Dias a facturacion =\nCALCULATE(AVERAGE(Liquidaciones[dias_a_facturacion]), Liquidaciones[es_anulada] = FALSE)', lee: 'Días promedio entre que la liquidación se elabora y se factura.' },
    K05: { nombre: 'Días en aprobación', fmt: fmtD, dax: 'Dias en aprobacion =\nCALCULATE(\n    AVERAGE(Tiempos[dias_en_etapa]),\n    Tiempos[transicion] = "LIQUIDADA -> APROBADA"\n)', lee: 'Días promedio que una liquidación espera la aprobación: el cuello de botella.' },
    K10: { nombre: 'Tasa de anulación', fmt: fmtP, dax: 'Tasa de anulacion =\nDIVIDE(\n    CALCULATE(COUNTROWS(Liquidaciones), Liquidaciones[es_anulada] = TRUE),\n    COUNTROWS(Liquidaciones)\n) * 100', lee: 'Anuladas sobre el total. DIVIDE evita el error de dividir por cero.' },
    K12: { nombre: 'Participación de terceros', fmt: fmtP, dax: 'Pct terceros =\nDIVIDE(\n    CALCULATE(SUM(Items[valor_final]), Items[es_tercero] = TRUE),\n    SUM(Items[valor_final])\n) * 100', lee: 'Qué parte del valor de los servicios la prestan vehículos de terceros.' }
  };

  function prepararGuion() {
    const f0 = { desde: D.meses[0], hasta: D.meses[D.meses.length - 1], op: 'Todas', mes: null };
    M0 = medidas(f0);
    const porMes = D.meses.map((k) => {
      const na = M0.na.filter((r) => r.mesK === k);
      return { k, liq: sum(na, 'total'), dias: avg(na, 'dias_a_facturacion') };
    });
    const top = porMes.reduce((a, b) => (b.liq > a.liq ? b : a));
    D.mesDrill = top.k;
    V = {
      raw: nf(D.raw.length), limpios: nf(D.items.length), nMeses: D.meses.length,
      valorLiq: fmtMill(M0.K01), ticket: fmtMill(M0.K03), diasFact: fmtD(M0.K04), diasAprob: fmtD(M0.K05),
      pctTerceros: fmtP(M0.K12), anom: nf(M0.nAnom), pctAnom: fmtP(pct(M0.nAnom, D.items.length)),
      mesDrill: mesLargo(top.k), mesesSobre: porMes.filter((m) => m.dias != null && m.dias > 15).length
    };
  }

  /* ─── Gráficos SVG ───────────────────────────────────── */
  const W0 = 600;
  const tipAttr = (s) => ` data-tip="${esc(s)}"`;
  const roundTop = (x, y, w, h, r) => { r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
  const roundRight = (x, y, w, h, r) => { r = Math.min(r, h / 2, w); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; };

  function ejesY(sc, W, ml, mt, ih, fmtAx) {
    let s = '';
    const max = sc.max, n = Math.round(sc.max / sc.step);
    for (let k = 0; k <= n; k++) {
      const v = sc.step * k, y = mt + ih - (v / max) * ih;
      s += `<line class="${k ? 'grid' : 'base'}" x1="${ml}" x2="${W - 10}" y1="${y}" y2="${y}"/>`;
      s += `<text class="ax" x="${ml - 6}" y="${y + 3.5}" text-anchor="end">${esc(fmtAx(v))}</text>`;
    }
    return s;
  }

  function lineChart(o) {
    const W = o.w || W0, H = o.h || 220, ml = 50, mr = 14, mt = 14, mb = 26, iw = W - ml - mr, ih = H - mt - mb;
    const vals = o.series.flatMap((s) => s.values).filter((v) => v != null);
    if (o.ref) vals.push(o.ref.v);
    const sc = escala(Math.max(0, ...vals) * 1.05), max = sc.max;
    const n = o.x.length, xs = (i) => ml + (n === 1 ? iw / 2 : (i * iw) / (n - 1)), ys = (v) => mt + ih - (v / max) * ih;
    let s = ejesY(sc, W, ml, mt, ih, o.fmtAx);
    const step = Math.ceil(n / Math.max(3, Math.floor(W / 75)));
    o.x.forEach((k, i) => { if (i % step === 0 || i === n - 1) s += `<text class="ax" x="${xs(i)}" y="${H - 8}" text-anchor="middle">${esc(mesCorto(k))}</text>`; });
    if (o.ref) {
      const y = ys(o.ref.v);
      s += `<line x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}" stroke="${C.alerta}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
      s += `<text class="ax" x="${W - mr}" y="${y - 5}" text-anchor="end" style="fill:${C.alerta}">${esc(o.ref.label)}</text>`;
    }
    o.series.forEach((se) => {
      let d = '', pen = false;
      se.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + xs(i).toFixed(1) + ',' + ys(v).toFixed(1); pen = true; });
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (n === 1 && se.values[0] != null) s += `<circle cx="${xs(0)}" cy="${ys(se.values[0])}" r="4" fill="${se.color}"/>`;
    });
    o.x.forEach((k, i) => {
      const x0 = n === 1 ? ml : i === 0 ? ml : (xs(i - 1) + xs(i)) / 2, x1 = n === 1 ? W - mr : i === n - 1 ? W - mr : (xs(i) + xs(i + 1)) / 2;
      const tip = mesLargo(k) + '\n' + o.series.map((se) => se.name + ': ' + o.fmt(se.values[i])).join('\n') + (o.drill ? '\nClic: obtener detalles' : '');
      s += `<rect class="hit${o.drill ? ' click' : ''}" x="${x0}" y="${mt}" width="${Math.max(1, x1 - x0)}" height="${ih}"${tipAttr(tip)}${o.drill ? ` data-act="drill" data-v="${k}"` : ''}/>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${s}</svg>`;
  }

  function barH(o) {
    const W = o.w || W0, rowH = o.rowH || 20, ml = Math.min(o.ml || 120, Math.round(W * 0.4)), mr = 64, iw = W - ml - mr, H = o.items.length * rowH + 6;
    const max = Math.max(...o.items.map((d) => d.value || 0), 0) || 1;
    let s = '';
    o.items.forEach((d, i) => {
      const y = 3 + i * rowH, w = Math.max(0, ((d.value || 0) / max) * iw), bh = rowH - 6;
      const maxCh = Math.floor((ml - 8) / 5.6), lab = d.label.length > maxCh ? d.label.slice(0, maxCh - 1) + '…' : d.label;
      s += `<text class="ax" x="${ml - 6}" y="${y + bh / 2 + 3.5}" text-anchor="end">${esc(lab)}</text>`;
      if (w > 0) s += `<path d="${roundRight(ml, y, w, bh, 3)}" fill="${d.color || C.verde}"/>`;
      s += `<text class="lbl" x="${ml + w + 5}" y="${y + bh / 2 + 3.5}">${esc(o.fmt(d.value))}</text>`;
      s += `<rect class="hit" x="0" y="${y - 2}" width="${W}" height="${rowH}"${tipAttr(d.label + '\n' + (o.name || 'Valor') + ': ' + o.fmt(d.value))}/>`;
    });
    s += `<line class="base" x1="${ml}" x2="${ml}" y1="0" y2="${H}"/>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
  }

  function cols(o) {
    const W = o.w || W0, H = o.h || 200, ml = 50, mr = 10, mt = 18, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
    const sc = escala(Math.max(0, ...o.items.map((d) => d.value || 0)) * 1.1), max = sc.max;
    const n = o.items.length, band = iw / n, bw = Math.min(band * 0.62, 70);
    let s = ejesY(sc, W, ml, mt, ih, o.fmtAx);
    o.items.forEach((d, i) => {
      const x = ml + i * band + (band - bw) / 2, h = ((d.value || 0) / max) * ih, y = mt + ih - h;
      if (h > 0) s += `<path d="${roundTop(x, y, bw, h, 3)}" fill="${d.color || C.verde}"/>`;
      s += `<text class="lbl" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle">${esc(o.fmt(d.value))}</text>`;
      s += `<text class="ax" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
      s += `<rect class="hit" x="${ml + i * band}" y="${mt}" width="${band}" height="${ih}"${tipAttr(d.label + '\n' + (o.name || 'Valor') + ': ' + o.fmt(d.value))}/>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
  }

  // Columnas apiladas por mes; pct = true las lleva a 100%
  function stacked(o) {
    const W = o.w || W0, H = o.h || 210, ml = 50, mr = 10, mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
    const tot = o.x.map((_, i) => o.series.reduce((a, se) => a + (se.values[i] || 0), 0));
    const sc = o.pct ? { max: 100, step: 25 } : escala(Math.max(0, ...tot) * 1.05), max = sc.max;
    const n = o.x.length, band = iw / n, bw = Math.max(2, Math.min(band - 2, 40));
    let s = ejesY(sc, W, ml, mt, ih, o.pct ? (v) => nf(v) + '%' : o.fmtAx);
    const step = Math.ceil(n / Math.max(3, Math.floor(W / 75)));
    o.x.forEach((k, i) => {
      let acc = 0;
      const x = ml + i * band + (band - bw) / 2;
      const partes = [];
      o.series.forEach((se) => {
        const raw = se.values[i] || 0, v = o.pct ? (tot[i] ? (raw / tot[i]) * 100 : 0) : raw;
        const h = (v / max) * ih, y = mt + ih - ((acc + v) / max) * ih;
        if (h > 0) s += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(0, h - 1)}" fill="${se.color}"/>`;
        acc += v;
        partes.push(se.name + ': ' + (o.pct ? nf(v, 1) + '%' : o.fmt(raw)));
      });
      if (i % step === 0 || i === n - 1) s += `<text class="ax" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(mesCorto(k))}</text>`;
      s += `<rect class="hit" x="${ml + i * band}" y="${mt}" width="${band}" height="${ih}"${tipAttr(mesLargo(k) + '\n' + partes.join('\n'))}/>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
  }

  function grouped(o) {
    const W = o.w || W0, H = o.h || 210, ml = 50, mr = 10, mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
    const sc = escala(Math.max(0, ...o.series.flatMap((se) => se.values.filter((v) => v != null))) * 1.05), max = sc.max;
    const n = o.x.length, band = iw / n, g = o.series.length, bw = Math.min((band - 6) / g, 18);
    let s = ejesY(sc, W, ml, mt, ih, o.fmtAx);
    o.x.forEach((lab, i) => {
      const x0 = ml + i * band + (band - bw * g - (g - 1) * 2) / 2;
      o.series.forEach((se, j) => {
        const v = se.values[i];
        if (v == null || v <= 0) return;
        const h = (v / max) * ih;
        s += `<path d="${roundTop(x0 + j * (bw + 2), mt + ih - h, bw, h, 2)}" fill="${se.color}"/>`;
      });
      s += `<text class="ax" x="${ml + i * band + band / 2}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
      const tip = lab + '\n' + o.series.map((se) => se.name + ': ' + (se.values[i] == null ? 'sin datos' : o.fmt(se.values[i]))).join('\n');
      s += `<rect class="hit" x="${ml + i * band}" y="${mt}" width="${band}" height="${ih}"${tipAttr(tip)}/>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
  }

  const legend = (series, line) => `<div class="legend">${series.map((s) => `<span><i class="${line ? 'line' : ''}" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  const axM = (v) => '$' + nf(v / 1e6) + ' M';

  /* ─── Escenario: portada ─────────────────────────────── */
  function vPortada() {
    const qs = [
      ['¿Cuánto se liquida y cuánto se factura por operadora y por mes?', 'Página 1'],
      ['¿Cuánto tarda una liquidación en facturarse, y dónde se estanca?', 'Página 3'],
      ['¿De qué se compone el ingreso: base, recargos, transporte adicional, pernoctes?', 'Página 1'],
      ['¿Qué vehículos y recorridos concentran la facturación?', 'Página 2'],
      ['¿Cuánto valor se pierde en anulaciones, y por qué motivo?', 'Página 3'],
      ['¿Qué participación tienen los terceros frente a la flota propia?', 'Página 2']
    ];
    const ops = new Set(D.liq.map((r) => r.operadora)).size, veh = new Set(D.items.map((r) => r.placa)).size;
    return `<div class="sheet">
      <div id="portada-titulo">
        <p class="eyebrow">Opción de grado · Seminario de Inteligencia Artificial 2026-2</p>
        <h1>De liquidaciones a decisiones visibles</h1>
        <p class="lede">Un tablero de control sobre la liquidación de servicios de transporte especial de personal: del dato crudo al indicador que cambia una decisión.</p>
        <span class="badge">Datos sintéticos calibrados · declarados desde los requisitos</span>
      </div>
      <div class="tiles">
        <div><span class="fig">${D.meses.length}</span><span class="cap">Meses</span></div>
        <div><span class="fig">${nf(D.liq.length)}</span><span class="cap">Liquidaciones</span></div>
        <div><span class="fig">${nf(D.items.length)}</span><span class="cap">Servicios</span></div>
        <div><span class="fig">${ops}</span><span class="cap">Operadoras</span></div>
        <div><span class="fig">${veh}</span><span class="cap">Vehículos</span></div>
      </div>
      <div id="portada-preguntas">
        <h3>Las seis preguntas de negocio</h3>
        <ol class="qlist">${qs.map((q, i) => `<li><span class="n">0${i + 1}</span><span>${esc(q[0])} <span class="badge ok" style="margin-left:6px">${q[1]}</span></span></li>`).join('')}</ol>
      </div>
    </div>`;
  }

  /* ─── Escenario: pipeline ────────────────────────────── */
  function limpiarPlaca(p) { return p.trim().toUpperCase().replace(/[\s_]+/g, '-').replace(/^([A-Z]+)(\d)/, '$1-$2'); }
  function limpiarTarifa(t) { return t.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.'); }
  function limpiarFecha(f) { const m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : f; }

  function ejemplosSucios() {
    const out = [];
    const toma = (pred, campo, regla, fn, n) => {
      D.raw.filter(pred).slice(0, n).forEach((r) => out.push({ consecutivo: r.consecutivo, campo, crudo: r[campo], regla, limpio: fn(r[campo]) }));
    };
    toma((r) => !/^VEH-\d{3}$/.test(r.placa) && r.placa, 'placa', 'Mayúsculas y guion', limpiarPlaca, 2);
    toma((r) => r.valor_unitario.includes('$'), 'valor_unitario', 'Texto con $ → número', limpiarTarifa, 2);
    toma((r) => /\//.test(r.fecha_inicial), 'fecha_inicial', 'dd/mm/aaaa → aaaa-mm-dd', limpiarFecha, 2);
    return out;
  }

  function iqrData(tipo) {
    const vals = D.items.filter((r) => r.tipo_servicio === tipo).map((r) => r.valor_unitario).filter((v) => v != null).sort((a, b) => a - b);
    const q1 = quantile(vals, 0.25), q2 = quantile(vals, 0.5), q3 = quantile(vals, 0.75), ric = q3 - q1;
    const lo = q1 - 1.5 * ric, hi = q3 + 1.5 * ric;
    return { vals, q1, q2, q3, ric, lo, hi, fuera: vals.filter((v) => v < lo || v > hi).length };
  }

  function iqrChart(tipo, ancho) {
    const W = Math.round(ancho || 560), d = iqrData(tipo), H = 170, ml = 24, mr = 24, iw = W - ml - mr;
    // El eje se recorta alrededor de los límites; lo que queda más allá se dibuja pegado al borde
    const pad = 0.45 * (d.hi - d.lo || 1);
    const min = Math.max(d.vals[0], d.lo - pad), max = Math.min(d.vals[d.vals.length - 1], d.hi + pad);
    const xs = (v) => ml + ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * iw;
    let s = '';
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    let izq = 0, der = 0;
    d.vals.forEach((v) => {
      const out = v < d.lo || v > d.hi;
      if (v < min) izq++;
      if (v > max) der++;
      s += `<circle cx="${xs(v).toFixed(1)}" cy="${(40 + rnd() * 60).toFixed(1)}" r="${out ? 3.5 : 2}" fill="${out ? C.alerta : C.verde}" fill-opacity="${out ? 0.9 : 0.25}"/>`;
    });
    if (der) s += `<text class="ax" x="${W - mr}" y="120" text-anchor="end" style="fill:${C.alerta}">${der} más allá →</text>`;
    if (izq) s += `<text class="ax" x="${ml}" y="120" style="fill:${C.alerta}">← ${izq} más allá</text>`;
    s += `<rect x="${xs(d.q1)}" y="32" width="${xs(d.q3) - xs(d.q1)}" height="76" fill="none" stroke="${C.tinta}" stroke-width="1.5" rx="2"/>`;
    s += `<line x1="${xs(d.q2)}" x2="${xs(d.q2)}" y1="32" y2="108" stroke="${C.tinta}" stroke-width="1.5"/>`;
    [[d.lo, 'Q1 − 1,5 × RIC'], [d.hi, 'Q3 + 1,5 × RIC']].forEach(([v, t]) => {
      s += `<line x1="${xs(v)}" x2="${xs(v)}" y1="18" y2="120" stroke="${C.ocre}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      s += `<text class="ax" x="${xs(v)}" y="13" text-anchor="middle" style="fill:${C.ocre}">${t}</text>`;
      s += `<text class="lbl" x="${xs(v)}" y="134" text-anchor="middle">$${nf(v)}</text>`;
    });
    s += `<text class="ax" x="${(xs(d.q1) + xs(d.q3)) / 2}" y="150" text-anchor="middle">Mitad central de las tarifas (Q1 a Q3)</text>`;
    s += `<rect class="hit" x="${xs(d.q1)}" y="32" width="${xs(d.q3) - xs(d.q1)}" height="76"${tipAttr(`Tarifa ${tipo}\nQ1: $${nf(d.q1)}\nMediana: $${nf(d.q2)}\nQ3: $${nf(d.q3)}\nRIC: $${nf(d.ric)}`)}/>`;
    return { svg: `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribución de tarifas con límites del rango intercuartílico">${s}</svg>`, d };
  }

  function anchoIQR(enPop) {
    if (enPop) return Math.min(720, innerWidth - 20) - (innerWidth <= 720 ? 32 : 44);
    const dos = LAY.sheet >= 2 * 340 + 22;
    return Math.max(260, Math.min(620, (dos ? (LAY.sheet - 22) / 2 : LAY.sheet) - (LAY.movil ? 30 : 42)));
  }

  function bloqueIQR(enPop) {
    const tipos = [...new Set(D.items.map((r) => r.tipo_servicio))].sort();
    if (!UI.iqrTipo) UI.iqrTipo = tipos.reduce((a, b) => (iqrData(b).fuera > iqrData(a).fuera ? b : a));
    const { svg, d } = iqrChart(UI.iqrTipo, anchoIQR(enPop));
    return `<div class="dax-row" style="margin-bottom:6px"><b>Tarifa unitaria por servicio</b>
        <span style="font-size:13px;font-family:var(--ui);font-weight:400"><select data-ch="iqr" style="font:inherit">${tipos.map((t) => `<option ${t === UI.iqrTipo ? 'selected' : ''}>${t}</option>`).join('')}</select></span></div>
      ${svg}
      <p class="note">Tipo <b>${esc(UI.iqrTipo)}</b>: ${nf(d.vals.length)} servicios, <b style="color:${C.alerta}">${nf(d.fuera)} fuera de los límites</b> por tarifa. Lo mismo se repite para la cantidad. En total, ${nf(M0.nAnom)} servicios marcados.</p>`;
  }

  function vPipeline() {
    const ej = ejemplosSucios();
    const dup = 66, hu = 22, raw = D.raw.length, fin = D.items.length;
    return `<div class="sheet">
      <p class="eyebrow">Entregable 4 · 04_PIPELINE.py</p>
      <h2>De sucio a limpio</h2>
      <p class="lede">Extraer → transformar → validar → cargar. Power BI solo recibe lo que pasó por aquí.</p>

      <div class="box" id="sucio">
        <h3>Así llegan los datos <span class="badge warn" style="margin-left:6px">raw/liquidaciones_items.csv</span></h3>
        <div class="scroll-x"><table class="t">
          <thead><tr><th>Liquidación</th><th>Campo</th><th>Valor crudo</th><th>Regla</th><th>Valor limpio</th></tr></thead>
          <tbody>${ej.map((e) => `<tr><td>${esc(e.consecutivo)}</td><td><code>${esc(e.campo)}</code></td><td><span class="sucio">${esc(e.crudo)}</span></td><td class="regla">${esc(e.regla)}</td><td><span class="limpio">${esc(e.limpio)}</span></td></tr>`).join('')}</tbody>
        </table></div>
        <p class="note">Además: la operadora escrita de ocho formas distintas en la cabecera, registros duplicados y servicios que apuntan a liquidaciones inexistentes.</p>
      </div>

      <div class="box" id="embudo" style="margin-top:22px">
        <h3>Lo que entra y lo que sale</h3>
        <div class="funnel">
          <div><span class="fig">${nf(raw)}</span><span class="cap">líneas crudas</span></div>
          <div><span class="fig menos">−${dup}</span><span class="cap">duplicados eliminados</span></div>
          <div><span class="fig menos">−${hu}</span><span class="cap">huérfanos sin liquidación</span></div>
          <div><span class="fig fin">${nf(fin)}</span><span class="cap">servicios limpios</span></div>
        </div>
        ${raw - dup - hu !== fin ? `<p class="note" style="color:${C.alerta}">Ojo: ${nf(raw)} − ${dup} − ${hu} no da ${nf(fin)}. Revisa el pipeline.</p>` : '<p class="note">Cada descarte queda registrado en la bitácora de ejecución.</p>'}
      </div>

      <div class="grid2">
        <div class="box" id="validaciones">
          <h3>Las nueve validaciones</h3>
          <ul class="checks">${D.valid.map((v) => `<li><span>${esc(v.validacion)}${v.detalle ? `<small>${esc(v.detalle)}</small>` : ''}</span><span class="badge ${v.resultado === 'OK' ? 'ok' : 'warn'}">${esc(v.resultado)}</span></li>`).join('')}</ul>
          <p class="note">El aviso es el descuadre inyectado a propósito: prueba que el control funciona.</p>
        </div>
        <div class="box" id="iqr">
          <h3>Cómo se marca un atípico</h3>
          ${bloqueIQR()}
        </div>
      </div>
    </div>`;
  }

  /* ─── Escenario: Power Query ─────────────────────────── */
  const PQ_CONSULTAS = { Liquidaciones: ['liquidaciones', 'liquidaciones.csv'], Items: ['items', 'items.csv'], Tiempos: ['tiempos', 'tiempos_proceso.csv'], KPIs: ['kpis', 'kpis_mensuales.csv'] };
  const PQ_PASOS = ['Origen', 'Encabezados promovidos', 'Tipo cambiado'];
  const PQ_ENTEROS = new Set(['mes', 'anio', 'n_liquidaciones', 'n_anuladas', 'n_items', 'n_anomalias', 'porcentaje_iva']);

  function tipoCol(name, idx, rows) {
    if (name === 'periodo' || name.startsWith('fecha')) return 'date';
    if (name.startsWith('es_') || name === 'tiene_planilla') return 'bool';
    if (PQ_ENTEROS.has(name)) return 'int';
    const vals = rows.slice(1).map((r) => r[idx]).filter((v) => v !== '');
    return vals.length && vals.every((v) => !isNaN(+v)) ? 'num' : 'text';
  }
  const TIPO_UI = { text: ['ABC', ''], num: ['1.2', 'num'], int: ['123', 'num'], date: ['📅', 'date'], bool: ['✓✗', 'bool'] };
  const TIPO_M = { text: 'type text', num: 'type number', int: 'Int64.Type', date: 'type date', bool: 'type logical' };

  function pqValor(v, t) {
    if (v === '' && t !== 'text') return ['null', 'null'];
    if (t === 'date') { const [y, m, d] = v.slice(0, 10).split('-'); return [`${d}/${m}/${y}`, 'r']; }
    if (t === 'bool') return [v === 'True' ? 'TRUE' : 'FALSE', ''];
    if (t === 'num' || t === 'int') return [String(+v).replace('.', ','), 'r'];
    return [v, ''];
  }

  function pqCodigo(consulta, paso, completo) {
    const [key, archivo] = PQ_CONSULTAS[consulta];
    const rows = D.rows[key], h = rows[0];
    const tipos = h.map((n, i) => `{"${n}", ${TIPO_M[tipoCol(n, i, rows)]}}`);
    const lineas = [
      `Origen = Csv.Document(File.Contents(RutaDatos & "\\${archivo}"), [Delimiter=",", Columns=${h.length}, Encoding=65001, QuoteStyle=QuoteStyle.None])`,
      `#"Encabezados promovidos" = Table.PromoteHeaders(Origen, [PromoteAllScalars=true])`,
      `#"Tipo cambiado" = Table.TransformColumnTypes(#"Encabezados promovidos",{${completo ? '\n        ' + tipos.join(',\n        ') + '\n    ' : tipos.slice(0, 3).join(', ') + ', …'}})`
    ];
    if (completo) return `let\n    ${lineas.join(',\n    ')}\nin\n    #"Tipo cambiado"`;
    return '= ' + lineas[paso].replace(/^[^=]+= /, '');
  }

  const resaltarM = (s) => esc(s).replace(/(&quot;[^&]*?&quot;)/g, '<span class="s">$1</span>').replace(/\b(let|in|type|each)\b/g, '<span class="k">$1</span>');

  const PQ_EXPLICA = [
    'Lee el archivo tal cual. Todavía no sabe que la primera fila son los nombres de las columnas: por eso aparecen como Column1, Column2… y todo es texto (ABC). Fíjate en <b>RutaDatos</b> dentro de la fórmula: la carpeta sale del parámetro.',
    'Usa la primera fila como encabezados. Ya hay nombres, pero todo sigue siendo texto: Power BI no podría sumar «22989667.14» todavía.',
    'Asigna el tipo de cada columna: fechas, números y verdadero/falso. Ahora sí se puede sumar, promediar y filtrar por fecha. Este es el último paso: es lo que se carga al modelo.'
  ];

  function vPQ() {
    const p = UI.pq;
    const qBtn = (n, param) => `<button class="${p.consulta === n ? 'on' : ''}" data-act="pq-q" data-v="${n}"><span class="ico${param ? ' param' : ''}"></span>${n}${param ? ' <small style="color:#8A8886">(param.)</small>' : ''}</button>`;
    let centro = '', pasos = '', status = '';
    if (p.consulta === 'RutaDatos') {
      centro = `<div class="pq-param">
        <h3 style="font-family:var(--report);font-size:15px;margin:0 0 4px">Administrar parámetros</h3>
        <label>Nombre</label><div class="field">RutaDatos</div>
        <label>Tipo</label><div class="field">Texto</div>
        <label>Valor actual</label><div class="field">C:\\Users\\&lt;usuario&gt;\\opcion-grado-seminario-ia\\JulianLopez_Dashboard_Proyecto\\00_DATOS\\limpio</div>
        <div class="pq-explica" style="margin:16px 0 0">Las cuatro consultas leen su archivo desde aquí. Si el evaluador abre el .pbix en otro computador, cambia <b>este único valor</b> y todo vuelve a cargar.</div>
      </div>`;
      status = '<span>Parámetro de texto</span><span></span>';
    } else {
      const [key] = PQ_CONSULTAS[p.consulta];
      const rows = D.rows[key], h = rows[0];
      const tipos = h.map((n, i) => tipoCol(n, i, rows));
      if (p.avanzado) {
        centro = `<div class="pq-adv">${resaltarM(pqCodigo(p.consulta, 2, true))}</div>`;
      } else {
        const muestra = p.paso === 0 ? rows.slice(0, 15) : rows.slice(1, 16);
        const nombres = p.paso === 0 ? h.map((_, i) => 'Column' + (i + 1)) : h;
        const head = nombres.map((n, i) => {
          const t = p.paso === 2 ? tipos[i] : 'text';
          let q = '';
          if (p.paso === 2) {
            const llenos = rows.slice(1).filter((r) => r[i] !== '').length, pv = Math.round((llenos / (rows.length - 1)) * 100);
            q = `<div class="pq-quality"><i class="v" style="width:${pv}%"></i><i class="e" style="width:${100 - pv}%"></i></div><div class="pq-qlabel">Válido ${pv}%${pv < 100 ? ` · Vacío ${100 - pv}%` : ''}</div>`;
          }
          return `<th><span class="pq-type ${TIPO_UI[t][1]}">${TIPO_UI[t][0]}</span>${esc(n)}${q}</th>`;
        }).join('');
        const body = muestra.map((r, j) => `<tr><td class="rn">${j + 1}</td>${r.map((v, i) => {
          const [txt, cls] = p.paso === 2 ? pqValor(v, tipos[i]) : [v, ''];
          return `<td class="${cls}">${esc(txt)}</td>`;
        }).join('')}</tr>`).join('');
        centro = `<div class="pq-formula"><span class="fx">fx</span><span class="code">${resaltarM(pqCodigo(p.consulta, p.paso))}</span></div>
          <div class="pq-grid-wrap"><table class="pq-grid"><thead><tr><th class="rn"></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      }
      pasos = `<h4>Pasos aplicados</h4><ol id="pq-pasos">${PQ_PASOS.map((s, i) => `<li><button class="${!p.avanzado && p.paso === i ? 'on' : ''}" data-act="pq-paso" data-v="${i}">${s}</button></li>`).join('')}</ol>
        <div class="pq-explica">${p.avanzado ? 'El <b>Editor avanzado</b> muestra la consulta completa en lenguaje M: los tres pasos encadenados. Es la receta que se repite al pulsar Actualizar.' : PQ_EXPLICA[p.paso]}</div>`;
      status = `<span>${h.length} COLUMNAS, ${nf(rows.length - 1)} FILAS</span><span>Vista previa: primeras 15 filas</span>`;
    }
    return `<div class="pq">
      <div class="pq-title"><span>Editor de Power Query · 06_DASHBOARD</span><span>Simulación</span></div>
      <div class="pq-ribbon">
        <button>Cerrar y aplicar</button><span class="sep"></span>
        <button>Actualizar vista previa</button>
        <button class="${p.consulta === 'RutaDatos' ? 'on' : ''}" data-act="pq-q" data-v="RutaDatos">Administrar parámetros</button>
        <button class="${p.avanzado ? 'on' : ''}" data-act="pq-adv">Editor avanzado</button>
      </div>
      <div class="pq-main">
        <div class="pq-queries">
          <h4>Parámetros</h4>${qBtn('RutaDatos', true)}
          <h4 style="margin-top:14px">Consultas [4]</h4>${Object.keys(PQ_CONSULTAS).map((n) => qBtn(n)).join('')}
        </div>
        <div class="pq-center">${centro}</div>
        <div class="pq-steps">
          <h4>Propiedades</h4>
          <div class="pq-props"><label>Nombre</label><div>${esc(p.consulta)}</div></div>
          ${pasos}
        </div>
      </div>
      <div class="pq-status">${status}</div>
    </div>`;
  }

  /* ─── Escenario: modelo ──────────────────────────────── */
  function vModelo() {
    const n = { L: D.liq.length, I: D.items.length, T: D.tiempos.length, K: D.rows.kpis.length - 1 };
    const caja = (x, y, nombre, filas, campos, w = 180) => {
      const h = 38 + campos.length * 21;
      return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#fff" stroke="${C.suave}"/>
        <path d="${roundTop(x, y, w, 30, 4)}" fill="${C.tinta}"/>
        <text x="${x + 10}" y="${y + 20}" fill="#fff" font-size="14" font-weight="600">${nombre}</text>
        <text x="${x + w - 10}" y="${y + 20}" fill="#9AADA9" font-size="12" text-anchor="end">${filas}</text>
        ${campos.map((c, i) => `<text x="${x + 10}" y="${y + 50 + i * 21}" font-size="13" fill="${c[1] ? C.ocre : '#444'}" ${c[1] ? 'font-weight="600"' : ''}>${c[0]}</text>`).join('')}</g>`;
    };
    const rel = (x1, y1, x2, y2) => {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.ocre}" stroke-width="1.5"/>
        <path d="M-5,-4 L4,0 L-5,4 Z" fill="${C.ocre}" transform="translate(${mx},${my}) rotate(${ang})"/>
        <text x="${x1 + (x2 - x1) * 0.12}" y="${y1 + (y2 - y1) * 0.12 - 6}" font-size="12" font-weight="600" fill="${C.tinta}">1</text>
        <text x="${x1 + (x2 - x1) * 0.88}" y="${y1 + (y2 - y1) * 0.88 - 6}" font-size="13" font-weight="600" fill="${C.tinta}">*</text>`;
    };
    const vertical = LAY.sheet < 640;
    const svg = vertical ? `<svg class="modelo-svg vertical chart" viewBox="0 0 380 590" role="img" aria-label="Diagrama del modelo: cinco tablas y cuatro relaciones">
      ${rel(85, 132, 150, 196)}${rel(160, 70, 220, 70)}${rel(160, 360, 85, 436)}${rel(220, 360, 295, 436)}
      ${caja(10, 10, 'Calendario', nf(730), [['Date', 1], ['Año'], ['Mes'], ['AñoMes']], 150)}
      ${caja(220, 20, 'KPIs', nf(n.K), [['periodo', 1], ['operadora'], ['valor_liquidado']], 150)}
      ${caja(115, 196, 'Liquidaciones', nf(n.L), [['consecutivo', 1], ['periodo', 1], ['operadora'], ['total'], ['estado'], ['es_anulada']], 150)}
      ${caja(10, 436, 'Items', nf(n.I), [['consecutivo', 1], ['placa'], ['recorrido'], ['valor_final'], ['es_anomalia']], 150)}
      ${caja(220, 436, 'Tiempos', nf(n.T), [['consecutivo', 1], ['transicion'], ['dias_en_etapa']], 150)}
    </svg>` : `<svg class="modelo-svg chart" viewBox="0 0 720 440" role="img" aria-label="Diagrama del modelo: cinco tablas y cuatro relaciones">
      ${rel(190, 215, 255, 110)}${rel(190, 240, 255, 375)}${rel(435, 80, 530, 62)}${rel(435, 130, 530, 305)}
      ${caja(10, 170, 'Calendario', nf(730), [['Date', 1], ['Año'], ['Mes'], ['AñoMes']])}
      ${caja(255, 26, 'Liquidaciones', nf(n.L), [['consecutivo', 1], ['periodo', 1], ['operadora'], ['total'], ['estado'], ['es_anulada']])}
      ${caja(530, 6, 'Items', nf(n.I), [['consecutivo', 1], ['placa'], ['recorrido'], ['valor_final'], ['es_anomalia']])}
      ${caja(530, 268, 'Tiempos', nf(n.T), [['consecutivo', 1], ['transicion'], ['dias_en_etapa']])}
      ${caja(255, 318, 'KPIs', nf(n.K), [['periodo', 1], ['operadora'], ['valor_liquidado']])}
    </svg>`;
    const med = ['K01', 'K05', 'K12'].map((k) => `<div style="margin-bottom:14px"><div class="dax-row"><b>${MEDIDAS[k].nombre}</b><span>${MEDIDAS[k].fmt(M0[k])}</span></div><div class="dax">${esc(MEDIDAS[k].dax)}</div><p class="note" style="margin:0">${esc(MEDIDAS[k].lee)}</p></div>`).join('');
    return `<div class="sheet">
      <p class="eyebrow">Entregable 6 · Vista de modelo</p>
      <h2>Cinco tablas, cuatro relaciones, doce medidas</h2>
      <p class="lede">La liquidación es la cabecera. Sus servicios y sus cambios de estado cuelgan de ella por <code>consecutivo</code>. Las flechas muestran hacia dónde viaja el filtro: de la tabla del «1» a la del «*».</p>
      <div class="grid2" style="grid-template-columns:minmax(0,1.5fr) minmax(280px,1fr);align-items:start">
        <div class="box" id="modelo-diagrama">${svg}</div>
        <div class="box alt" id="modelo-medidas"><h3>Tres medidas para explicar</h3>${med}</div>
      </div>
    </div>`;
  }

  /* ─── Escenario: tablero ─────────────────────────────── */
  const PAGINAS = { 1: 'Visión ejecutiva', 2: 'Detalle operacional', 3: 'Tiempos y comparativos' };

  function slicers() {
    const opt = (sel) => D.meses.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${mesCorto(k)}</option>`).join('');
    return `<div class="slicers">
      <div class="slicer"><label>Desde</label><select data-ch="desde">${opt(F.desde)}</select></div>
      <div class="slicer"><label>Hasta</label><select data-ch="hasta">${opt(F.hasta)}</select></div>
      <div class="slicer"><label>Operadora</label><div class="seg">${['Todas', 'OPR-A', 'OPR-B'].map((o) => `<button class="${F.op === o ? 'on' : ''}" data-act="op" data-v="${o}">${o}</button>`).join('')}</div></div>
    </div>`;
  }

  const card = (k, val, label, extra = '') => `<div class="card ${extra}"><span class="v">${val}</span><span class="l">${label}</span>${k ? `<button class="fxb" data-act="fx" data-v="${k}" title="Ver la medida DAX">fx</button>` : ''}</div>`;
  const visual = (titulo, cuerpo, opts = {}) => `<div class="visual ${opts.cls || ''}" ${opts.id ? `id="${opts.id}"` : ''}><p class="v-title">${titulo}${opts.k ? `<small>${opts.k}</small>` : ''}</p>${opts.sub ? `<p class="v-sub">${opts.sub}</p>` : ''}${cuerpo}</div>`;

  function mesesEn(M) { return D.meses.filter((k) => k >= F.desde && k <= F.hasta && (!F.mes || UI.pagina !== 2 || k === F.mes)); }

  function pagina1(M) {
    const ms = mesesEn(M);
    const porMes = (fn) => ms.map((k) => fn(M.L.filter((r) => r.mesK === k)));
    const liq = porMes((a) => sum(a.filter((r) => !r.es_anulada), 'total'));
    const fac = porMes((a) => sum(a.filter((r) => r.es_facturada), 'total'));
    const sLin = [{ name: 'Valor liquidado', color: C.verde, values: liq }, { name: 'Valor facturado', color: C.ocre, values: fac }];
    const comp = [
      { name: 'Servicio base', color: C.verde, values: porMes((a) => sum(a, 'valor_servicios')) },
      { name: 'Recargos', color: C.ocre, values: porMes((a) => sum(a, 'valor_recargos')) },
      { name: 'Transporte adicional', color: C.suave, values: porMes((a) => sum(a, 'valor_transporte_adicional')) },
      { name: 'Pernoctes', color: C.tinta, values: porMes((a) => sum(a, 'valor_pernoctes')) }
    ];
    const opColor = { 'OPR-A': C.verde, 'OPR-B': C.ocre };
    const ops = ['OPR-A', 'OPR-B'].filter((o) => F.op === 'Todas' || F.op === o).map((o) => ({ label: o, color: opColor[o], value: sum(M.na.filter((r) => r.operadora === o), 'total') }));
    const estados = ['BORRADOR', 'LIQUIDADA', 'APROBADA', 'FACTURADA', 'ANULADA'].map((e) => ({ label: e.charAt(0) + e.slice(1).toLowerCase(), color: e === 'ANULADA' ? C.alerta : C.verde, value: M.L.filter((r) => r.estado === e).length }));
    return `<div class="cards" id="p1-tarjetas">
        ${card('K01', fmtM(M.K01), 'Valor liquidado')}${card('K02', fmtM(M.K02), 'Valor facturado')}${card('K03', fmtM(M.K03), 'Ticket promedio')}${card('K04', fmtD(M.K04), 'Días a factura')}${card('K10', fmtP(M.K10), 'Tasa de anulación')}
      </div>
      <div class="vgrid p1">
        ${visual('Evolución mensual', legend(sLin, true) + lineChart({ w: anchoV(2 / 3), x: ms, series: sLin, fmt: fmtM, fmtAx: axM, drill: true, aria: 'Valor liquidado y facturado por mes' }), { k: 'K01 · K02', id: 'p1-evolucion', sub: 'Clic en un mes para obtener detalles' })}
        ${visual('Valor por operadora', cols({ w: anchoV(1 / 3), h: 230, items: ops, fmt: fmtM, fmtAx: axM, name: 'Valor liquidado' }), { k: 'K01' })}
        ${visual('Composición del ingreso', legend(comp) + stacked({ w: anchoV(2 / 3), x: ms, series: comp, pct: true, fmt: fmtM }), { k: 'K06 · K07' })}
        ${visual('Liquidaciones por estado', barH({ w: anchoV(1 / 3), items: estados, fmt: (v) => nf(v), ml: 84, rowH: 40, name: 'Liquidaciones' }), {})}
      </div>`;
  }

  function pagina2(M) {
    const ms = mesesEn(M);
    const agrupa = (campo) => {
      const m = new Map();
      M.I.forEach((r) => m.set(r[campo], (m.get(r[campo]) || 0) + r.valor_final));
      return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    const veh = agrupa('placa').slice(0, 15), rec = agrupa('recorrido');
    const tar = agrupa('tipo_servicio').map((d) => ({ ...d, color: C.verde }));
    const flota = [
      { name: 'Flota propia', color: C.verde, values: ms.map((k) => { const s = new Set(M.L.filter((r) => r.mesK === k).map((r) => r.consecutivo)); return sum(M.I.filter((r) => s.has(r.consecutivo) && !r.es_tercero), 'valor_final'); }) },
      { name: 'Terceros', color: C.ocre, values: ms.map((k) => { const s = new Set(M.L.filter((r) => r.mesK === k).map((r) => r.consecutivo)); return sum(M.I.filter((r) => s.has(r.consecutivo) && r.es_tercero), 'valor_final'); }) }
    ];
    const atip = M.I.filter((r) => r.es_anomalia).sort((a, b) => b.valor_unitario - a.valor_unitario);
    const tabla = `<div class="tbl-scroll"><table class="t atip"><thead><tr><th>Consecutivo</th><th>Placa</th><th>Recorrido</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Valor unitario</th><th>Motivo</th></tr></thead><tbody>
      ${atip.map((r) => `<tr><td>${esc(r.consecutivo)}</td><td>${esc(r.placa)}</td><td>${esc(r.recorrido)}</td><td>${esc(r.tipo_servicio)}</td><td class="num">${nf(r.cantidad, 2)}</td><td class="num">$${nf(r.valor_unitario)}</td><td><span class="chip">${esc(r.motivo_anomalia)}</span></td></tr>`).join('') || '<tr><td colspan="7">Sin atípicos en este filtro</td></tr>'}
    </tbody></table></div>`;
    return `<div class="vgrid p2">
        ${visual('Ingreso por vehículo · 15 mayores', barH({ w: anchoV(1 / 2), items: veh, fmt: fmtM, ml: 70, rowH: 26, name: 'Valor servicios' }), { cls: 'tall', k: 'P04' })}
        ${visual('Ingreso por recorrido', barH({ w: anchoV(1 / 2), items: rec, fmt: fmtM, ml: 70, rowH: 17, name: 'Valor servicios' }), { k: 'P04' })}
        ${visual('Valor por tipo de tarifa', cols({ w: anchoV(1 / 2), items: tar, fmt: fmtM, fmtAx: axM, h: 160, name: 'Valor servicios' }), { k: 'P03' })}
        ${visual('Flota propia frente a terceros', legend(flota) + stacked({ w: anchoV(1), x: ms, series: flota, fmt: fmtM, fmtAx: axM, h: 200 }), { cls: 'span2', k: 'K12 · ' + fmtP(M.K12) + ' terceros' })}
        ${visual(`Servicios marcados como atípicos · ${nf(atip.length)} <button class="linkbtn" data-act="iqr">¿Cómo se marca?</button>`, tabla, { cls: 'span2', id: 'p2-atipicos', k: 'rango intercuartílico' })}
      </div>`;
  }

  function pagina3(M) {
    const ms = mesesEn(M);
    const flujo = ['BORRADOR -> LIQUIDADA', 'LIQUIDADA -> APROBADA', 'APROBADA -> FACTURADA'];
    const bonito = (t) => t.split(' -> ').map((s) => s.charAt(0) + s.slice(1).toLowerCase()).join(' → ');
    const etapas = flujo.map((t) => ({ label: bonito(t), value: M.etapa(t), color: t === 'LIQUIDADA -> APROBADA' ? C.ocre : C.verde }));
    const ciclo = [{ name: 'Días a facturación', color: C.verde, values: ms.map((k) => avg(M.na.filter((r) => r.mesK === k), 'dias_a_facturacion')) }];
    const motivos = new Map();
    M.L.filter((r) => r.es_anulada).forEach((r) => motivos.set(r.motivo_anulacion || 'Sin motivo', (motivos.get(r.motivo_anulacion || 'Sin motivo') || 0) + 1));
    const anul = [...motivos.entries()].map(([label, value]) => ({ label, value, color: C.alerta })).sort((a, b) => b.value - a.value);
    const anios = [...new Set(ms.map((k) => k.slice(0, 4)))];
    const colAnio = [C.suave, C.verde, C.ocre];
    const yoy = anios.map((a, i) => ({ name: a, color: colAnio[i % 3], values: MESES.map((_, m) => { const k = `${a}-${String(m + 1).padStart(2, '0')}`; return ms.includes(k) ? sum(M.na.filter((r) => r.mesK === k), 'total') : null; }) }));
    return `<div class="cards" id="p3-tarjetas">
        ${card(null, fmtD(M.etapa(flujo[0])), 'Borrador → Liquidada')}${card('K05', fmtD(M.K05), 'Liquidada → Aprobada', 'ocre')}${card(null, fmtD(M.etapa(flujo[2])), 'Aprobada → Facturada')}${card('K04', fmtD(M.K04), 'Ciclo completo (días)')}
      </div>
      <div class="vgrid p3">
        ${visual('Días promedio por etapa', barH({ w: anchoV(1 / 2), items: etapas, fmt: (v) => fmtD(v) + ' d', ml: 140, rowH: 44, name: 'Días promedio' }), { id: 'p3-etapas', k: 'K05', sub: 'La etapa en ocre es el cuello de botella' })}
        ${visual('Evolución del ciclo completo', lineChart({ w: anchoV(1 / 2), x: ms, series: ciclo, fmt: (v) => fmtD(v) + ' días', fmtAx: (v) => nf(v), ref: { v: 15, label: 'Referencia K04 · 15 días' }, h: 200 }), { k: 'K04' })}
        ${visual('Anulaciones por motivo', anul.length ? barH({ w: anchoV(1 / 2), items: anul, fmt: (v) => nf(v), ml: 170, rowH: 32, name: 'Liquidaciones' }) : '<p class="v-sub">Sin anulaciones en este filtro</p>', { k: 'K10' })}
        ${visual('Comparativo año contra año', legend(yoy) + grouped({ w: anchoV(1 / 2), x: MESES, series: yoy, fmt: fmtM, fmtAx: axM, h: 190 }), { k: 'K01' })}
      </div>`;
  }

  function vTablero() {
    const fPag = { ...F, mes: UI.pagina === 2 ? F.mes : null };
    const M = medidas(fPag);
    const cuerpo = UI.pagina === 1 ? pagina1(M) : UI.pagina === 2 ? pagina2(M) : pagina3(M);
    const banner = UI.pagina === 2 && F.mes ? `<div class="drill-banner" id="p2-banner">Obtener detalles · Período: <b>${mesLargo(F.mes)}</b> <button data-act="undrill" title="Quitar el filtro de detalle">✕</button></div>` : '';
    return `<div class="report">
      <div class="canvas">
        <div class="r-head"><h2>${PAGINAS[UI.pagina]}<small>Liquidación de servicios de transporte especial</small></h2>${slicers()}</div>
        ${banner}${cuerpo}
      </div>
      <div class="pages">${[1, 2, 3].map((p) => `<button class="${UI.pagina === p ? 'on' : ''}" data-act="pagina" data-v="${p}">${PAGINAS[p]}</button>`).join('')}</div>
      <p class="sim-note">Simulación en navegador para ensayar el guion, con los mismos CSV. El entregable es <code>06_DASHBOARD.pbix</code>.</p>
    </div>`;
  }

  /* ─── Escenario: cierre ──────────────────────────────── */
  function vCierre() {
    return `<div class="sheet">
      <p class="eyebrow">Cierre</p>
      <h2>Lo que el tablero cambia</h2>
      <div style="margin-top:18px">
        <div class="hallazgo"><span class="fig">${fmtD(M0.K05)} d</span><div><b>de ${fmtD(M0.K04)} días se van esperando aprobación</b><p>El ${fmtP(pct(M0.K05, M0.K04))} del ciclo está en una sola etapa: ahí se interviene para cobrar antes.</p></div></div>
        <div class="hallazgo"><span class="fig">${nf(M0.nAnom)}</span><div><b>servicios atípicos para revisar antes de facturar</b><p>Corregir antes de emitir la factura cuesta menos que anularla después.</p></div></div>
        <div class="hallazgo"><span class="fig">${fmtP(M0.K12)}</span><div><b>del valor lo prestan vehículos de terceros</b><p>Un dato para negociar con terceros y planear la flota propia.</p></div></div>
      </div>
      <div class="grid2">
        <div class="box" id="cierre-decisiones"><h3>Dos decisiones</h3><ol class="qlist">
          <li><span class="n">01</span><span>Intervenir la etapa de aprobación para acortar el ciclo de cobro.</span></li>
          <li><span class="n">02</span><span>Revisar los atípicos antes de facturar, no después.</span></li></ol></div>
        <div class="box alt"><h3>Tres limitaciones, documentadas</h3><ol class="qlist">
          <li><span class="n">01</span><span>Los datos son sintéticos y calibrados, no reales.</span></li>
          <li><span class="n">02</span><span>El alcance se cerró en seis preguntas.</span></li>
          <li><span class="n">03</span><span>El pipeline se ejecuta bajo demanda, no programado.</span></li></ol></div>
      </div>
    </div>`;
  }

  /* ─── Render ─────────────────────────────────────────── */
  const ESCENARIOS = { portada: ['Portada', vPortada], pipeline: ['Pipeline', vPipeline], pq: ['Power Query', vPQ], modelo: ['Modelo', vModelo], tablero: ['Tablero', vTablero], cierre: ['Cierre', vCierre] };

  // Mide el espacio real del escenario: de aquí salen el ancho de cada gráfico
  // y las clases .medio / .movil que usa el CSS, para que ambos coincidan.
  function medir() {
    const sw = stage.clientWidth || innerWidth;
    const pad = innerWidth <= 720 ? 12 : 22;
    const inner = Math.min(sw - 2 * pad, 1280);
    const movil = inner < 760;
    LAY = {
      movil, medio: !movil && inner < 1000, sw,
      report: inner - (movil ? 12 + 20 : 28 + 36),
      sheet: Math.min(inner, 1180) - (movil ? 32 : 64)
    };
    stage.classList.toggle('movil', LAY.movil);
    stage.classList.toggle('medio', LAY.medio);
  }

  // Ancho en px de un visual que ocupa la fracción `frac` de la fila del tablero
  function anchoV(frac) {
    const c = LAY.report, borde = 26;
    if (LAY.movil) return Math.max(260, Math.round(c - borde));
    return Math.max(260, Math.round(c * frac - 10 * (1 - frac) - borde));
  }

  function render() {
    medir();
    $('#tabs').innerHTML = Object.entries(ESCENARIOS).map(([k, [n]]) => `<button class="${UI.stage === k ? 'on' : ''}" data-act="stage" data-v="${k}">${n}</button>`).join('');
    const y = stage.scrollTop;
    stage.innerHTML = ESCENARIOS[UI.stage][1]();
    stage.scrollTop = y;
    if (UI.foco) {
      const el = stage.querySelector(UI.foco);
      if (el) {
        el.classList.add('foco');
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
      }
      UI.foco = null;
    }
    renderGuion();
  }

  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  function renderGuion() {
    const E = window.ESCENAS, e = E[UI.escena];
    $('#g-bar').innerHTML = E.map((x, i) => `<span style="flex:${x.seg}" class="${i < UI.escena ? 'done' : i === UI.escena ? 'now' : ''}" data-act="escena" data-v="${i}" title="${esc(x.kicker)}"></span>`).join('');
    $('#g-kicker').textContent = e.kicker;
    $('#g-title').textContent = e.titulo;
    $('#g-content').innerHTML = `<p class="g-label">Lo que dices</p>
      <div class="g-say">${e.decir().map((p) => `<p>${fill(p)}</p>`).join('')}</div>
      <p class="g-label" style="margin-top:16px">Lo que haces</p>
      <ul class="g-do" style="border-top:none;padding-top:0;margin-top:0">${e.hacer.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      ${e.pregunta ? `<div class="g-ask"><p class="g-label" style="margin-bottom:4px">Si te preguntan</p><b>${esc(e.pregunta.q)}</b><p>${esc(e.pregunta.a)}</p></div>` : ''}`;
    $('#g-content').scrollTop = 0;
    $('#g-next').textContent = UI.escena === E.length - 1 ? 'Fin' : 'Siguiente →';
    reloj();
  }

  function reloj() {
    const E = window.ESCENAS, now = performance.now();
    const total = (UI.acum + (UI.corriendo ? now - UI.t0 : 0)) / 1000;
    const enEsc = (UI.eAcum + (UI.corriendo ? now - UI.eT0 : 0)) / 1000;
    const meta = E.slice(0, UI.escena + 1).reduce((a, x) => a + x.seg, 0);
    const t = $('#g-time');
    t.textContent = mmss(total);
    t.classList.toggle('over', total > 600);
    $('#g-meta').innerHTML = `Al terminar esta escena:<br>ir en ${mmss(meta)} o menos`;
    const e = E[UI.escena];
    $('#g-scene-clock').innerHTML = `Sugerido ${mmss(e.seg)} · <span class="${enEsc > e.seg ? 'over' : ''}">llevas ${mmss(enEsc)}</span>`;
    $('#g-play').textContent = UI.corriendo ? 'Pausar' : total > 0 ? 'Seguir' : 'Iniciar';
  }

  function irEscena(i) {
    const E = window.ESCENAS;
    if (i < 0 || i >= E.length) return;
    const now = performance.now();
    UI.escena = i; UI.eAcum = 0; UI.eT0 = now;
    const e = E[i];
    UI.stage = e.stage;
    if (e.pagina) UI.pagina = e.pagina;
    if (e.filtros) {
      F.desde = D.meses[0]; F.hasta = D.meses[D.meses.length - 1];
      F.op = e.filtros.op;
      F.mes = e.filtros.mes === 'drill' ? D.mesDrill : e.filtros.mes;
    }
    if (e.pq) Object.assign(UI.pq, e.pq, { avanzado: false });
    UI.foco = e.foco || null;
    stage.scrollTop = 0;
    render();
  }

  function alternarReloj() {
    const now = performance.now();
    if (UI.corriendo) { UI.acum += now - UI.t0; UI.eAcum += now - UI.eT0; UI.corriendo = false; }
    else { UI.t0 = now; UI.eT0 = now; UI.corriendo = true; }
    reloj();
  }

  /* ─── Ventanas ───────────────────────────────────────── */
  function abrirPop(html) {
    cerrarPop();
    const d = document.createElement('div');
    d.className = 'pop'; d.id = 'pop';
    d.innerHTML = `<div class="pop-card" role="dialog" aria-modal="true"><button class="close" data-act="cerrar">Cerrar</button>${html}</div>`;
    document.body.appendChild(d);
  }
  function cerrarPop() { const p = $('#pop'); if (p) p.remove(); }

  function popMedida(k) {
    const m = MEDIDAS[k], fPag = { ...F, mes: UI.pagina === 2 ? F.mes : null }, M = medidas(fPag);
    abrirPop(`<h3>${esc(m.nombre)} <small style="font-family:var(--mono);font-size:12px;color:var(--faint)">${k}</small></h3>
      <p class="note" style="margin:0 0 6px">${esc(m.lee)}</p>
      <div class="dax">${esc(m.dax)}</div>
      <div class="dax-row" style="margin-top:12px"><b>Resultado con los filtros actuales</b><span>${m.fmt(M[k])}</span></div>
      <p class="note">Filtros: ${mesCorto(F.desde)} a ${mesCorto(F.hasta)} · operadora ${esc(F.op)}. Cambia un filtro y vuelve a abrir: la misma fórmula da otro número.</p>`);
  }

  /* ─── Eventos ────────────────────────────────────────── */
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) { if (ev.target.id === 'pop') cerrarPop(); return; }
    const v = b.dataset.v;
    switch (b.dataset.act) {
      case 'stage': UI.stage = v; stage.scrollTop = 0; render(); break;
      case 'pagina': UI.pagina = +v; render(); break;
      case 'op': F.op = v; render(); break;
      case 'drill': F.mes = v; UI.pagina = 2; UI.foco = '#p2-banner'; stage.scrollTop = 0; render(); break;
      case 'undrill': F.mes = null; render(); break;
      case 'fx': popMedida(v); break;
      case 'iqr': abrirPop(`<h3>Cómo se marca un atípico</h3><p class="note" style="margin:0 0 10px">Para cada tipo de tarifa: Q1 y Q3 encierran la mitad central. Lo que cae a más de 1,5 veces ese rango (RIC) de los bordes se marca.</p><div id="pop-iqr">${bloqueIQR(true)}</div>`); break;
      case 'cerrar': cerrarPop(); break;
      case 'pq-q': UI.pq.consulta = v; UI.pq.avanzado = false; render(); break;
      case 'pq-paso': UI.pq.paso = +v; UI.pq.avanzado = false; render(); break;
      case 'pq-adv': UI.pq.avanzado = !UI.pq.avanzado; if (UI.pq.consulta === 'RutaDatos') UI.pq.consulta = 'Liquidaciones'; render(); break;
      case 'escena': irEscena(+v); break;
    }
  });

  document.addEventListener('change', (ev) => {
    const ch = ev.target.dataset.ch;
    if (!ch) return;
    if (ch === 'desde') { F.desde = ev.target.value; if (F.hasta < F.desde) F.hasta = F.desde; }
    if (ch === 'hasta') { F.hasta = ev.target.value; if (F.desde > F.hasta) F.desde = F.hasta; }
    if (ch === 'iqr') {
      UI.iqrTipo = ev.target.value;
      const pop = $('#pop-iqr');
      if (pop) { pop.innerHTML = bloqueIQR(true); return; }
    }
    render();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest('select, input, textarea')) return;
    if (ev.key === 'Escape') return cerrarPop();
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ') { ev.preventDefault(); irEscena(UI.escena + 1); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); irEscena(UI.escena - 1); }
    else if (ev.key === 't' || ev.key === 'T') alternarReloj();
    else if (ev.key === 'g' || ev.key === 'G') $('#toggle-guion').click();
  });

  $('#g-next').onclick = () => irEscena(UI.escena + 1);
  $('#g-prev').onclick = () => irEscena(UI.escena - 1);
  $('#g-play').onclick = alternarReloj;
  $('#toggle-guion').onclick = (ev) => {
    const app = $('#app');
    app.classList.toggle('sin-guion');
    ev.currentTarget.textContent = app.classList.contains('sin-guion') ? 'Mostrar guion' : 'Ocultar guion';
    if (M0) { anchoPrevio = stage.clientWidth; render(); }
  };

  let anchoPrevio = 0, tResize = null;
  addEventListener('resize', () => {
    clearTimeout(tResize);
    tResize = setTimeout(() => {
      if (!M0) return;
      const w = stage.clientWidth;
      if (Math.abs(w - anchoPrevio) > 24) { anchoPrevio = w; render(); }
    }, 160);
  });

  // Tooltip compartido
  const tip = $('#tip');
  document.addEventListener('mousemove', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    const [h, ...rest] = t.getAttribute('data-tip').split('\n');
    tip.innerHTML = `<b>${esc(h)}</b>${rest.length ? '<br>' + rest.map(esc).join('<br>') : ''}`;
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });

  // En pantallas táctiles no hay cursor: un toque muestra el tooltip unos segundos
  let tTip = null;
  document.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    const t = ev.target.closest && ev.target.closest('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    const [h, ...rest] = t.getAttribute('data-tip').split('\n');
    tip.innerHTML = `<b>${esc(h)}</b>${rest.length ? '<br>' + rest.map(esc).join('<br>') : ''}`;
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(ev.clientX - r.width / 2, innerWidth - r.width - 8)) + 'px';
    tip.style.top = Math.max(8, ev.clientY - r.height - 18) + 'px';
    clearTimeout(tTip);
    tTip = setTimeout(() => { tip.style.display = 'none'; }, 2600);
  });

  setInterval(() => { if (UI.corriendo) reloj(); }, 250);

  /* ─── Arranque ───────────────────────────────────────── */
  cargar().then(() => {
    prepararGuion();
    const q = new URLSearchParams(location.search);
    irEscena(Math.max(0, Math.min(window.ESCENAS.length - 1, (+q.get('escena') || 1) - 1)));
  }).catch((err) => {
    stage.innerHTML = `<div class="error"><b>No se pudieron leer los datos</b> (${esc(err.message)}).<br><br>
      La app lee los CSV de <code>JulianLopez_Dashboard_Proyecto/00_DATOS/</code>, así que hay que servirla desde la raíz del repositorio:<br><br>
      <code>python3 -m http.server 8765</code><br>y abrir <code>http://localhost:8765/plan/guion/</code></div>`;
  });
})();
