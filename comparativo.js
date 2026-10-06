/**
 * Lê "Histórico" (formato longo) e "Mandatos" e gera a "Matriz Comparativa"
 * em formato de série anual lado a lado:
 *   Linha 1: nome do governo, mesclado sobre as colunas dos anos do mandato
 *   Linha 2: Área | Indicador | Unidade | 2011 | 2012 | ... | 2026
 *   Linhas seguintes: um indicador por linha, com o valor anual resumido
 *   conforme a "Agregação Anual" configurada na aba "Indicadores"
 *   (MEDIA, ACUMULADO ou ULTIMO — ver config.js), mais indicadores
 *   calculados que não vêm de nenhuma fonte (ex: Juros Real, derivado de
 *   outros dois indicadores já presentes — ver adicionarJurosReal_).
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

  /** Último ponto do ano (ex: taxas que a própria fonte já publica
   *  acumuladas/consolidadas, como o crescimento real do PIB do IBGE — o
   *  valor do 4º trimestre já É a taxa do ano; não há o que resumir). */
  function ultimoDoAno(pontos, ano) {
    const doAno = pontos.filter(p => p.data.getFullYear() === ano);
    if (doAno.length === 0) return "-";
    return doAno[doAno.length - 1].valor;
  }

  /** Para ACUMULADO: ano encerrado usa o calendário; ano em curso usa os
   *  últimos 12 meses disponíveis (janela "rolante"). */
  function janelaDoAno(pontos, ano) {
    return ano < anoAtual
      ? pontos.filter(p => p.data.getFullYear() === ano)
      : pontos.slice(-12);
  }

  function valorDoAno(g, ano) {
    if (ano > anoAtual && g.agregacao === "ACUMULADO") return "-"; // ano futuro, sem dados ainda
    if (g.agregacao === "ACUMULADO") return acumulado(janelaDoAno(g.pontos, ano));
    if (g.agregacao === "ULTIMO") return ultimoDoAno(g.pontos, ano);
    return mediaDoAno(g.pontos, ano);
  }

  const linhasDados = grupos.map(g => {
    // ACUMULADO sempre resulta em variação percentual, mesmo quando o dado
    // bruto (em Histórico) tem outra unidade (ex: R$ milhões).
    const unidadeExibida = g.agregacao === "ACUMULADO" ? "%" : g.unidade;
    const linha = [g.area, g.indicador, unidadeExibida];
    anos.forEach(ano => linha.push(valorDoAno(g, ano)));
    return linha;
  });

  adicionarJurosReal_(grupos, anos, valorDoAno, linhasDados);
  adicionarCestasPorSalarioMinimo_(grupos, anos, valorDoAno, linhasDados);

  // Ordena por Área e, dentro da área, por Indicador (colunas A e B).
  linhasDados.sort((a, b) => a[0].localeCompare(b[0], "pt-BR") || a[1].localeCompare(b[1], "pt-BR"));

  const sheet = getOrCreateSheet_(SHEETS.MATRIZ_COMPARATIVA);
  escreverMatrizComAnos_(sheet, mandatos, anos, linhasDados);

  Logger.log(`Matriz Comparativa gerada com ${linhasDados.length} indicador(es) e ${anos.length} ano(s) (${anoInicial}–${anoFinal}).`);
}

/**
 * Indicador calculado (não vem de nenhuma fonte/Histórico): Juros Real, via
 * equação de Fisher a partir dos valores anuais já calculados de "IPCA" e
 * "Taxa Selic (Meta) — Média Anual". Se qualquer um dos dois nomes não for
 * encontrado (ex: foram renomeados), não adiciona linha nenhuma — só avisa
 * no log, em vez de quebrar a geração da matriz inteira.
 */
function adicionarJurosReal_(grupos, anos, valorDoAno, linhasDados) {
  const grupoIpca = grupos.find(g => g.indicador === "IPCA");
  const grupoSelic = grupos.find(g => g.indicador === "Taxa Selic (Meta) — Média Anual");
  if (!grupoIpca || !grupoSelic) {
    Logger.log('Juros Real não calculado: indicador "IPCA" e/ou "Taxa Selic (Meta) — Média Anual" não encontrado em Histórico.');
    return;
  }

  const linha = ["Economia", "Juros Real (Selic − IPCA, Fisher)", "%"];
  anos.forEach(ano => {
    const selic = valorDoAno(grupoSelic, ano);
    const ipca = valorDoAno(grupoIpca, ano);
    if (selic === "-" || ipca === "-") {
      linha.push("-");
      return;
    }
    const jurosReal = ((1 + selic / 100) / (1 + ipca / 100) - 1) * 100;
    linha.push(Number(jurosReal.toFixed(2)));
  });
  linhasDados.push(linha);
}

/**
 * Indicador calculado: quantas Cestas Básicas (São Paulo) um Salário Mínimo
 * compra, dividindo os valores anuais já calculados dos dois indicadores.
 * "Preço da Cesta Básica (São Paulo)" é MANUAL (sem API — ver README); se a
 * aba "Importação Manual" não tiver sido preenchida com valores reais do
 * DIEESE, o indicador não aparece (sem dado) em vez de aparecer com "-".
 */
function adicionarCestasPorSalarioMinimo_(grupos, anos, valorDoAno, linhasDados) {
  const grupoSalario = grupos.find(g => g.indicador === "Salário Mínimo (R$)");
  const grupoCesta = grupos.find(g => g.indicador === "Preço da Cesta Básica (São Paulo)");
  if (!grupoSalario || !grupoCesta) {
    Logger.log('Cestas por Salário Mínimo não calculado: indicador "Salário Mínimo (R$)" e/ou "Preço da Cesta Básica (São Paulo)" não encontrado em Histórico.');
    return;
  }

  const linha = ["Economia", "Cestas Básicas por Salário Mínimo (SP)", "cestas"];
  anos.forEach(ano => {
    const salario = valorDoAno(grupoSalario, ano);
    const cesta = valorDoAno(grupoCesta, ano);
    linha.push(salario === "-" || cesta === "-" || cesta === 0 ? "-" : Number((salario / cesta).toFixed(2)));
  });
  linhasDados.push(linha);
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
