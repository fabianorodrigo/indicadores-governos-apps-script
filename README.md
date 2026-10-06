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

### Se um indicador do BCB sumir da Matriz Comparativa sem erro visível

A API do BCB (hospedada num Azure Front Door) às vezes rejeita chamadas
feitas em sequência muito rápida — responde com HTTP 406 ou com uma página
de erro em XML em vez do JSON esperado. Como isso não lança uma exceção que
interrompe o script, o indicador afetado simplesmente fica sem nenhuma linha
em `Histórico` e desaparece da `Matriz Comparativa`, sem nenhum aviso na
tela. Para confirmar: abra o editor do Apps Script → Execuções → veja o log
da execução — a linha "N ponto(s) importado(s)" vai mostrar `0` para o
indicador afetado, com um erro de BCB imediatamente antes. `fontes/bcb.js`
já tenta de novo automaticamente (até 3 vezes, com espera crescente) e
`sincronizacao.js` espera entre as chamadas ao BCB para evitar disparar
esse limite; se mesmo assim continuar faltando, rode "Atualizar tudo agora"
de novo — tende a ser intermitente do lado do BCB, não um problema de dados.

Um caso específico desse mesmo sintoma: séries **diárias** do BCB (ex: Selic,
SGS `432`, que repete o mesmo valor todo dia até o Copom mudar a meta) geram
muito mais pontos do que séries mensais (IPCA, Dívida Bruta). Pedir muitos
anos de uma vez nessas séries faz a API do BCB travar/responder muito devagar
(observado: uma janela de 16 anos não respondeu em 30s). Por isso
`fontes/bcb.js` busca em janelas de no máximo `JANELA_MAX_ANOS` (5) anos por
vez e concatena o resultado, em vez de pedir o histórico completo numa única
chamada.

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
| Economia | IPCA | % | 6.3 | 10.7 | ... | 5.8 |
| Economia | PIB (Crescimento Real) | % | -3.5 | -3.3 | ... | 2.0 |
| Segurança | Taxa de Homicídios... | óbitos/100k | 28.5 | 29.7 | ... | 21.0 |

- O intervalo de anos vai do início do mandato mais antigo ao fim do mais
  recente (cadastrados na aba `Mandatos`), não do que existe em `Histórico`.
- O nome do governo (linha 1) aparece mesclado sobre as colunas dos anos em
  que ele esteve no cargo. Um ano é atribuído ao mandato com mais dias de
  overlap naquele ano — relevante só no ano de transição entre mandatos.
- Indicadores mensais/trimestrais entram resumidos por ano conforme a coluna
  **"Agregação Anual"** da aba `Indicadores`:
  - `MEDIA` (padrão — Selic, Taxa de Desocupação etc.): média aritmética dos
    pontos do ano.
  - `ACUMULADO` (séries de **taxa**, ex: IPCA — cada ponto já é um % de
    variação): acumulado composto do ano — `(1+v1%) × (1+v2%) × ... ×
    (1+vn%) − 1`. No **ano em curso** (ainda não encerrado, ex: 2026 hoje),
    usa a janela dos **últimos 12 meses disponíveis** em vez do
    ano-calendário incompleto.
    A coluna "Unidade" é exibida como `%` para `ACUMULADO`, mesmo que o dado
    bruto em `Histórico` esteja em outra unidade.
  - `ULTIMO` (séries que a própria fonte já publica acumuladas/consolidadas,
    ex: PIB — ver "Nota sobre o PIB" abaixo): usa o último ponto disponível
    do ano, sem recalcular nada.
- Ano sem nenhum ponto de dado — ou sem base de comparação no ano anterior,
  no caso de `ACUMULADO` — aparece como `-`. `atualizarIndicadores()` sempre
  busca, para fontes `BCB`, a partir de 1º de janeiro de **um ano antes** do
  mandato mais antigo cadastrado, justamente para que o primeiro ano de um
  mandato já tenha base de comparação e não caia nesse caso.
- Além dos indicadores da aba `Indicadores`, a matriz pode ter **indicadores
  calculados**, que não vêm de nenhuma fonte/Histórico — calculados em
  `comparativo.js` a partir dos valores anuais já resumidos de outros dois
  indicadores. Não aparecem na aba `Indicadores` porque não há nada para
  sincronizar; se você renomear qualquer um dos indicadores-base, o
  calculado some da matriz (e um aviso aparece no log). Hoje existem dois:
  - **Juros Real** (Selic − IPCA, equação de Fisher) — `adicionarJurosReal_`.
  - **Cestas Básicas por Salário Mínimo (SP)** — Salário Mínimo ÷ Preço da
    Cesta Básica (São Paulo) — `adicionarCestasPorSalarioMinimo_`. Como o
    preço da cesta é `MANUAL` (ver abaixo), esse indicador só tem valor nos
    anos em que você preencheu a aba `Importação Manual` com dados reais do
    DIEESE.

### Nota sobre o PIB: nominal vs. real

A primeira versão deste indicador usava a série mensal do Banco Central
(SGS `4380`, "PIB mensal — valores correntes") e calculava o crescimento
comparando a soma nominal (R$) de um ano com a do anterior. O resultado
**não batia** com o crescimento do PIB oficialmente divulgado, porque essa
série é **nominal** (inclui inflação), enquanto o "crescimento do PIB" que
o IBGE divulga é sempre em termos **reais** (volume, já deflacionado).

A correção: usar a taxa real já calculada e publicada pelo próprio IBGE —
tabela SIDRA `5932` ("Taxa de variação do índice de volume trimestral"),
variável `6563` ("Taxa acumulada ao longo do ano"), filtrada para a
categoria "PIB a preços de mercado" (classificação `11255[90707]`). O valor
do 4º trimestre de cada ano já É a taxa de crescimento anual oficial —
confirmado comparando manualmente 14 anos (2011–2025) contra os números
publicados pelo IBGE, com diferença em apenas 1 ano (0,1 p.p., provável
revisão de vintage).

## Como adicionar um indicador

Adicione uma linha na aba `Indicadores`:

| Área | Indicador | Fonte | Parâmetro 1 | Parâmetro 2 | Parâmetro 3 | Unidade | Periodicidade | Ativo | Agregação Anual | Parâmetro 4 (Classificação SIDRA) |
|---|---|---|---|---|---|---|---|---|---|---|

- **Fonte = `BCB`**: Parâmetro 1 = código da série no [SGS do Banco
  Central](https://www3.bcb.gov.br/sgspub). Use o código **negativo** (ex:
  `-5793`) se a série tiver convenção de sinal oposta à que você quer exibir
  — é o caso do Resultado Primário/Nominal (séries `5793`/`5727`), publicadas
  como NFSP (positivo = déficit), invertido em relação ao "Resultado" fiscal
  que a imprensa divulga (negativo = déficit). `fontes/bcb.js` inverte o
  sinal de todos os pontos quando o código é negativo.
- **Fonte = `SIDRA`**: Parâmetro 1 = id do agregado, Parâmetro 2 = id da
  variável, Parâmetro 3 = localidade (ex: `N1[all]` para Brasil). Ids podem
  ser encontrados em [sidra.ibge.gov.br](https://sidra.ibge.gov.br) ou via
  `https://servicodados.ibge.gov.br/api/v3/agregados/{id}/metadados`.
  Parâmetro 4 é opcional: só é necessário quando a tabela tem uma
  classificação que precisa ser filtrada para não misturar categorias (ex:
  `11255[90707]` para pegar só "PIB a preços de mercado" na tabela 5932).
- **Agregação Anual** (opcional, padrão `MEDIA` se em branco): `MEDIA`,
  `ACUMULADO` ou `ULTIMO` — ver "Formato da Matriz Comparativa" acima.
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
- **Preço da Cesta Básica.** O DIEESE é a única referência no Brasil, mas só
  publica relatórios em PDF mensais por capital (dieese.org.br/analisecestabasica)
  — não há média nacional oficial, e o banco histórico público que eles
  tinham foi descontinuado em 2018.

Resumindo: a barreira não é "não tem dados abertos", é "o dado aberto que
existe é descontinuado, é microdado bruto demais, é geoespacial, ou está
atualmente sem uma forma simples e verificada de acesso automático". Se você
quiser investir mais nisso — por exemplo, baixar e agendar a leitura de um
CSV fixo do SINESP, ou estender `fontes/sidra.js` para suportar o formato de
consulta por classificação de ano da tabela `7362` (expectativa de vida) —
são extensões razoáveis do mesmo padrão de `fetchSerie(...)` retornando
`[{ data: Date, valor: Number }]`, registradas em `sincronizacao.js`.
