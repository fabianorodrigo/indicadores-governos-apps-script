/**
 * Fonte: IBGE — API SIDRA (Sistema IBGE de Recuperação Automática de Dados Agregados).
 * Documentação: https://servicodados.ibge.gov.br/api/docs/agregados
 *
 * Cobre indicadores sociais e econômicos publicados pelo IBGE (ex: taxa de
 * desocupação, índice de Gini). Não cobre dados de educação (INEP), saúde
 * (DATASUS) ou segurança pública (SSP/SINESP), que exigem FonteManual.
 */
const FonteSidra = {
  /**
   * Retorna [{ data: Date, valor: Number }] para o agregado/variável
   * informados. `classificacao` é opcional (ex: "11255[90707]") e filtra a
   * tabela a uma única categoria — necessário em tabelas que, sem esse
   * filtro, devolvem várias categorias misturadas (ex: setores do PIB).
   */
  fetchSerie(agregado, variavel, localidade, classificacao) {
    localidade = localidade || "N1[all]";
    let url = `https://servicodados.ibge.gov.br/api/v3/agregados/${agregado}` +
      `/periodos/-120/variaveis/${variavel}?localidades=${localidade}`;
    if (classificacao) url += `&classificacao=${classificacao}`;

    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) {
        Logger.log(`SIDRA: agregado ${agregado} retornou HTTP ${response.getResponseCode()}`);
        return [];
      }
      const dados = JSON.parse(response.getContentText());
      const serie = (dados[0] && dados[0].resultados[0] && dados[0].resultados[0].series[0] && dados[0].resultados[0].series[0].serie) || {};
      return Object.keys(serie)
        .filter(periodo => serie[periodo] !== "..." && serie[periodo] !== "-")
        .map(periodo => ({ data: this.parsePeriodo_(periodo), valor: Number(serie[periodo]) }))
        .filter(item => !isNaN(item.valor));
    } catch (erro) {
      Logger.log(`SIDRA: erro ao buscar agregado ${agregado}: ${erro}`);
      return [];
    }
  },

  /** Converte períodos SIDRA ("2024" anual, "202403" trimestral) no primeiro dia correspondente. */
  parsePeriodo_(periodo) {
    if (periodo.length === 4) return new Date(Number(periodo), 0, 1);
    if (periodo.length === 6) {
      const ano = Number(periodo.slice(0, 4));
      const trimestre = Number(periodo.slice(4, 6));
      return new Date(ano, (trimestre - 1) * 3, 1);
    }
    return new Date(periodo);
  }
};
