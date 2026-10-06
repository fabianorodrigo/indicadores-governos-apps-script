/**
 * Fonte: Banco Central do Brasil — Sistema Gerenciador de Séries Temporais (SGS).
 * API pública: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados
 */
const FonteBcb = {
  // Tamanho máximo de cada janela de busca. Séries diárias (ex: Selic, SGS
  // 432) geram tantos pontos que pedir muitos anos de uma vez faz a API do
  // BCB travar/responder muito devagar (observado: 16 anos não respondeu em
  // 30s, enquanto 2 e 10 anos responderam quase instantaneamente — não é
  // proporcional ao tamanho, é a própria API sendo instável com pedidos
  // grandes). Por isso busca-se em janelas menores e concatena-se o resultado.
  JANELA_MAX_ANOS: 5,

  /**
   * Retorna [{ data: Date, valor: Number }] para a série SGS informada,
   * buscando a partir de 1º de janeiro do ano que inicia a janela de
   * `anosHistorico` anos-calendário (incluindo o ano atual) — nunca a
   * partir do dia de hoje em anos anteriores, para não cortar meses do
   * primeiro ano da janela pela metade.
   *
   * `codigoSerie` negativo inverte o sinal dos valores retornados — usado
   * para séries do BCB cuja convenção é oposta à que exibimos (ex: 5793 e
   * 5727 são "Necessidade de Financiamento do Setor Público", onde
   * positivo = déficit; o "Resultado" fiscal que todo mundo divulga usa a
   * convenção oposta, negativo = déficit — ver README).
   */
  fetchSerie(codigoSerie, anosHistorico) {
    const sinal = codigoSerie < 0 ? -1 : 1;
    const codigo = Math.abs(codigoSerie);

    anosHistorico = anosHistorico || 25;
    const anoFinal = new Date().getFullYear();
    const anoInicial = anoFinal - anosHistorico + 1;

    const pontos = [];
    for (let inicioJanela = anoInicial; inicioJanela <= anoFinal; inicioJanela += this.JANELA_MAX_ANOS) {
      const fimJanela = Math.min(inicioJanela + this.JANELA_MAX_ANOS - 1, anoFinal);
      const inicio = new Date(inicioJanela, 0, 1);
      const fim = fimJanela === anoFinal ? new Date() : new Date(fimJanela, 11, 31);
      pontos.push(...this.fetchJanela_(codigo, inicio, fim));
      if (fimJanela < anoFinal) Utilities.sleep(800); // evita rajada entre janelas
    }
    return sinal === -1 ? pontos.map(p => ({ data: p.data, valor: -p.valor })) : pontos;
  },

  /** Busca uma única janela [inicio, fim], com retentativa em caso de falha. */
  fetchJanela_(codigoSerie, inicio, fim) {
    const formatar = (data) => {
      const d = String(data.getDate()).padStart(2, "0");
      const m = String(data.getMonth() + 1).padStart(2, "0");
      const y = data.getFullYear();
      return `${d}/${m}/${y}`;
    };

    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigoSerie}/dados` +
      `?formato=json&dataInicial=${formatar(inicio)}&dataFinal=${formatar(fim)}`;

    // A API do BCB (atrás de um Azure Front Door) às vezes rejeita chamadas
    // feitas em sequência muito rápida (HTTP 406, ou uma página de erro em
    // XML em vez do JSON esperado) — por isso há retentativa com espera
    // crescente em vez de desistir na primeira falha.
    const tentativas = 3;
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      try {
        const response = UrlFetchApp.fetch(url, {
          muteHttpExceptions: true,
          headers: { Accept: "application/json" }
        });
        if (response.getResponseCode() !== 200) {
          throw new Error(`HTTP ${response.getResponseCode()}`);
        }
        const dados = JSON.parse(response.getContentText());
        return dados.map(item => {
          const [dia, mes, ano] = item.data.split("/").map(Number);
          return { data: new Date(ano, mes - 1, dia), valor: Number(item.valor) };
        });
      } catch (erro) {
        Logger.log(`BCB: tentativa ${tentativa}/${tentativas} falhou para a série ${codigoSerie} (${formatar(inicio)}–${formatar(fim)}): ${erro}`);
        if (tentativa < tentativas) Utilities.sleep(1500 * tentativa);
      }
    }
    Logger.log(`BCB: série ${codigoSerie} falhou após ${tentativas} tentativas (${formatar(inicio)}–${formatar(fim)}).`);
    return [];
  }
};
