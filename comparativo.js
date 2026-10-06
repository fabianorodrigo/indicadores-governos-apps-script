/**
 * Lê "Histórico" (formato longo) e "Mandatos" e gera a "Matriz Comparativa"
 * em formato de série anual lado a lado:
 *   Linha 1: nome do governo, mesclado sobre as colunas dos anos do mandato
 *   Linha 2: Área | Indicador | Unidade | 2011 | 2012 | ... | 2026
 *   Linhas seguintes: um indicador por linha, com o valor anual resumido
 *   conforme a "Agregação Anual" configurada na aba "Indicadores"
 *   (MEDIA ou ACUMULADO — ver config.js).
 */
function gerarMatrizComparativa() {
  const mandatos = getMandatos();
  const historicoSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.HISTORICO);

  if (mandatos.length === 0) {
    Logger.log('Nenhum mandato configurado na aba "Mandatos".');
    return;
  }
  if (!historicoSheet) {
    Logger.log('Aba "Histórico" não encontrada. Rode atualizarIndicadores() primeiro.');
    return;
  }

  const agregacaoPorChave = {};
  getIndicadoresConfig().forEach(ind => {
    agregacaoPorChave[`${ind.area}||${ind.indicador}`] = ind.agregacao;
  });

  const registros = historicoSheet.getDataRange().getValues().slice(1)
    .filter(r => r[0])
    .map(r => ({ data: parseIsoDate_(r[0]), area: r[1], indicador: r[2], valor: Number(r[3]), unidade: r[4] }));

  const anoInicial = Math.min(...mandatos.map(m => m.inicio.getFullYear()));
  const anoFinal = Math.max(...mandatos.map(m => m.fim.getFullYear()));
  const anos = [];
  for (let ano = anoInicial; ano <= anoFinal; ano++) anos.push(ano);
  const anoAtual = new Date().getFullYear();

  // Agrupa por Área + Indicador, preservando a ordem de primeira aparição.
  // Os pontos já chegam ordenados por data, pois sincronizacao.js ordena o Histórico.
  const grupos = [];
  const indiceGrupo = {};
  registros.forEach(r => {
    const chave = `${r.area}||${r.indicador}`;
    if (!(chave in indiceGrupo)) {
      indiceGrupo[chave] = grupos.length;
      grupos.push({
        area: r.area,
        indicador: r.indicador,
        unidade: r.unidade,
        agregacao: agregacaoPorChave[chave] || "MEDIA",
        pontos: []
      });
    }
    grupos[indiceGrupo[chave]].pontos.push(r);
  });

  function mediaDoAno(pontos, ano) {
    const doAno = pontos.filter(p => p.data.getFullYear() === ano);
    if (doAno.length === 0) return "-";
    const soma = doAno.reduce((acc, p) => acc + p.valor, 0);
    return Number((soma / doAno.length).toFixed(2));
  }

  /** Acumulado composto (ex: IPCA): (1+v1%)*(1+v2%)*...*(1+vn%) - 1. */
  function acumulado(pontos) {
    if (pontos.length === 0) return "-";
    const fator = pontos.reduce((acc, p) => acc * (1 + p.valor / 100), 1);
    return Number(((fator - 1) * 100).toFixed(2));
  }

  function valorDoAno(g, ano) {
    if (g.agregacao !== "ACUMULADO") return mediaDoAno(g.pontos, ano);

    if (ano > anoAtual) return "-"; // ano futuro, sem dados ainda

    if (ano < anoAtual) {
      // Ano encerrado: acumulado do calendário (Jan-Dez daquele ano).
      return acumulado(g.pontos.filter(p => p.data.getFullYear() === ano));
    }

    // Ano em curso (ainda não encerrado): acumulado dos últimos 12 meses
    // disponíveis, mesmo que isso inclua meses do ano anterior.
    return acumulado(g.pontos.slice(-12));
  }

  const linhasDados = grupos.map(g => {
    const linha = [g.area, g.indicador, g.unidade];
    anos.forEach(ano => linha.push(valorDoAno(g, ano)));
    return linha;
  });

  const sheet = getOrCreateSheet_(SHEETS.MATRIZ_COMPARATIVA);
  escreverMatrizComAnos_(sheet, mandatos, anos, linhasDados);

  Logger.log(`Matriz Comparativa gerada com ${linhasDados.length} indicador(es) e ${anos.length} ano(s) (${anoInicial}–${anoFinal}).`);
}

/** Retorna o mandato com mais dias de overlap com o ano informado, ou null. */
function mandatoDoAno_(ano, mandatos) {
  const inicioAno = new Date(ano, 0, 1);
  const fimAno = new Date(ano, 11, 31);
  let melhor = null;
  let melhorDias = 0;
  mandatos.forEach(m => {
    const inicioOverlap = m.inicio > inicioAno ? m.inicio : inicioAno;
    const fimOverlap = m.fim < fimAno ? m.fim : fimAno;
    const dias = (fimOverlap - inicioOverlap) / 86400000;
    if (dias > 0 && dias > melhorDias) {
      melhorDias = dias;
      melhor = m;
    }
  });
  return melhor;
}

function escreverMatrizComAnos_(sheet, mandatos, anos, linhasDados) {
  sheet.clear();
  // Remove merges de uma execução anterior com uma quantidade diferente de anos/colunas.
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();

  const totalCols = 3 + anos.length;

  // Linha 1: nome do governo, mesclado sobre as colunas dos anos do seu mandato.
  sheet.getRange(1, 1, 1, totalCols).setValues([new Array(totalCols).fill("")]);
  let coluna = 4; // colunas 1-3 (A-C) são Área/Indicador/Unidade; anos começam na D
  let i = 0;
  while (i < anos.length) {
    const mandato = mandatoDoAno_(anos[i], mandatos);
    let j = i;
    while (j + 1 < anos.length && mandatoDoAno_(anos[j + 1], mandatos) === mandato) j++;
    const largura = j - i + 1;
    if (mandato) {
      sheet.getRange(1, coluna, 1, largura)
        .merge()
        .setValue(mandato.nome)
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setBackground("#f3f3f3");
    }
    coluna += largura;
    i = j + 1;
  }

  // Linha 2: cabeçalhos de coluna e os anos.
  sheet.getRange(2, 1, 1, totalCols)
    .setValues([["Área", "Indicador", "Unidade", ...anos]])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");

  // Linhas de dados: um indicador por linha, valores por ano.
  if (linhasDados.length > 0) {
    sheet.getRange(3, 1, linhasDados.length, totalCols).setValues(linhasDados);
  }

  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(3);
  sheet.autoResizeColumns(1, totalCols);
}
