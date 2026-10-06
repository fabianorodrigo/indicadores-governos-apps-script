/**
 * Menu da planilha e criação/seed das abas de configuração
 * (Mandatos, Indicadores, Importação Manual).
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Indicadores de Governos")
    .addItem("1. Configurar planilhas iniciais", "configurarProjeto")
    .addSeparator()
    .addItem("2. Atualizar indicadores (APIs)", "atualizarIndicadores")
    .addItem("3. Gerar matriz comparativa", "gerarMatrizComparativa")
    .addSeparator()
    .addItem("Atualizar tudo agora", "executarFluxoCompleto")
    .addItem("Configurar atualização automática mensal", "configurarGatilhoMensal")
    .addToUi();
}

function executarFluxoCompleto() {
  atualizarIndicadores();
  gerarMatrizComparativa();
}

/** Cria (se ainda não existirem) as abas de configuração com dados de exemplo. */
function configurarProjeto() {
  criarAbaMandatos_();
  criarAbaIndicadores_();
  atualizarColunaAgregacao_();
  criarAbaImportacaoManual_();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Planilhas de configuração prontas. Edite 'Mandatos' e 'Indicadores' e depois rode 'Atualizar tudo agora'."
  );
}

/**
 * Migração: garante a coluna "Agregação Anual" (10ª coluna) em uma aba
 * "Indicadores" já existente, sem sobrescrever valores que o usuário já
 * tenha preenchido. Preenche em branco com "MEDIA", exceto "IPCA Mensal",
 * que recebe "ACUMULADO" (acumulado composto do ano / últimos 12 meses).
 */
function atualizarColunaAgregacao_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INDICADORES);
  if (!sheet) return;

  const headerCell = sheet.getRange(1, 10);
  if (!headerCell.getValue()) {
    headerCell.setValue("Agregação Anual").setFontWeight("bold").setBackground("#f3f3f3");
  }

  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (!dados[i][0]) continue; // linha vazia
    const valorAtual = sheet.getRange(i + 1, 10).getValue();
    if (!valorAtual) {
      const padrao = dados[i][1] === "IPCA Mensal" ? "ACUMULADO" : "MEDIA";
      sheet.getRange(i + 1, 10).setValue(padrao);
    }
  }
  sheet.autoResizeColumns(1, 10);
}

function criarAbaMandatos_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(SHEETS.MANDATOS)) return;
  const sheet = ss.insertSheet(SHEETS.MANDATOS);
  writeHeaderedTable_(
    sheet,
    ["Nome do Governo", "Data Início (AAAA-MM-DD)", "Data Fim (AAAA-MM-DD)"],
    [
      ["Governo A (2015-2018)", "2015-01-01", "2018-12-31"],
      ["Governo B (2019-2022)", "2019-01-01", "2022-12-31"]
    ]
  );
}

function criarAbaIndicadores_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(SHEETS.INDICADORES)) return;
  const sheet = ss.insertSheet(SHEETS.INDICADORES);
  const headers = ["Área", "Indicador", "Fonte", "Parâmetro 1", "Parâmetro 2", "Parâmetro 3", "Unidade", "Periodicidade", "Ativo", "Agregação Anual"];
  const linhas = [
    // Fonte BCB: Parâmetro 1 = código da série SGS.
    // Agregação Anual = ACUMULADO: a Matriz Comparativa soma os meses de
    // forma composta (acumulado do ano); no ano em curso, usa os últimos
    // 12 meses disponíveis em vez do ano calendário incompleto.
    ["Economia", "IPCA Mensal", "BCB", 433, "", "", "%", "Mensal", true, "ACUMULADO"],
    ["Economia", "Taxa Selic (Meta)", "BCB", 432, "", "", "% a.a.", "Mensal", true, "MEDIA"],
    ["Economia", "Dívida Bruta do Governo Geral", "BCB", 13762, "", "", "% PIB", "Mensal", true, "MEDIA"],
    ["Economia", "PIB Mensal (Banco Central)", "BCB", 4380, "", "", "R$ milhões", "Mensal", true, "MEDIA"],
    // Fonte SIDRA: Parâmetro 1 = agregado, Parâmetro 2 = variável, Parâmetro 3 = localidade.
    ["Economia", "Taxa de Desocupação", "SIDRA", 6468, 4099, "N1[all]", "%", "Trimestral", true, "MEDIA"],
    ["Economia", "Índice de Gini (desigualdade de renda)", "SIDRA", 7435, 10681, "N1[all]", "índice", "Anual", true, "MEDIA"],
    ["Segurança", "Taxa de Homicídios Intencionais (ODS 16.1.1)", "SIDRA", 6606, 13532, "N1[all]", "óbitos por 100 mil hab.", "Anual", true, "MEDIA"],
    // Tabela SIDRA 3834 foi descontinuada pelo IBGE em 2016 — ainda assim é um
    // histórico oficial real; valores de 2017 em diante exigem outra fonte.
    ["Saúde", "Taxa de Mortalidade Infantil", "SIDRA", 3834, 1940, "N1[all]", "‰ (por mil nasc. vivos)", "Anual", true, "MEDIA"],
    // Fonte MANUAL: sem API pública estável de série histórica pronta para uso;
    // valores vêm da aba "Importação Manual" (ver README para as fontes oficiais).
    ["Educação", "Ideb — Anos Iniciais (Rede Pública)", "MANUAL", "", "", "", "índice", "Bienal", true, "MEDIA"],
    ["Educação", "Taxa de Analfabetismo (15 anos ou +)", "MANUAL", "", "", "", "%", "Anual", true, "MEDIA"],
    ["Saúde", "Expectativa de Vida ao Nascer", "MANUAL", "", "", "", "anos", "Anual", true, "MEDIA"],
    ["Meio Ambiente", "Área Desmatada — Amazônia Legal", "MANUAL", "", "", "", "km²", "Anual", true, "MEDIA"]
  ];
  writeHeaderedTable_(sheet, headers, linhas);
}

function criarAbaImportacaoManual_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(SHEETS.IMPORTACAO_MANUAL)) return;
  const sheet = ss.insertSheet(SHEETS.IMPORTACAO_MANUAL);
  writeHeaderedTable_(
    sheet,
    ["Indicador", "Data (AAAA-MM-DD)", "Valor", "Fonte/Observação"],
    [
      ["Ideb — Anos Iniciais (Rede Pública)", "2021-01-01", 5.8, "INEP (inep.gov.br)"],
      ["Expectativa de Vida ao Nascer", "2021-01-01", 76.4, "IBGE — Tábuas de Mortalidade (ibge.gov.br)"]
    ]
  );
}

/** (Re)agenda a execução automática mensal de atualizarIndicadores + gerarMatrizComparativa. */
function configurarGatilhoMensal() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "executarFluxoCompleto") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("executarFluxoCompleto")
    .timeBased()
    .onMonthDay(1)
    .atHour(3)
    .create();
  Logger.log("Gatilho mensal configurado para o dia 1 de cada mês às 03:00.");
}
