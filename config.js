/**
 * Configuração central do projeto: nomes de abas, utilitários de planilha
 * e leitura das abas de configuração (Mandatos, Indicadores).
 */

const SHEETS = {
  MANDATOS: "Mandatos",
  INDICADORES: "Indicadores",
  IMPORTACAO_MANUAL: "Importação Manual",
  HISTORICO: "Histórico",
  MATRIZ_COMPARATIVA: "Matriz Comparativa"
};

const FONTES = {
  BCB: "BCB",
  SIDRA: "SIDRA",
  MANUAL: "MANUAL"
};

function getOrCreateSheet_(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(nome);
  if (!sheet) sheet = ss.insertSheet(nome);
  return sheet;
}

/** Limpa a aba e escreve um cabeçalho em negrito seguido das linhas de dados. */
function writeHeaderedTable_(sheet, headers, rows) {
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.autoResizeColumns(1, headers.length);
  sheet.setFrozenRows(1);
}

/** Converte "AAAA-MM-DD" (ou um Date já existente) em objeto Date à meia-noite. */
function parseIsoDate_(value) {
  if (value instanceof Date) return value;
  const parts = String(value).split("-").map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function formatIsoDate_(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Lê a aba "Mandatos" e retorna [{ nome, inicio: Date, fim: Date }]. */
function getMandatos() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MANDATOS);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues().slice(1);
  return rows
    .filter(r => r[0])
    .map(r => ({
      nome: String(r[0]),
      inicio: parseIsoDate_(r[1]),
      fim: parseIsoDate_(r[2])
    }));
}

/**
 * Lê a aba "Indicadores" e retorna a configuração de cada indicador ativo.
 * Colunas: Área, Indicador, Fonte, Parâmetro 1, Parâmetro 2, Parâmetro 3,
 * Unidade, Periodicidade, Ativo, Agregação Anual, Parâmetro 4 (Classificação SIDRA).
 *
 * Agregação Anual controla como a Matriz Comparativa resume pontos
 * sub-anuais (mensais/trimestrais) em um único valor por ano:
 * - "MEDIA" (padrão): média aritmética dos pontos do ano.
 * - "ACUMULADO": acumulado composto do ano (ex: IPCA); para o ano em curso
 *   (ainda não encerrado), usa o acumulado dos últimos 12 meses disponíveis.
 * - "ULTIMO": último ponto disponível do ano (ex: taxas que já vêm
 *   acumuladas/consolidadas na própria fonte, como o crescimento real do
 *   PIB do IBGE — o valor do 4º trimestre já É a taxa anual).
 *
 * Parâmetro 4 é opcional: usado só por fontes SIDRA cuja tabela exige um
 * filtro de classificação (ex: "11255[90707]" para escolher "PIB a preços
 * de mercado" dentro de uma tabela com várias categorias).
 */
function getIndicadoresConfig() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INDICADORES);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues().slice(1);
  return rows
    .filter(r => r[0] && String(r[8]).toUpperCase() !== "FALSE")
    .map(r => ({
      area: String(r[0]),
      indicador: String(r[1]),
      fonte: String(r[2]).toUpperCase(),
      parametro1: r[3],
      parametro2: r[4],
      parametro3: r[5],
      unidade: String(r[6] || ""),
      periodicidade: String(r[7] || ""),
      agregacao: r[9] ? String(r[9]).toUpperCase() : "MEDIA",
      parametro4: r[10] || ""
    }));
}
