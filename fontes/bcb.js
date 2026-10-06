/**
 * Fonte: Banco Central do Brasil — Sistema Gerenciador de Séries Temporais (SGS).
 * API pública: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados
 */
const FonteBcb = {
  /** Retorna [{ data: Date, valor: Number }] para a série SGS informada. */
  fetchSerie(codigoSerie, anosHistorico) {
    anosHistorico = anosHistorico || 25;
    const hoje = new Date();
    const inicio = new Date();
    inicio.setFullYear(hoje.getFullYear() - anosHistorico);

    const formatar = (data) => {
      const d = String(data.getDate()).padStart(2, "0");
      const m = String(data.getMonth() + 1).padStart(2, "0");
      const y = data.getFullYear();
      return `${d}/${m}/${y}`;
    };

    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigoSerie}/dados` +
      `?formato=json&dataInicial=${formatar(inicio)}&dataFinal=${formatar(hoje)}`;

    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) {
        Logger.log(`BCB: série ${codigoSerie} retornou HTTP ${response.getResponseCode()}`);
        return [];
      }
      const dados = JSON.parse(response.getContentText());
      return dados.map(item => {
        const [dia, mes, ano] = item.data.split("/").map(Number);
        return { data: new Date(ano, mes - 1, dia), valor: Number(item.valor) };
      });
    } catch (erro) {
      Logger.log(`BCB: erro ao buscar série ${codigoSerie}: ${erro}`);
      return [];
    }
  }
};
