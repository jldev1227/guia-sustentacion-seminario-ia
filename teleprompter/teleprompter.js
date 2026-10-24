/* Teleprompter de grabación: video tutorial (5 min) y presentación (9 min de meta). */
(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const reader = $('#reader');
  const content = $('#script-content');
  let SCRIPT_VALUES = {
    raw: '4.536', limpios: '4.448', nMeses: '24', valorLiq: '$3.600 millones',
    ticket: '$27,9 millones', diasFact: '18,0', diasAprob: '10,8',
    pctTerceros: '29,5%', anom: '122', pctAnom: '2,7%',
    mesDrill: 'agosto de 2026', mesesSobre: '16'
  };

  const tutorial = {
    id: 'tutorial',
    title: 'Video tutorial',
    target: 300,
    limit: 300,
    targetLabel: 'Meta 5:00 · límite 5:00',
    scenes: [
      {
        kicker: '01 · Bienvenida', title: 'Qué vas a ver', seconds: 35,
        say: [
          'Hola. En estos cinco minutos te voy a mostrar cómo recorrer el tablero del proyecto <b>De liquidaciones a decisiones visibles</b>.',
          'El tablero resume el proceso de liquidación de servicios de transporte especial durante <b>{nMeses} meses</b>. Los datos son sintéticos y están calibrados para representar el proceso sin exponer información de personas ni de clientes.'
        ],
        cues: ['Deja visible la página de visión ejecutiva.', 'Aclara al comienzo que los datos del ejercicio son sintéticos.']
      },
      {
        kicker: '02 · Página ejecutiva', title: 'Entender el panorama', seconds: 35,
        say: [
          'Empezamos en <b>Visión ejecutiva</b>. Las tarjetas de arriba resumen el valor liquidado, el valor facturado, el ticket promedio y los días que tarda una liquidación en llegar a factura.',
          'En el conjunto completo, el valor liquidado ronda los <b>{valorLiq}</b> y cada liquidación tiene un ticket promedio cercano a <b>{ticket}</b>. La gráfica mensual permite comparar lo liquidado con lo que ya se facturó.'
        ],
        cues: ['Señala las tarjetas principales.', 'Pasa el cursor sobre un mes para mostrar el detalle de la gráfica.']
      },
      {
        kicker: '03 · Filtros', title: 'Cambiar el período y la operadora', seconds: 40,
        say: [
          'Los filtros de <b>período y operadora</b> están en la parte superior. Al cambiar cualquiera, las tarjetas y los gráficos se recalculan juntos.',
          'Por ejemplo, elijo una operadora y luego regreso a “Todas”. Así comparo un resultado particular con el panorama general. El filtro se mantiene al cambiar entre las páginas del tablero.'
        ],
        cues: ['Selecciona OPR-A y luego restablece “Todas”.', 'Muestra el rango de fechas y aplica un período corto.']
      },
      {
        kicker: '04 · Detalle operacional', title: 'Explorar vehículos y servicios', seconds: 45,
        say: [
          'En <b>Detalle operacional</b> vemos cómo se distribuye el valor por vehículo, recorrido y tipo de servicio. Esta página ayuda a encontrar qué concentra más actividad y cuánto corresponde a vehículos de terceros.',
          'Al pasar el cursor por las barras aparecen los valores exactos. También puedo seleccionar una categoría para ver cómo cambia el resto de la página con ese filtro.'
        ],
        cues: ['Abre la página de detalle operacional.', 'Pasa el cursor sobre las barras y selecciona una categoría; después limpia la selección.']
      },
      {
        kicker: '05 · Obtener detalles', title: 'Pasar de un mes al detalle', seconds: 40,
        say: [
          'Si encuentro un mes que quiero investigar, uso <b>Obtener detalles</b> para pasar desde el resumen a la página operacional con ese período aplicado.',
          'En Power BI, haz clic derecho sobre el mes y elige “Obtener detalles”. Al terminar, quita el filtro del mes para volver a ver los {nMeses} meses.'
        ],
        cues: ['Haz la acción de obtener detalles en el archivo .pbix.', 'Muestra el filtro aplicado y cómo quitarlo para regresar.']
      },
      {
        kicker: '06 · Atípicos', title: 'Revisar valores fuera de rango', seconds: 45,
        say: [
          'La tabla de <b>servicios atípicos</b> señala valores que se alejan del rango habitual para su tipo de tarifa. Se identifican con el rango intercuartílico: la mitad central de los datos define el rango esperado y los valores muy alejados se marcan para revisión.',
          'En este conjunto se marcan <b>{anom} servicios</b>, cerca del <b>{pctAnom}</b>. Una marca no significa que el dato esté mal; indica que conviene revisarlo antes de facturar.'
        ],
        cues: ['Muestra la tabla de atípicos y el control “¿Cómo se marca?”.', 'Explica que la marca solicita revisión; no descarta automáticamente el registro.']
      },
      {
        kicker: '07 · Tiempos', title: 'Encontrar el cuello de botella', seconds: 40,
        say: [
          'La página de <b>Tiempos</b> muestra cuánto tarda cada etapa. El hallazgo principal es la aprobación: toma en promedio cerca de <b>{diasAprob} días</b>, dentro de un ciclo de alrededor de <b>{diasFact} días</b> hasta la facturación.',
          'La barra ocre destaca la etapa que más tiempo consume. Esto ayuda a enfocar una revisión del proceso en el punto donde puede reducirse la espera.'
        ],
        cues: ['Señala la transición “Liquidada → Aprobada”.', 'Compara el tiempo de aprobación con el ciclo completo.']
      },
      {
        kicker: '08 · Cierre', title: 'Qué decisiones apoya', seconds: 20,
        say: [
          'En resumen, el tablero permite ver cuánto se liquida, dónde se concentra la actividad, qué valores ameritan revisión y en qué etapa se acumula la espera.',
          'Los indicadores se construyeron a partir de datos sintéticos y un pipeline con reglas de limpieza y validación documentadas. Gracias por acompañarme en este recorrido.'
        ],
        cues: ['Cierra mostrando la página de tiempos o la portada.', 'Procura que el video completo no supere los cinco minutos.']
      }
    ]
  };

  const state = {
    key: 'tutorial', running: false, startedAt: 0, elapsed: 0,
    autoScroll: true, speed: 16, fontSize: 42, observer: null, raf: null, lastFrame: null
  };

  const mmss = (seconds) => {
    const s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const elapsedSeconds = () => (state.elapsed + (state.running ? performance.now() - state.startedAt : 0)) / 1000;
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, key) => SCRIPT_VALUES[key] || `{${key}}`);

  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (char !== '\r') field += char;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function numberFormat(value, decimals) {
    if (value == null || Number.isNaN(value)) return '(En blanco)';
    const parts = Math.abs(value).toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (value < 0 ? '−' : '') + parts[0] + (parts[1] ? ',' + parts[1] : '');
  }

  async function loadScriptValues() {
    const paths = ['../guion/datos/', '../../JulianLopez_Dashboard_Proyecto/00_DATOS/'];
    const files = ['limpio/liquidaciones.csv', 'limpio/items.csv', 'limpio/tiempos_proceso.csv', 'raw/liquidaciones_items.csv'];
    let base = null;
    for (const candidate of paths) {
      try {
        const response = await fetch(candidate + files[0], { method: 'HEAD' });
        if (response.ok) { base = candidate; break; }
      } catch (_) { /* Prueba la siguiente ruta disponible. */ }
    }
    if (!base) return null;

    const tables = await Promise.all(files.map(async (file) => {
      const response = await fetch(base + file);
      if (!response.ok) throw new Error(file);
      const [headers, ...rows] = parseCSV(await response.text());
      return rows.filter((values) => values.length > 1).map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index]])));
    }));
    const [liquidaciones, items, tiempos, crudos] = tables;
    const noAnuladas = liquidaciones.filter((row) => row.es_anulada !== 'True');
    const total = noAnuladas.reduce((sum, row) => sum + (+row.total || 0), 0);
    const promedio = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const days = noAnuladas.filter((row) => row.dias_a_facturacion !== '').map((row) => +row.dias_a_facturacion).filter(Number.isFinite);
    const approvals = tiempos.filter((row) => row.transicion === 'LIQUIDADA -> APROBADA' && row.dias_en_etapa !== '').map((row) => +row.dias_en_etapa).filter(Number.isFinite);
    const itemsTotal = items.reduce((sum, row) => sum + (+row.valor_final || 0), 0);
    const thirdTotal = items.filter((row) => row.es_tercero === 'True').reduce((sum, row) => sum + (+row.valor_final || 0), 0);
    const anomalies = items.filter((row) => row.es_anomalia === 'True').length;
    const byMonth = new Map([...new Set(liquidaciones.map((row) => row.periodo.slice(0, 7)))].sort().map((month) => [month, { total: 0, days: [] }]));
    for (const row of noAnuladas) {
      const month = row.periodo.slice(0, 7);
      const entry = byMonth.get(month);
      entry.total += +row.total || 0;
      if (row.dias_a_facturacion) entry.days.push(+row.dias_a_facturacion);
      byMonth.set(month, entry);
    }
    const topMonth = [...byMonth.entries()].sort((a, b) => b[1].total - a[1].total)[0]?.[0];
    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const monthsOver = [...byMonth.values()].filter((month) => promedio(month.days) > 15).length;
    const formatMillions = (value) => '$' + numberFormat(value / 1e6, Math.abs(value) >= 1e8 ? 0 : 1) + ' millones';

    return {
      raw: numberFormat(crudos.length, 0), limpios: numberFormat(items.length, 0), nMeses: byMonth.size,
      valorLiq: formatMillions(total), ticket: formatMillions(promedio(noAnuladas.map((row) => +row.total))),
      diasFact: numberFormat(promedio(days), 1), diasAprob: numberFormat(promedio(approvals), 1),
      pctTerceros: numberFormat(itemsTotal ? thirdTotal / itemsTotal * 100 : 0, 1) + '%',
      anom: numberFormat(anomalies, 0), pctAnom: numberFormat(items.length ? anomalies / items.length * 100 : 0, 1) + '%',
      mesDrill: topMonth ? `${monthNames[+topMonth.slice(5, 7) - 1]} de ${topMonth.slice(0, 4)}` : 'el período de mayor valor',
      mesesSobre: numberFormat(monthsOver, 0)
    };
  }

  function presentationScript() {
    const scenes = Array.isArray(window.ESCENAS) ? window.ESCENAS : [];
    return {
      id: 'presentacion', title: 'Presentación', target: 540, limit: 600,
      targetLabel: 'Meta 9:00 · límite 10:00',
      scenes: scenes.map((scene) => ({
        kicker: scene.kicker, title: scene.titulo, seconds: scene.seg,
        say: scene.decir().map(fill), cues: scene.hacer || [], question: scene.pregunta || null
      }))
    };
  }

  function currentScript() {
    return state.key === 'presentacion' ? presentationScript() : tutorial;
  }

  function renderScene(scene, index) {
    const paragraphs = scene.say.map((paragraph) => `<p>${fill(paragraph)}</p>`).join('');
    const cues = scene.cues && scene.cues.length
      ? `<div class="cues"><p class="cues-label">Apoyo visual</p><ul>${scene.cues.map((cue) => `<li>${cue}</li>`).join('')}</ul>${scene.question ? `<div class="question"><b>Si te preguntan · ${scene.question.q}</b><br>${scene.question.a}</div>` : ''}</div>`
      : '';
    return `<section class="chapter" id="chapter-${index}" data-index="${index}">
      <div class="chapter-heading"><span>${scene.kicker}</span><h2>${scene.title}</h2><span class="duration">${mmss(scene.seconds)} sugeridos</span></div>
      <div class="speech">${paragraphs}</div>${cues}</section>`;
  }

  function render(preservePosition) {
    const script = currentScript();
    const previousScroll = reader.scrollTop;
    const previousChapter = +$('#chapter-select').value || 0;
    content.innerHTML = script.scenes.map(renderScene).join('') + '<div class="end-marker">Fin del guion</div>';
    $('#chapter-select').innerHTML = script.scenes.map((scene, index) => `<option value="${index}">${scene.kicker.replace(/^\d+ · /, '')}</option>`).join('');
    $('#timer-target').textContent = script.targetLabel;
    $('#active-chapter').textContent = `${script.title} · ${script.scenes[0].title}`;
    if (state.observer) state.observer.disconnect();
    state.observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const index = +visible.target.dataset.index;
      const scene = script.scenes[index];
      $('#active-chapter').textContent = `${script.title} · ${scene.title}`;
      $('#chapter-select').value = String(index);
    }, { root: reader, threshold: [0.15, 0.35, 0.6] });
    content.querySelectorAll('.chapter').forEach((chapter) => state.observer.observe(chapter));
    if (preservePosition) {
      reader.scrollTop = previousScroll;
      const activeChapter = Math.min(previousChapter, script.scenes.length - 1);
      $('#chapter-select').value = String(activeChapter);
      $('#active-chapter').textContent = `${script.title} · ${script.scenes[activeChapter].title}`;
      updateClock();
    } else reset();
    updateScrollProgress();
  }

  function updateClock() {
    const script = currentScript();
    const seconds = elapsedSeconds();
    const left = Math.max(0, script.target - seconds);
    const over = seconds > script.target;
    $('#timer').textContent = mmss(seconds);
    $('#timer').classList.toggle('over', seconds > script.limit);
    $('#remaining').textContent = over ? `Meta superada · límite ${mmss(script.limit)}` : `Quedan ${mmss(left)}`;
    $('#remaining').classList.toggle('over', over);
    const progress = Math.min(100, seconds / script.target * 100);
    $('#timer-progress').style.width = `${progress}%`;
    $('#timer-progress').classList.toggle('over', seconds > script.target);
    $('#play-icon').textContent = state.running ? 'Ⅱ' : '▶';
    $('#play-label').textContent = state.running ? 'Pausar' : seconds > 0 ? 'Seguir lectura' : 'Iniciar lectura';
    $('#play-button').setAttribute('aria-pressed', String(state.running));
  }

  function setRunning(running) {
    if (running === state.running) return;
    if (running) {
      state.startedAt = performance.now();
      state.running = true;
      state.lastFrame = null;
      if (state.autoScroll) startAutoScroll();
    } else {
      state.elapsed += performance.now() - state.startedAt;
      state.running = false;
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = null;
      state.lastFrame = null;
    }
    updateClock();
  }

  function startAutoScroll() {
    if (!state.running || !state.autoScroll || state.raf) return;
    const step = (time) => {
      if (!state.running || !state.autoScroll) { state.raf = null; return; }
      if (state.lastFrame != null) reader.scrollTop += (time - state.lastFrame) * state.speed / 1000;
      state.lastFrame = time;
      if (reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 2) {
        state.autoScroll = false;
        $('#autoscroll-button').setAttribute('aria-pressed', 'false');
        $('#autoscroll-button').textContent = 'Auto scroll: no';
        state.raf = null;
        return;
      }
      state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);
  }

  function reset() {
    state.running = false;
    state.elapsed = 0;
    state.startedAt = 0;
    state.lastFrame = null;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = null;
    state.autoScroll = true;
    $('#autoscroll-button').setAttribute('aria-pressed', 'true');
    $('#autoscroll-button').textContent = 'Auto scroll: sí';
    reader.scrollTop = 0;
    updateClock();
    updateScrollProgress();
  }

  function updateScrollProgress() {
    const max = Math.max(1, reader.scrollHeight - reader.clientHeight);
    const progress = Math.min(100, Math.max(0, reader.scrollTop / max * 100));
    $('#scroll-progress').style.width = `${progress}%`;
    $('#scroll-progress-label').textContent = `${Math.round(progress)}% leído`;
  }

  function jumpTo(index) {
    const target = $(`#chapter-${index}`);
    if (target) target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function changeFont(delta) {
    state.fontSize = Math.max(25, Math.min(68, state.fontSize + delta));
    document.documentElement.style.setProperty('--font-reading', `${state.fontSize}px`);
    $('#font-output').textContent = `${state.fontSize} px`;
  }

  $('#script-select').addEventListener('change', (event) => {
    state.key = event.target.value;
    render();
  });
  $('#play-button').addEventListener('click', () => setRunning(!state.running));
  $('#reset-button').addEventListener('click', reset);
  $('#speed-range').addEventListener('input', (event) => {
    state.speed = +event.target.value;
    $('#speed-output').textContent = `${state.speed} px/s`;
  });
  $('#font-down').addEventListener('click', () => changeFont(-3));
  $('#font-up').addEventListener('click', () => changeFont(3));
  $('#mirror-button').addEventListener('click', (event) => {
    const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed', String(enabled));
    event.currentTarget.textContent = enabled ? 'Espejo: sí' : 'Espejo';
    reader.classList.toggle('mirrored', enabled);
  });
  $('#fullscreen-button').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) { /* La lectura permanece disponible si el navegador niega pantalla completa. */ }
  });
  $('#autoscroll-button').addEventListener('click', (event) => {
    state.autoScroll = !state.autoScroll;
    event.currentTarget.setAttribute('aria-pressed', String(state.autoScroll));
    event.currentTarget.textContent = state.autoScroll ? 'Auto scroll: sí' : 'Auto scroll: no';
    state.lastFrame = null;
    if (state.autoScroll) startAutoScroll();
    else if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
  });
  $('#cues-button').addEventListener('click', (event) => {
    const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed', String(enabled));
    event.currentTarget.textContent = enabled ? 'Ocultar apoyos' : 'Mostrar apoyos';
    document.body.classList.toggle('with-cues', enabled);
  });
  $('#chapter-select').addEventListener('change', (event) => jumpTo(+event.target.value));
  reader.addEventListener('scroll', updateScrollProgress, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.target.closest('button, select, input, textarea, summary, a')) return;
    const key = event.key;
    if (key === ' ' || key === 'Spacebar') { event.preventDefault(); setRunning(!state.running); }
    else if (key === 'ArrowRight' || key === 'PageDown') { event.preventDefault(); jumpTo(Math.min(currentScript().scenes.length - 1, +$('#chapter-select').value + 1)); }
    else if (key === 'ArrowLeft' || key === 'PageUp') { event.preventDefault(); jumpTo(Math.max(0, +$('#chapter-select').value - 1)); }
    else if (key.toLowerCase() === 'f') $('#fullscreen-button').click();
    else if (key.toLowerCase() === 'm') $('#mirror-button').click();
    else if (key === '+' || key === '=') changeFont(3);
    else if (key === '-' || key === '_') changeFont(-3);
  });

  window.addEventListener('resize', updateScrollProgress, { passive: true });
  document.addEventListener('fullscreenchange', () => {
    $('#fullscreen-button').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
  });
  window.setInterval(() => { if (state.running) updateClock(); }, 250);

  if (!window.ESCENAS) {
    $('#active-chapter').textContent = 'No se pudo cargar el guion de presentación.';
    $('#script-select').querySelector('option[value="presentacion"]').disabled = true;
  }
  render();
  loadScriptValues().then((values) => {
    if (!values) return;
    SCRIPT_VALUES = values;
    render(true);
  }).catch(() => { /* Los valores de respaldo permiten usar el guion si los CSV no están disponibles. */ });
})();
