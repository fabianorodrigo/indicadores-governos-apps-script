/**
 * Fonte: Importação Manual — para indicadores sem API pública estável
 * (ex: Ideb/INEP, DATASUS, SSP/SINESP, Fórum Brasileiro de Segurança Pública,
 * PRODES/INPE). O usuário baixa os dados oficiais e cola os valores na aba
 * "Importação Manual"; a sincronização apenas lê essa aba.
 */
const FonteManual = {
  /** Retorna [{ data: Date, valor: Number }] filtrando pela coluna "Indicador". */
  fetchSerie(nomeIndicador) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.IMPORTACAO_MANUAL);
    if (!sheet) return [];
    const rows = sheet.getDataRange().getValues().slice(1);
    return rows
      .filter(r => r[0] === nomeIndicador && r[1])
      .map(r => ({ data: parseIsoDate_(r[1]), valor: Number(r[2]) }))
      .filter(item => !isNaN(item.valor));
  }
};
