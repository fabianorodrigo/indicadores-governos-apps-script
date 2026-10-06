/**
 * Menu da planilha e criação/seed das abas de configuração
 * (Mandatos, Indicadores, Importação Manual).
 */

// Indicadores adicionados depois da primeira versão da planilha: usados no
// seed de uma aba nova (criarAbaIndicadores_) e também na migração de uma
// aba "Indicadores" já existente (configurarProjeto → adicionarIndicadorSeNaoExiste_),
// para não duplicar a lista em dois lugares.
const NOVOS_INDICADORES_ECONOMICOS = [
  ["Economia", "Câmbio USD/BRL (Venda) — Média Anual", "BCB", 1, "", "", "R$", "Diária", true, "MEDIA", ""],
  ["Economia", "Reservas Internacionais (Final do Ano)", "BCB", 13621, "", "", "US$ milhões", "Diária", true, "ULTIMO", ""],
  // "% PIB, acumulado em 12 meses" já publicado assim pelo BCB — ULTIMO pega
  // o valor do mês mais recente do ano, que já É o acumulado dos 12 meses.
  // Código NEGATIVO (-5793): a série do BCB é "Necessidade de Financiamento
  // do Setor Público" (NFSP), onde positivo = déficit — invertido em relação
  // ao "Resultado" fiscal (negativo = déficit) que é o que todo mundo
  // divulga. FonteBcb.fetchSerie inverte o sinal quando o código é negativo.
  ["Economia", "Resultado Primário (% PIB, Acum. 12m)", "BCB", -5793, "", "", "% PIB", "Mensal", true, "ULTIMO", ""],
  // Mesma família de série do Resultado Primário (5793), só troca "primário"
  // por "nominal" — resultado primário menos os juros nominais da dívida.
  // Mesmo motivo do sinal negativo acima.
  ["Economia", "Resultado Nominal (% PIB, Acum. 12m)", "BCB", -5727, "", "", "% PIB", "Mensal", true, "ULTIMO", ""],
  // Mesma tabela SIDRA do PIB (5932/6563), só troca a classificação para
  // "Formação bruta de capital fixo" — mesmo raciocínio de ULTIMO do PIB.
  ["Economia", "Investimento (FBCF) — Crescimento Real", "SIDRA", 5932, 6563, "N1[all]", "%", "Trimestral", true, "ULTIMO", "11255[93406]"],
  // Indicador ODS 1.2.1 do IBGE. Apesar do nome da tabela do IBGE ("linha
  // nacional"), é a linha do Banco Mundial de US$6,85 PPC/dia — a mais alta
  // das linhas padrão do Banco Mundial, por isso dá números bem maiores que
  // a de extrema pobreza abaixo. Tabela simples, sem classificação a
  // filtrar — mesmo padrão do Índice de Gini.
  ["Economia", "Taxa de Pobreza (US$ 6,85 PPC/dia)", "SIDRA", 5877, 9948, "N1[all]", "%", "Anual", true, "MEDIA", ""],
  // Indicador ODS 1.1.1 do IBGE — a linha de extrema pobreza do Banco
  // Mundial (US$2,15 PPC/dia). O IBGE chama essa de "linha de pobreza
  // internacional", mas semanticamente é a extrema pobreza (meta 1.1 dos ODS).
  ["Economia", "Taxa de Extrema Pobreza (US$ 2,15 PPC/dia)", "SIDRA", 5817, 9617, "N1[all]", "%", "Anual", true, "MEDIA", ""],
  // Usado também pelo indicador calculado "Cestas Básicas por Salário
  // Mínimo" (ver adicionarCestasPorSalarioMinimo_ em comparativo.js).
  ["Economia", "Salário Mínimo (R$)", "BCB", 1619, "", "", "R$", "Mensal", true, "ULTIMO", ""],
  // Sem API: o DIEESE (única referência no Brasil) só publica em PDF mensal
  // por capital, e descontinuou o banco histórico público em 2018. Valores
  // vêm da aba "Importação Manual" (ver dieese.org.br/analisecestabasica).
  ["Economia", "Preço da Cesta Básica (São Paulo)", "MANUAL", "", "", "", "R$", "Mensal", true, "ULTIMO", ""]
];

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
  adicionarColunaClassificacaoSidra_();
  renomearIndicador_("IPCA Mensal", "IPCA");
  renomearIndicador_("Taxa Selic (Meta)", "Taxa Selic (Meta) — Média Anual");
  renomearIndicador_("Taxa de Pobreza (Linha Nacional)", "Taxa de Pobreza (US$ 6,85 PPC/dia)");
  migrarIndicadorPib_();
  NOVOS_INDICADORES_ECONOMICOS.forEach(adicionarIndicadorSeNaoExiste_);
  inverterSinalSeNecessario_("Resultado Primário (% PIB, Acum. 12m)");
  inverterSinalSeNecessario_("Resultado Nominal (% PIB, Acum. 12m)");
  criarAbaImportacaoManual_();
  adicionarLinhaManualSeIndicadorNaoExiste_([
    "Preço da Cesta Básica (São Paulo)", "2024-12-01", 800.00, "EXEMPLO — substitua pelo valor real de dieese.org.br/analisecestabasica"
  ]);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Planilhas de configuração prontas. Edite 'Mandatos' e 'Indicadores' e depois rode 'Atualizar tudo agora'."
  );
}

/**
 * Migração: garante a coluna "Agregação Anual" (10ª coluna) em uma aba
 * "Indicadores" já existente, sem sobrescrever valores que o usuário já
 * tenha preenchido. Preenche em branco com "MEDIA", exceto o indicador do
 * IPCA, que recebe "ACUMULADO" (acumulado composto do ano / últimos 12 meses).
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
      const padrao = (dados[i][1] === "IPCA Mensal" || dados[i][1] === "IPCA") ? "ACUMULADO" : "MEDIA";
      sheet.getRange(i + 1, 10).setValue(padrao);
    }
  }
  sheet.autoResizeColumns(1, 10);
}

/** Migração: renomeia um indicador existente na aba "Indicadores" (coluna B). */
function renomearIndicador_(nomeAntigo, nomeNovo) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INDICADORES);
  if (!sheet) return;
  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][1] === nomeAntigo) {
      sheet.getRange(i + 1, 2).setValue(nomeNovo);
    }
  }
}

/**
 * Migração: garante que o "Parâmetro 1" (coluna D, código da série BCB) de
 * um indicador esteja negativo — usado quando se descobre, depois da linha
 * já ter sido adicionada, que a série tem convenção de sinal invertida (ver
 * FonteBcb.fetchSerie). Não faz nada se já estiver negativo ou a linha não
 * existir.
 */
function inverterSinalSeNecessario_(nomeIndicador) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INDICADORES);
  if (!sheet) return;
  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][1] === nomeIndicador) {
      const atual = Number(dados[i][3]);
      if (atual > 0) sheet.getRange(i + 1, 4).setValue(-atual);
    }
  }
}

/**
 * Migração: garante a coluna "Parâmetro 4 (Classificação SIDRA)" (11ª
 * coluna) em uma aba "Indicadores" já existente, sem sobrescrever valores
 * que o usuário já tenha preenchido.
 */
function adicionarColunaClassificacaoSidra_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INDICADORES);
  if (!sheet) return;
  const headerCell = sheet.getRange(1, 11);
  if (!headerCell.getValue()) {
    headerCell.setValue("Parâmetro 4 (Classificação SIDRA)").setFontWeight("bold").setBackground("#f3f3f3");
  }
  sheet.autoResizeColumns(1, 11);
}

/**
 * Migração: substitui a configuração do indicador de PIB pela correta —
 * crescimento real do PIB publicado pelo IBGE (SIDRA 5932/6563, "PIB a
 * preços de mercado"), em vez do nível nominal do Banco Central (BCB 4380)
 * com cálculo de crescimento próprio. Sobrescreve a linha inteira, pois a
 * fonte/parâmetros/unidade/agregação mudam todos juntos.
 */
function migrarIndicadorPib_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INDICADORES);
  if (!sheet) return;
  const nomesAntigos = ["PIB Mensal (Banco Central)", "PIB (Banco Central)"];
  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (nomesAntigos.includes(dados[i][1])) {
      sheet.getRange(i + 1, 1, 1, 11).setValues([
        ["Economia", "PIB (Crescimento Real)", "SIDRA", 5932, 6563, "N1[all]", "%", "Trimestral", true, "ULTIMO", "11255[90707]"]
      ]);
    }
  }
}

/**
 * Migração: adiciona uma linha de indicador ao final da aba "Indicadores"
 * se ainda não existir uma com o mesmo nome (coluna B) — não duplica em
 * reexecuções e não toca em indicadores que o usuário já tenha.
 */
function adicionarIndicadorSeNaoExiste_(linha) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INDICADORES);
  if (!sheet) return;
  const dados = sheet.getDataRange().getValues();
  const jaExiste = dados.slice(1).some(r => r[1] === linha[1]);
  if (jaExiste) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, linha.length).setValues([linha]);
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
  const headers = ["Área", "Indicador", "Fonte", "Parâmetro 1", "Parâmetro 2", "Parâmetro 3", "Unidade", "Periodicidade", "Ativo", "Agregação Anual", "Parâmetro 4 (Classificação SIDRA)"];
  const linhas = [
    // Fonte BCB: Parâmetro 1 = código da série SGS.
    // Agregação Anual = ACUMULADO: a Matriz Comparativa soma os meses de
    // forma composta (acumulado do ano); no ano em curso, usa os últimos
    // 12 meses disponíveis em vez do ano calendário incompleto.
    ["Economia", "IPCA", "BCB", 433, "", "", "%", "Mensal", true, "ACUMULADO", ""],
    ["Economia", "Taxa Selic (Meta) — Média Anual", "BCB", 432, "", "", "% a.a.", "Diária", true, "MEDIA", ""],
    ["Economia", "Dívida Bruta do Governo Geral", "BCB", 13762, "", "", "% PIB", "Mensal", true, "MEDIA", ""],
    // Fonte SIDRA: Parâmetro 1 = agregado, Parâmetro 2 = variável, Parâmetro 3 = localidade.
    // Agregação Anual = ULTIMO: o IBGE já publica essa taxa acumulada ao
    // longo do ano; o valor do 4º trimestre já É a variação real anual do
    // PIB (bate com os números oficiais — ver README). Parâmetro 4 filtra a
    // tabela para a categoria "PIB a preços de mercado".
    ["Economia", "PIB (Crescimento Real)", "SIDRA", 5932, 6563, "N1[all]", "%", "Trimestral", true, "ULTIMO", "11255[90707]"],
    ...NOVOS_INDICADORES_ECONOMICOS,
    ["Economia", "Taxa de Desocupação", "SIDRA", 6468, 4099, "N1[all]", "%", "Trimestral", true, "MEDIA", ""],
    ["Economia", "Índice de Gini (desigualdade de renda)", "SIDRA", 7435, 10681, "N1[all]", "índice", "Anual", true, "MEDIA", ""],
    ["Segurança", "Taxa de Homicídios Intencionais (ODS 16.1.1)", "SIDRA", 6606, 13532, "N1[all]", "óbitos por 100 mil hab.", "Anual", true, "MEDIA", ""],
    // Tabela SIDRA 3834 foi descontinuada pelo IBGE em 2016 — ainda assim é um
    // histórico oficial real; valores de 2017 em diante exigem outra fonte.
    ["Saúde", "Taxa de Mortalidade Infantil", "SIDRA", 3834, 1940, "N1[all]", "‰ (por mil nasc. vivos)", "Anual", true, "MEDIA", ""],
    // Fonte MANUAL: sem API pública estável de série histórica pronta para uso;
    // valores vêm da aba "Importação Manual" (ver README para as fontes oficiais).
    ["Educação", "Ideb — Anos Iniciais (Rede Pública)", "MANUAL", "", "", "", "índice", "Bienal", true, "MEDIA", ""],
    ["Educação", "Taxa de Analfabetismo (15 anos ou +)", "MANUAL", "", "", "", "%", "Anual", true, "MEDIA", ""],
    ["Saúde", "Expectativa de Vida ao Nascer", "MANUAL", "", "", "", "anos", "Anual", true, "MEDIA", ""],
    ["Meio Ambiente", "Área Desmatada — Amazônia Legal", "MANUAL", "", "", "", "km²", "Anual", true, "MEDIA", ""]
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
      ["Expectativa de Vida ao Nascer", "2021-01-01", 76.4, "IBGE — Tábuas de Mortalidade (ibge.gov.br)"],
      ["Preço da Cesta Básica (São Paulo)", "2024-12-01", 800.00, "EXEMPLO — substitua pelo valor real de dieese.org.br/analisecestabasica"]
    ]
  );
}

/**
 * Migração: adiciona uma linha de exemplo na aba "Importação Manual" se
 * ainda não houver nenhuma linha para aquele indicador (coluna A) — para
 * quem já tinha a aba criada antes de um novo indicador manual existir.
 */
function adicionarLinhaManualSeIndicadorNaoExiste_(linha) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.IMPORTACAO_MANUAL);
  if (!sheet) return;
  const dados = sheet.getDataRange().getValues();
  const jaExiste = dados.slice(1).some(r => r[0] === linha[0]);
  if (jaExiste) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, linha.length).setValues([linha]);
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
