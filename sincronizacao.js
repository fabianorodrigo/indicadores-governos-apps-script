/**
 * Orquestra a busca de todos os indicadores ativos (aba "Indicadores")
 * e consolida o resultado na aba "Histórico" (formato longo: uma linha
 * por Data x Área x Indicador).
 */
function atualizarIndicadores() {
  const config = getIndicadoresConfig();
  if (config.length === 0) {
    Logger.log('Nenhum indicador configurado. Rode configurarProjeto() primeiro.');
    return;
  }

  const linhas = [];

  config.forEach(ind => {
    let serie = [];
    switch (ind.fonte) {
      case FONTES.BCB:
        serie = FonteBcb.fetchSerie(ind.parametro1);
        break;
      case FONTES.SIDRA:
        serie = FonteSidra.fetchSerie(ind.parametro1, ind.parametro2, ind.parametro3);
        break;
      case FONTES.MANUAL:
        serie = FonteManual.fetchSerie(ind.indicador);
        break;
      default:
        Logger.log(`Fonte desconhecida "${ind.fonte}" para o indicador "${ind.indicador}".`);
    }

    serie.forEach(ponto => {
      linhas.push([formatIsoDate_(ponto.data), ind.area, ind.indicador, ponto.valor, ind.unidade]);
    });

    Logger.log(`${ind.indicador}: ${serie.length} ponto(s) importado(s) (fonte ${ind.fonte}).`);
  });

  linhas.sort((a, b) => (a[1] + a[2] + a[0]).localeCompare(b[1] + b[2] + b[0]));

  const sheet = getOrCreateSheet_(SHEETS.HISTORICO);
  writeHeaderedTable_(sheet, ["Data", "Área", "Indicador", "Valor", "Unidade"], linhas);

  Logger.log(`Histórico atualizado com ${linhas.length} registro(s) em ${new Date()}.`);
}
