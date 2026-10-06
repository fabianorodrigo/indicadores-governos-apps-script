# Indicadores de Governos

Monitor comparativo de indicadores de **economia, educação, saúde, segurança
pública e meio ambiente** ao longo de diferentes mandatos de governo (Brasil,
nível federal), rodando inteiramente dentro de uma Google Spreadsheet via
Google Apps Script.

## Como usar

1. Abra a planilha vinculada a este script e recarregue a página para ver o
   menu **"Indicadores de Governos"**.
2. Rode **"1. Configurar planilhas iniciais"** — cria as abas `Mandatos`,
   `Indicadores` e `Importação Manual` com dados de exemplo.
3. Edite a aba **`Mandatos`** com os governos/mandatos reais que você quer
   comparar (nome, data de início e fim).
4. Edite a aba **`Indicadores`** para ativar/desativar indicadores ou
   adicionar novos (veja "Como adicionar um indicador" abaixo).
5. Rode **"Atualizar tudo agora"** (ou os passos 2 e 3 separadamente). Isso
   gera a aba `Histórico` (dados brutos, formato longo) e a aba
   `Matriz Comparativa` (uma linha por indicador, uma coluna por ano, com o
   nome do governo mesclado sobre os anos do seu mandato — veja abaixo).
6. Opcional: rode **"Configurar atualização automática mensal"** para que o
   fluxo rode sozinho todo dia 1 do mês.

## Arquitetura

- `config.js` — nomes de abas, utilitários de planilha/data e leitura das
  abas de configuração.
- `fontes/bcb.js` — indicadores econômicos via API do Banco Central (SGS).
- `fontes/sidra.js` — indicadores do IBGE via API SIDRA (ex: desocupação,
  Gini). Genérico: funciona para qualquer tabela/variável do SIDRA.
- `fontes/manual.js` — indicadores sem API pública estável, lidos da aba
  `Importação Manual`.
- `sincronizacao.js` — `atualizarIndicadores()`: lê a aba `Indicadores`,
  busca cada série na fonte correspondente e consolida tudo na aba
  `Histórico`.
- `comparativo.js` — `gerarMatrizComparativa()`: cruza `Histórico` com
  `Mandatos` e monta a matriz ano a ano (ver "Formato da Matriz Comparativa"
  abaixo), para qualquer número de indicadores, mandatos e anos (nada fixo
  no código).
- `setup.js` — menu da planilha e criação das abas de configuração.

## Formato da Matriz Comparativa

A aba `Matriz Comparativa` tem duas linhas de cabeçalho e uma linha por
indicador:

| | | | **Governo A** | | **Governo B** | |
|---|---|---|---|---|---|---|
| Área | Indicador | Unidade | 2015 | 2016 | ... | 2022 |
| Economia | IPCA Mensal | % | 6.3 | 10.7 | ... | 5.8 |
| Segurança | Taxa de Homicídios... | óbitos/100k | 28.5 | 29.7 | ... | 21.0 |

- O intervalo de anos vai do início do mandato mais antigo ao fim do mais
  recente (cadastrados na aba `Mandatos`), não do que existe em `Histórico`.
- O nome do governo (linha 1) aparece mesclado sobre as colunas dos anos em
  que ele esteve no cargo. Um ano é atribuído ao mandato com mais dias de
  overlap naquele ano — relevante só no ano de transição entre mandatos.
- Indicadores mensais/trimestrais entram resumidos por ano conforme a coluna
  **"Agregação Anual"** da aba `Indicadores`:
  - `MEDIA` (padrão — Selic, PIB, Taxa de Desocupação etc.): média aritmética
    dos pontos do ano.
  - `ACUMULADO` (ex: IPCA Mensal): acumulado composto do ano — `(1+v1%) ×
    (1+v2%) × ... × (1+vn%) − 1`. Para o **ano em curso** (ainda não
    encerrado, ex: 2026 hoje), usa o acumulado dos **últimos 12 meses
    disponíveis** em vez do ano-calendário incompleto.
- Ano sem nenhum ponto de dado para o indicador aparece como `-`.

## Como adicionar um indicador

Adicione uma linha na aba `Indicadores`:

| Área | Indicador | Fonte | Parâmetro 1 | Parâmetro 2 | Parâmetro 3 | Unidade | Periodicidade | Ativo | Agregação Anual |
|---|---|---|---|---|---|---|---|---|---|

- **Fonte = `BCB`**: Parâmetro 1 = código da série no [SGS do Banco
  Central](https://www3.bcb.gov.br/sgspub).
- **Fonte = `SIDRA`**: Parâmetro 1 = id do agregado, Parâmetro 2 = id da
  variável, Parâmetro 3 = localidade (ex: `N1[all]` para Brasil). Ids podem
  ser encontrados em [sidra.ibge.gov.br](https://sidra.ibge.gov.br) ou via
  `https://servicodados.ibge.gov.br/api/v3/agregados/{id}/metadados`.
- **Agregação Anual** (opcional, padrão `MEDIA` se em branco): `MEDIA` ou
  `ACUMULADO` — ver "Formato da Matriz Comparativa" acima.
- **Fonte = `MANUAL`**: não precisa de parâmetros. Baixe os dados oficiais e
  cole na aba `Importação Manual` (colunas: Indicador — precisa ser
  **idêntico** ao nome usado em `Indicadores` —, Data, Valor, Observação).

## Por que alguns indicadores ainda são "Importação Manual"

Isso **não** significa que não existam APIs ou dados abertos nessas áreas —
existem, e alguns são oficiais. O critério real para `MANUAL` é mais
específico: *não existe uma chamada simples que devolva uma série histórica
anual já agregada*, pronta para o Apps Script consumir em segundos. O que
foi verificado (não é só suposição) ao montar este projeto:

- **Segurança pública — automatizado.** O IBGE publica oficialmente o
  indicador ODS 16.1.1 (taxa de vítimas de homicídios intencionais por 100
  mil hab., 2005–2024) via SIDRA (agregado `6606`, variável `13532`). Por
  isso esse indicador **não** é mais `MANUAL` nesta planilha.
- **Saúde (mortalidade infantil) — automatizado, com ressalva.** O IBGE tem
  a tabela SIDRA `3834` ("Taxa de mortalidade infantil", 2000–2016), mas a
  série foi **descontinuada em 2016** (fazia parte dos "Indicadores de
  Desenvolvimento Sustentável", pesquisa que o IBGE parou de atualizar).
  Ainda assim é dado oficial real, por isso está automatizado — só não
  cobre anos recentes.
- **Saúde (expectativa de vida) — por que ficou manual.** Existe uma tabela
  SIDRA mais recente (`7362`, com projeções até 2060), mas ela usa um
  formato de consulta diferente (ano como classificação, não como
  "período"), que o provedor genérico `fontes/sidra.js` ainda não trata.
  Daria para automatizar estendendo esse provedor — não foi feito para não
  aumentar a complexidade sem necessidade imediata.
- **Saúde (dados brutos de óbitos/nascimentos) — existe API oficial, mas não
  resolve o problema.** O Ministério da Saúde tem uma API REST oficial
  (`apidadosabertos.saude.gov.br`) com os sistemas SIM (mortalidade) e
  SINASC (nascidos vivos) — porém ela expõe **microdados individuais**,
  paginados em blocos de até 1000 registros, sem filtro por ano/UF visível.
  Calcular uma taxa nacional anual exigiria baixar milhões de registros por
  ano, inviável dentro do limite de 6 minutos de execução do Apps Script.
- **Educação (Ideb).** O INEP teve uma API JSON/XML de indicadores no Portal
  de Dados Abertos, mas essa série **parou de ser atualizada em dezembro de
  2014**. Hoje o INEP publica o Ideb oficialmente como planilhas (a cada 2
  anos), não como API ao vivo.
- **Segurança (dados abertos do SINESP além do ODS 16.1.1).** O Ministério
  da Justiça publica datasets do SINESP em dados.gov.br/dados.mj.gov.br —
  são arquivos (CSV) reais, mas a API de catálogo (CKAN) do dados.gov.br
  está retornando HTTP 401 (exige autenticação) no momento, e não há link
  fixo de download conhecido e verificado para automatizar aqui.
- **Meio ambiente (desmatamento).** O INPE/TerraBrasilis tem uma API real,
  mas é geoespacial (WMS/WFS, GeoTIFF/GeoPackage com polígonos) — não uma
  tabela simples de "km² desmatados por ano". Extrair a taxa anual a partir
  disso exigiria processamento geoespacial fora do escopo do Apps Script.

Resumindo: a barreira não é "não tem dados abertos", é "o dado aberto que
existe é descontinuado, é microdado bruto demais, é geoespacial, ou está
atualmente sem uma forma simples e verificada de acesso automático". Se você
quiser investir mais nisso — por exemplo, baixar e agendar a leitura de um
CSV fixo do SINESP, ou estender `fontes/sidra.js` para suportar consultas por
classificação (tabela 7362) — são extensões razoáveis do mesmo padrão de
`fetchSerie(...)` retornando `[{ data: Date, valor: Number }]`, registradas
em `sincronizacao.js`.
