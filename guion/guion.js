/* Guion de la sustentación: 11 escenas, 9:00 de meta, 10:00 de límite.
   Cada escena fija qué se ve (stage, página, filtros), qué se resalta (foco)
   y qué se dice. Las cifras entre llaves salen de los datos, no están escritas a mano. */

window.ESCENAS = [
  {
    id: 'apertura',
    kicker: 'Escena 1 · Apertura',
    titulo: 'De qué se trata',
    seg: 40,
    stage: 'portada',
    foco: '#portada-titulo',
    decir: (m) => [
      'Buenos días. Mi proyecto es un <b>tablero de control sobre la liquidación de servicios de transporte especial de personal</b>: el proceso con el que una empresa de transporte convierte los servicios de un mes —viajes, horas, kilómetros, pernoctes— en una liquidación que se aprueba y se factura a la operadora.',
      'El caso representa de forma académica las etapas de liquidación y facturación. <b>Los datos son sintéticos</b> y se generaron para practicar validaciones; no representan una operación ni una empresa real.'
    ],
    hacer: ['Mostrar la portada.', 'Señalar la etiqueta «Datos sintéticos · escenario académico».'],
    pregunta: {
      q: '¿Por qué no usaste datos reales?',
      a: 'El alcance de esta entrega es académico: el conjunto fue generado para ensayar las reglas y los cálculos. No se afirma que su estructura, proporciones o resultados correspondan a un proceso empresarial observado.'
    }
  },
  {
    id: 'preguntas',
    kicker: 'Escena 2 · El problema',
    titulo: 'Seis preguntas, ninguna más',
    seg: 50,
    stage: 'portada',
    foco: '#portada-preguntas',
    decir: () => [
      'Todo el tablero cuelga de <b>seis preguntas de negocio</b>.',
      'Cuánto se liquida y se factura; cuánto tarda una liquidación y dónde se estanca; de qué se compone el ingreso; qué vehículos y recorridos concentran la facturación; cuánto se pierde en anulaciones; y cuánto pesan los terceros frente a la flota propia.',
      'Cada gráfico que van a ver responde una de estas. <b>Si no responde ninguna, no está.</b>'
    ],
    hacer: ['Recorrer la lista con el cursor, sin leerla palabra por palabra.'],
    pregunta: {
      q: '¿Por qué seis y no más?',
      a: 'El marco pide entre cinco y siete. Seis cubren el proceso de punta a punta; cada pregunta de más es un gráfico de más que mantener y explicar.'
    }
  },
  {
    id: 'sucios',
    kicker: 'Escena 3 · Los datos',
    titulo: 'Defectos introducidos para el ejercicio',
    seg: 50,
    stage: 'pipeline',
    foco: '#sucio',
    decir: (m) => [
      'Los archivos de práctica contienen <b>{raw} líneas sintéticas</b> con variaciones deliberadas: placas, tarifas como texto, fechas en varios formatos, duplicados y referencias sin cabecera.',
      'La suciedad es deliberada: <b>limpiarla es la mitad del trabajo técnico</b>, y es lo que el pipeline tiene que resolver.'
    ],
    hacer: ['Mostrar ejemplos generados en los archivos y las reglas que los detectan.'],
    pregunta: {
      q: '¿Cómo sabes que esos defectos se parecen a los de una operación real?',
      a: 'No afirmo que las distribuciones o tasas de defectos representen una operación real. Los casos se incluyeron para demostrar las validaciones; contrastarlos requeriría datos autorizados y revisión con responsables del proceso.'
    }
  },
  {
    id: 'pipeline',
    kicker: 'Escena 4 · Automatización',
    titulo: 'El pipeline limpia y valida',
    seg: 50,
    stage: 'pipeline',
    foco: '#embudo',
    decir: (m) => [
      'La limpieza la hace un script en Python en cuatro etapas: <b>extraer, transformar, validar y cargar</b>.',
      'De {raw} líneas quedan <b>{limpios}</b>: salen 66 duplicados y 22 huérfanos, y cada descarte queda registrado en una bitácora.',
      'Al final corren <b>nueve validaciones</b>. Ocho pasan y una avisa: una liquidación cuya cabecera no cuadra con su detalle. Ese aviso es intencional: demuestra que el control funciona.'
    ],
    hacer: ['Señalar el embudo 4.536 → 4.448.', 'Bajar a la lista de validaciones y señalar el AVISO.'],
    pregunta: {
      q: '¿Qué pasa si el mes que viene llega un dato que no cumple?',
      a: 'La validación lo marca como aviso en la bitácora y en validaciones.csv. El tablero no se alimenta de datos que no pasaron por ahí.'
    }
  },
  {
    id: 'powerquery',
    kicker: 'Escena 5 · Conexión',
    titulo: 'Power Query: poco, a propósito',
    seg: 50,
    stage: 'pq',
    pq: { consulta: 'Liquidaciones', paso: 2 },
    foco: '#pq-pasos',
    decir: () => [
      'Los datos limpios entran a Power BI por <b>Power Query</b>. Aquí hago poco, a propósito: conecto los cuatro archivos, los leo en UTF-8 para que las tildes no se rompan y <b>asigno tipos</b>: fechas, números, verdadero o falso.',
      'Cada acción queda como un <b>paso aplicado</b> que se repite solo al actualizar. Y la carpeta de origen es un <b>parámetro</b>, RutaDatos: si el archivo se abre en otro computador, se cambia un valor y todo vuelve a funcionar.'
    ],
    hacer: ['Clic en «Origen», luego «Encabezados promovidos», luego «Tipo cambiado»: ver cómo cambian los íconos de tipo.', 'Clic en «RutaDatos» para mostrar el parámetro.'],
    pregunta: {
      q: '¿Por qué no limpiaste en Power Query?',
      a: 'Porque la limpieza tiene reglas que hay que revisar y repetir: nueve validaciones y una bitácora. En un script quedan escritas y versionadas. Power Query hace lo que mejor hace: conectar y tipar.'
    }
  },
  {
    id: 'modelo',
    kicker: 'Escena 6 · Modelo y DAX',
    titulo: 'Cinco tablas y doce medidas',
    seg: 50,
    stage: 'modelo',
    foco: '#modelo-diagrama',
    decir: (m) => [
      'El modelo tiene <b>cinco tablas</b>. La liquidación es la cabecera; de ella cuelgan sus servicios y sus cambios de estado, con relaciones de <b>uno a varios</b>. Un calendario propio ordena el tiempo.',
      'Los doce indicadores son <b>medidas en DAX</b>. Por ejemplo, el valor liquidado suma el total pero sin contar las anuladas: da {valorLiq}. Una medida no guarda un número: <b>lo recalcula según lo que esté filtrado</b>.'
    ],
    hacer: ['Señalar Liquidaciones → Items y Liquidaciones → Tiempos.', 'Señalar la medida «Valor liquidado» y su resultado.'],
    pregunta: {
      q: '¿Qué diferencia hay entre una medida y una columna calculada?',
      a: 'La columna se calcula una vez por fila y se guarda. La medida se calcula en el momento con los filtros activos. Por eso los indicadores son medidas.'
    }
  },
  {
    id: 'pagina1',
    kicker: 'Escena 7 · Página 1',
    titulo: 'Visión ejecutiva',
    seg: 70,
    stage: 'tablero',
    pagina: 1,
    filtros: { op: 'Todas', mes: null },
    foco: '#p1-tarjetas',
    decir: (m) => [
      'Primera página: <b>visión ejecutiva</b>, lo que se mira en treinta segundos.',
      'En {nMeses} meses se liquidaron <b>{valorLiq}</b>, con un ticket promedio de {ticket} por liquidación. Una liquidación tarda en promedio <b>{diasFact} días</b> desde que se elabora hasta que se factura.',
      'La línea compara lo liquidado con lo facturado mes a mes: donde las líneas se separan, hay liquidaciones que todavía no se facturan. Los filtros de período y operadora de arriba aplican a las tres páginas.'
    ],
    hacer: ['Cambiar la operadora a OPR-A y volver a «Todas» para mostrar que todo se recalcula.', 'Pasar el cursor por la línea mensual.'],
    pregunta: {
      q: '¿Por qué una línea para la evolución y columnas para la operadora?',
      a: 'El tipo de gráfico lo elige la pregunta: línea para cambio en el tiempo, barras para comparar categorías, tarjeta para un valor único.'
    }
  },
  {
    id: 'pagina2',
    kicker: 'Escena 8 · Profundizar',
    titulo: 'Del total al detalle',
    seg: 50,
    stage: 'tablero',
    pagina: 2,
    filtros: { op: 'Todas', mes: 'drill' },
    foco: '#p2-banner',
    decir: (m) => [
      'Si quiero entender un mes, hago clic derecho sobre él y <b>obtengo detalles</b>: paso a la página operacional ya filtrada, en este caso {mesDrill}.',
      'Aquí veo qué <b>vehículos y recorridos</b> concentran la facturación, cómo se reparte por tipo de tarifa y cuánto pesan los terceros: en los 24 meses, <b>{pctTerceros}</b> del valor de los servicios.'
    ],
    hacer: ['En el .pbix: clic derecho sobre el mes → Obtener detalles. Aquí: clic en un punto de la línea de la página 1.', 'Al terminar, quitar el filtro del mes con «✕».'],
    pregunta: {
      q: '¿Qué significa un vehículo con poca facturación?',
      a: 'Que está subutilizado: es la segunda mitad de la pregunta 4. Es un insumo para reasignar recorridos, no una conclusión sobre el conductor.'
    }
  },
  {
    id: 'atipicos',
    kicker: 'Escena 9 · Componente analítico',
    titulo: 'Atípicos antes de facturar',
    seg: 40,
    stage: 'tablero',
    pagina: 2,
    filtros: { op: 'Todas', mes: null },
    foco: '#p2-atipicos',
    decir: (m) => [
      'Esta tabla es el componente analítico: <b>{anom} servicios marcados como atípicos</b>, el {pctAnom} del total.',
      'El criterio es el <b>rango intercuartílico</b>: para cada tipo de tarifa calculo dónde está la mitad central de los valores, y lo que se aleja más de una vez y media ese rango queda marcado. Es simple a propósito: en un proceso que termina en una factura, <b>tengo que poder explicar por qué se marcó cada línea</b>.'
    ],
    hacer: ['Clic en «¿Cómo se marca?» para mostrar la caja con los límites.'],
    pregunta: {
      q: '¿Eso es inteligencia artificial?',
      a: 'El ejercicio aplica una regla estadística para marcar valores alejados del intervalo central. La alerta prioriza revisión humana; no demuestra que exista un error ni recomienda un ajuste comercial.'
    }
  },
  {
    id: 'pagina3',
    kicker: 'Escena 10 · Página 3',
    titulo: 'El cuello de botella',
    seg: 50,
    stage: 'tablero',
    pagina: 3,
    filtros: { op: 'Todas', mes: null },
    foco: '#p3-etapas',
    decir: (m) => [
      'Tercera página: tiempos. Este es <b>el hallazgo principal</b>.',
      'En el conjunto sintético, <b>{diasAprob} de los {diasFact} días promedio corresponden a la espera de aprobación</b>. Es la transición con mayor promedio en este ejercicio; no mide tiempos de una empresa.',
      'La línea de abajo muestra el ciclo mes a mes contra una referencia de quince días: <b>{mesesSobre} de {nMeses} meses</b> quedan por encima.'
    ],
    hacer: ['Señalar la barra ocre «LIQUIDADA → APROBADA».', 'Señalar la línea de referencia de 15 días.'],
    pregunta: {
      q: '¿De dónde sale la referencia de 15 días?',
      a: 'Es el punto de referencia definido en el entregable 3 para el indicador K04. Sin una referencia, un número solo es un número.'
    }
  },
  {
    id: 'cierre',
    kicker: 'Escena 11 · Cierre',
    titulo: 'Qué decisión cambia',
    seg: 40,
    stage: 'cierre',
    foco: '#cierre-decisiones',
    decir: () => [
      'Para cerrar: el tablero organiza <b>dos líneas de revisión</b> en los datos sintéticos: observar las transiciones entre estados y priorizar registros atípicos. No estima ahorros ni prescribe ajustes comerciales. Cualquier cambio requeriría validación con datos autorizados y responsables del proceso.',
      'Tiene tres limitaciones, y están documentadas: <b>datos sintéticos, un alcance cerrado en seis preguntas y un pipeline que se ejecuta bajo demanda</b>. Gracias.'
    ],
    hacer: ['Dejar esta pantalla quieta mientras llegan las preguntas.'],
    pregunta: {
      q: '¿Qué harías con más tiempo?',
      a: 'Programar el pipeline cada mes, incorporar el costo operativo para pasar de ingresos a márgenes y proyectar el valor a liquidar del mes siguiente.'
    }
  }
];
