import { Injectable, Logger } from '@nestjs/common';
import { DuckDbService } from 'src/report/duckdb/duckdb.service';
import { quoteIdentifier } from 'src/report/duckdb/duckdb-query.util';
import { ReportService } from 'src/report/report.service';
import { ReportSnapshotService } from 'src/report/report-snapshot.service';
import { AiReportToolsService } from './ai-report-tools.service';
import { isSensitiveColumnName } from './ai-sensitive-data.util';
import { parseChartSpec, type AiChartSpec } from './ai-chart-spec.schema';
import type {
  AiAnalyticsResult,
  AnalyticsAggregation,
  AnalyticsGranularity,
  OutlierMethod,
} from './ai-analytics.types';

/** Mapa fechado granularidade -> unidade do date_trunc (evita injeção). */
const DATE_TRUNC_UNIT: Record<AnalyticsGranularity, string> = {
  dia: 'day',
  semana: 'week',
  mes: 'month',
  trimestre: 'quarter',
  ano: 'year',
};

/** Mapa fechado agregação -> função SQL. */
const SQL_AGGREGATE: Record<AnalyticsAggregation, string> = {
  soma: 'sum',
  media: 'avg',
  contagem: 'count',
};

const MAX_CHART_POINTS = 200;
const MAX_SCATTER_POINTS = 300;
const MIN_ROWS_FOR_STATS = 3;
const MIN_BUCKETS_FOR_TREND = 3;

type AnalyticsDataset = {
  relatorioId: number;
  nome: string;
  estado: string;
  readUri: string;
  colunas: string[];
  colunasTipos: Record<string, string>;
  totalLinhas: number;
  geradoEm: Date;
  fonte: string;
};

type DatasetError = { erro: string };

function isDatasetError(value: unknown): value is DatasetError {
  return typeof value === 'object' && value !== null && 'erro' in value;
}

function errorResult(mensagem: string): AiAnalyticsResult {
  return { resumo: { erro: mensagem }, chartSpec: null };
}

/** Arredonda para o modelo: precisão suficiente sem ruído de ponto flutuante. */
function round(value: unknown, decimals = 2): number | null {
  const numeric = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(numeric * factor) / factor;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Rótulo curto de período conforme a granularidade escolhida. */
function formatPeriodLabel(
  value: unknown,
  granularidade: AnalyticsGranularity,
): string {
  const date = toDate(value);
  if (!date) {
    return String(value ?? '');
  }

  const iso = date.toISOString();
  const year = iso.slice(0, 4);
  const month = iso.slice(5, 7);
  const day = iso.slice(8, 10);

  switch (granularidade) {
    case 'ano':
      return year;
    case 'trimestre':
      return `${year}-T${Math.floor((Number(month) - 1) / 3) + 1}`;
    case 'mes':
      return `${month}/${year}`;
    default:
      return `${day}/${month}/${year}`;
  }
}

function describeTrendDirection(
  slope: number | null,
  primeiro: number | null,
  ultimo: number | null,
): string {
  if (slope === null || primeiro === null || ultimo === null) {
    return 'indefinida';
  }

  const escala = Math.max(Math.abs(primeiro), Math.abs(ultimo), 1);
  if (Math.abs(slope) < escala * 0.01) {
    return 'estável';
  }

  return slope > 0 ? 'alta' : 'queda';
}

function describeCorrelationStrength(value: number | null): string {
  if (value === null) {
    return 'indeterminada';
  }

  const absolute = Math.abs(value);
  const sentido = value > 0 ? 'positiva' : 'negativa';

  if (absolute >= 0.9) {
    return `muito forte ${sentido}`;
  }
  if (absolute >= 0.7) {
    return `forte ${sentido}`;
  }
  if (absolute >= 0.4) {
    return `moderada ${sentido}`;
  }
  if (absolute >= 0.2) {
    return `fraca ${sentido}`;
  }
  return 'desprezível';
}

@Injectable()
export class AiAnalyticsToolsService {
  private readonly logger = new Logger(AiAnalyticsToolsService.name);

  constructor(
    private readonly aiReportToolsService: AiReportToolsService,
    private readonly reportService: ReportService,
    private readonly reportSnapshotService: ReportSnapshotService,
    private readonly duckDbService: DuckDbService,
  ) {}

  /** Tendência de uma métrica ao longo do tempo (regressão linear em SQL). */
  async analisarTendencia(
    userId: number,
    params: {
      relatorioId: number;
      colunaData: string;
      colunaValor: string;
      granularidade?: AnalyticsGranularity;
      agregacao?: AnalyticsAggregation;
    },
  ): Promise<AiAnalyticsResult> {
    const dataset = await this.resolveDataset(userId, params.relatorioId);
    if (isDatasetError(dataset)) {
      return errorResult(dataset.erro);
    }

    const columns = this.requireColumns(dataset, [
      params.colunaData,
      params.colunaValor,
    ]);
    if (isDatasetError(columns)) {
      return errorResult(columns.erro);
    }

    const granularidade = params.granularidade ?? 'mes';
    const agregacao = params.agregacao ?? 'soma';
    const unit = DATE_TRUNC_UNIT[granularidade];
    const aggregate = SQL_AGGREGATE[agregacao];
    const dataColumn = quoteIdentifier(params.colunaData, dataset.colunas);
    const valueColumn = quoteIdentifier(params.colunaValor, dataset.colunas);

    const rows = await this.duckDbService.runAggregation(
      dataset.readUri,
      (source) => `
        WITH base AS (
          SELECT date_trunc('${unit}', TRY_CAST(${dataColumn} AS TIMESTAMP)) AS periodo,
                 TRY_CAST(${valueColumn} AS DOUBLE) AS valor
          FROM ${source}
          WHERE TRY_CAST(${dataColumn} AS TIMESTAMP) IS NOT NULL
            AND TRY_CAST(${valueColumn} AS DOUBLE) IS NOT NULL
        ),
        agg AS (
          SELECT periodo, ${aggregate}(valor) AS valor FROM base GROUP BY periodo
        ),
        idx AS (
          SELECT periodo, valor, row_number() OVER (ORDER BY periodo) AS x FROM agg
        ),
        reg AS (
          SELECT regr_slope(valor, x) AS slope,
                 regr_intercept(valor, x) AS intercept,
                 regr_r2(valor, x) AS r2,
                 count(*) AS n
          FROM idx
        )
        SELECT idx.periodo AS periodo, idx.valor AS valor,
               reg.slope AS slope, reg.intercept AS intercept,
               reg.r2 AS r2, reg.n AS n
        FROM idx CROSS JOIN reg
        ORDER BY idx.periodo
        LIMIT ${MAX_CHART_POINTS}
      `,
    );

    if (rows.length < MIN_BUCKETS_FOR_TREND) {
      return errorResult(
        `Dados insuficientes para tendência: apenas ${rows.length} período(s) com valor válido em "${params.colunaValor}". Tente uma granularidade maior ou verifique se a coluna de data é reconhecida como data.`,
      );
    }

    const serie = rows.map((row) => ({
      periodo: formatPeriodLabel(row.periodo, granularidade),
      valor: round(row.valor),
    }));

    const slope = round(rows[0]?.slope, 4);
    const r2 = round(rows[0]?.r2, 4);
    const primeiro = serie[0]?.valor ?? null;
    const ultimo = serie[serie.length - 1]?.valor ?? null;
    const variacaoPercentual =
      primeiro !== null && ultimo !== null && primeiro !== 0
        ? round(((ultimo - primeiro) / Math.abs(primeiro)) * 100)
        : null;

    const chartSpec = this.buildChartSpec({
      type: 'line',
      title: `${params.colunaValor} por período (${granularidade})`,
      subtitle: `Agregação: ${agregacao}`,
      xAxis: { key: 'periodo', label: 'Período', type: 'category' },
      yAxis: { label: params.colunaValor },
      series: [{ key: 'valor', label: params.colunaValor }],
      data: serie,
      source: dataset.fonte,
    });

    return {
      resumo: {
        relatorio: dataset.nome,
        fonte: dataset.fonte,
        colunaData: params.colunaData,
        colunaValor: params.colunaValor,
        granularidade,
        agregacao,
        periodosAnalisados: serie.length,
        primeiroPeriodo: serie[0]?.periodo ?? null,
        ultimoPeriodo: serie[serie.length - 1]?.periodo ?? null,
        primeiroValor: primeiro,
        ultimoValor: ultimo,
        variacaoPercentual,
        inclinacaoPorPeriodo: slope,
        r2,
        direcao: describeTrendDirection(slope, primeiro, ultimo),
        qualidadeDoAjuste:
          r2 === null ? 'indefinida' : r2 >= 0.7 ? 'boa' : r2 >= 0.3 ? 'moderada' : 'baixa',
        graficoIncluido: chartSpec !== null,
      },
      chartSpec,
    };
  }

  /** Correlação de Pearson entre colunas numéricas. */
  async calcularCorrelacao(
    userId: number,
    params: { relatorioId: number; colunas: string[] },
  ): Promise<AiAnalyticsResult> {
    const dataset = await this.resolveDataset(userId, params.relatorioId);
    if (isDatasetError(dataset)) {
      return errorResult(dataset.erro);
    }

    const unique = [...new Set(params.colunas)];
    if (unique.length < 2) {
      return errorResult(
        'Informe ao menos duas colunas numéricas diferentes para calcular correlação.',
      );
    }

    const columns = this.requireColumns(dataset, unique);
    if (isDatasetError(columns)) {
      return errorResult(columns.erro);
    }

    const pairs: Array<{ a: string; b: string }> = [];
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        pairs.push({ a: unique[i], b: unique[j] });
      }
    }

    const projections = pairs.flatMap((pair, index) => {
      const a = `TRY_CAST(${quoteIdentifier(pair.a, dataset.colunas)} AS DOUBLE)`;
      const b = `TRY_CAST(${quoteIdentifier(pair.b, dataset.colunas)} AS DOUBLE)`;
      return [
        `corr(${a}, ${b}) AS corr_${index}`,
        `regr_count(${a}, ${b}) AS n_${index}`,
      ];
    });

    const [row] = await this.duckDbService.runAggregation(
      dataset.readUri,
      (source) => `SELECT ${projections.join(', ')} FROM ${source}`,
    );

    const correlacoes = pairs.map((pair, index) => {
      const value = round(row?.[`corr_${index}`], 4);
      return {
        colunaA: pair.a,
        colunaB: pair.b,
        correlacao: value,
        forca: describeCorrelationStrength(value),
        amostras: Number(row?.[`n_${index}`] ?? 0),
      };
    });

    const withValue = correlacoes.filter((item) => item.correlacao !== null);
    if (withValue.length === 0) {
      return errorResult(
        `Não foi possível calcular correlação: as colunas ${unique.join(', ')} não têm valores numéricos suficientes em comum.`,
      );
    }

    const strongest = withValue.reduce((best, current) =>
      Math.abs(current.correlacao ?? 0) > Math.abs(best.correlacao ?? 0)
        ? current
        : best,
    );

    const chartSpec = await this.buildScatterForPair(
      dataset,
      strongest.colunaA,
      strongest.colunaB,
      strongest.correlacao,
    );

    return {
      resumo: {
        relatorio: dataset.nome,
        fonte: dataset.fonte,
        correlacoes: withValue.sort(
          (a, b) => Math.abs(b.correlacao ?? 0) - Math.abs(a.correlacao ?? 0),
        ),
        parMaisForte: `${strongest.colunaA} × ${strongest.colunaB}`,
        aviso:
          'Correlação não implica causalidade. Não afirme causa sem evidência adicional.',
        graficoIncluido: chartSpec !== null,
      },
      chartSpec,
    };
  }

  /** Outliers por z-score ou IQR, calculados em SQL. */
  async detectarOutliers(
    userId: number,
    params: {
      relatorioId: number;
      coluna: string;
      metodo?: OutlierMethod;
      limite?: number;
    },
  ): Promise<AiAnalyticsResult> {
    const dataset = await this.resolveDataset(userId, params.relatorioId);
    if (isDatasetError(dataset)) {
      return errorResult(dataset.erro);
    }

    const columns = this.requireColumns(dataset, [params.coluna]);
    if (isDatasetError(columns)) {
      return errorResult(columns.erro);
    }

    const metodo = params.metodo ?? 'zscore';
    const limite = params.limite ?? (metodo === 'zscore' ? 3 : 1.5);
    const column = quoteIdentifier(params.coluna, dataset.colunas);
    const numeric = `TRY_CAST(${column} AS DOUBLE)`;

    const [stats] =
      metodo === 'zscore'
        ? await this.duckDbService.runAggregation(
            dataset.readUri,
            (source) => `
              WITH base AS (
                SELECT ${numeric} AS v FROM ${source} WHERE ${numeric} IS NOT NULL
              ),
              stats AS (
                SELECT avg(v) AS m, stddev_samp(v) AS s, count(*) AS n FROM base
              ),
              marked AS (
                SELECT base.v AS v, (base.v - stats.m) / nullif(stats.s, 0) AS z
                FROM base CROSS JOIN stats
              )
              SELECT (SELECT n FROM stats) AS total,
                     (SELECT m FROM stats) AS media,
                     (SELECT s FROM stats) AS desvio,
                     count(*) FILTER (WHERE abs(z) > $1) AS outliers,
                     min(v) FILTER (WHERE abs(z) > $1) AS menor,
                     max(v) FILTER (WHERE abs(z) > $1) AS maior
              FROM marked
            `,
            [limite],
          )
        : await this.duckDbService.runAggregation(
            dataset.readUri,
            (source) => `
              WITH base AS (
                SELECT ${numeric} AS v FROM ${source} WHERE ${numeric} IS NOT NULL
              ),
              q AS (
                SELECT quantile_cont(v, 0.25) AS q1, quantile_cont(v, 0.75) AS q3,
                       avg(v) AS m, count(*) AS n
                FROM base
              ),
              marked AS (
                SELECT base.v AS v,
                       q.q1 - $1 * (q.q3 - q.q1) AS limite_inferior,
                       q.q3 + $1 * (q.q3 - q.q1) AS limite_superior
                FROM base CROSS JOIN q
              )
              SELECT (SELECT n FROM q) AS total,
                     (SELECT m FROM q) AS media,
                     min(limite_inferior) AS limite_inferior,
                     max(limite_superior) AS limite_superior,
                     count(*) FILTER (WHERE v < limite_inferior OR v > limite_superior) AS outliers,
                     min(v) FILTER (WHERE v < limite_inferior OR v > limite_superior) AS menor,
                     max(v) FILTER (WHERE v < limite_inferior OR v > limite_superior) AS maior
              FROM marked
            `,
            [limite],
          );

    const total = Number(stats?.total ?? 0);
    if (total < MIN_ROWS_FOR_STATS) {
      return errorResult(
        `A coluna "${params.coluna}" tem apenas ${total} valor(es) numérico(s) — insuficiente para detectar outliers.`,
      );
    }

    const outliers = Number(stats?.outliers ?? 0);
    const extremos = await this.fetchTopOutliers(
      dataset,
      params.coluna,
      metodo,
      limite,
    );

    const chartSpec =
      extremos.length > 0
        ? this.buildChartSpec({
            type: 'bar',
            title: `Maiores desvios em ${params.coluna}`,
            subtitle: `Método ${metodo} (limite ${limite})`,
            xAxis: { key: 'posicao', label: 'Ranking', type: 'category' },
            yAxis: { label: params.coluna },
            series: [{ key: 'valor', label: params.coluna }],
            data: extremos.map((valor, index) => ({
              posicao: `#${index + 1}`,
              valor,
            })),
            source: dataset.fonte,
            footnote: `Média da coluna: ${round(stats?.media)}`,
          })
        : null;

    return {
      resumo: {
        relatorio: dataset.nome,
        fonte: dataset.fonte,
        coluna: params.coluna,
        metodo,
        limite,
        valoresAnalisados: total,
        outliersEncontrados: outliers,
        percentualOutliers: round((outliers / total) * 100),
        media: round(stats?.media),
        desvioPadrao: round(stats?.desvio),
        limiteInferior: round(stats?.limite_inferior),
        limiteSuperior: round(stats?.limite_superior),
        menorOutlier: round(stats?.menor),
        maiorOutlier: round(stats?.maior),
        graficoIncluido: chartSpec !== null,
      },
      chartSpec,
    };
  }

  /** Estatísticas descritivas + histograma de uma coluna numérica. */
  async resumirDistribuicao(
    userId: number,
    params: { relatorioId: number; coluna: string; faixas?: number },
  ): Promise<AiAnalyticsResult> {
    const dataset = await this.resolveDataset(userId, params.relatorioId);
    if (isDatasetError(dataset)) {
      return errorResult(dataset.erro);
    }

    const columns = this.requireColumns(dataset, [params.coluna]);
    if (isDatasetError(columns)) {
      return errorResult(columns.erro);
    }

    const faixas = Math.min(Math.max(params.faixas ?? 10, 4), 30);
    const column = quoteIdentifier(params.coluna, dataset.colunas);
    const numeric = `TRY_CAST(${column} AS DOUBLE)`;

    const [stats] = await this.duckDbService.runAggregation(
      dataset.readUri,
      (source) => `
        WITH base AS (
          SELECT ${numeric} AS v FROM ${source} WHERE ${numeric} IS NOT NULL
        )
        SELECT count(*) AS n, avg(v) AS media, stddev_samp(v) AS desvio,
               min(v) AS minimo, max(v) AS maximo,
               quantile_cont(v, 0.25) AS p25, quantile_cont(v, 0.5) AS mediana,
               quantile_cont(v, 0.75) AS p75, quantile_cont(v, 0.9) AS p90,
               quantile_cont(v, 0.95) AS p95
        FROM base
      `,
    );

    const total = Number(stats?.n ?? 0);
    if (total < MIN_ROWS_FOR_STATS) {
      return errorResult(
        `A coluna "${params.coluna}" tem apenas ${total} valor(es) numérico(s) — insuficiente para resumir a distribuição. Confirme se essa coluna é numérica.`,
      );
    }

    const histogram = await this.duckDbService.runAggregation(
      dataset.readUri,
      (source) => `
        WITH base AS (
          SELECT ${numeric} AS v FROM ${source} WHERE ${numeric} IS NOT NULL
        ),
        lim AS (SELECT min(v) AS lo, max(v) AS hi FROM base),
        w AS (
          SELECT lo, hi, CASE WHEN hi > lo THEN (hi - lo) / $1 ELSE NULL END AS passo
          FROM lim
        ),
        marked AS (
          SELECT CASE
                   WHEN w.passo IS NULL THEN 0
                   ELSE least(
                     CAST(floor((base.v - w.lo) / w.passo) AS INTEGER),
                     CAST($1 AS INTEGER) - 1
                   )
                 END AS bucket,
                 w.lo AS lo, w.passo AS passo
          FROM base CROSS JOIN w
        )
        SELECT bucket,
               min(lo) + bucket * min(passo) AS inicio,
               min(lo) + (bucket + 1) * min(passo) AS fim,
               count(*) AS frequencia
        FROM marked
        GROUP BY bucket
        ORDER BY bucket
      `,
      [faixas],
    );

    const chartData = histogram.map((row) => {
      const inicio = round(row.inicio);
      const fim = round(row.fim);
      return {
        faixa:
          inicio === null || fim === null
            ? 'valor único'
            : `${inicio} a ${fim}`,
        frequencia: Number(row.frequencia ?? 0),
      };
    });

    const chartSpec =
      chartData.length > 1
        ? this.buildChartSpec({
            type: 'bar',
            title: `Distribuição de ${params.coluna}`,
            subtitle: `${total} valores em ${chartData.length} faixas`,
            xAxis: { key: 'faixa', label: params.coluna, type: 'category' },
            yAxis: { label: 'Frequência' },
            series: [{ key: 'frequencia', label: 'Registros' }],
            data: chartData,
            source: dataset.fonte,
          })
        : null;

    const media = round(stats?.media);
    const mediana = round(stats?.mediana);
    const assimetria =
      media !== null && mediana !== null
        ? media > mediana * 1.05
          ? 'cauda à direita (poucos valores altos puxam a média)'
          : media < mediana * 0.95
            ? 'cauda à esquerda (poucos valores baixos puxam a média)'
            : 'aproximadamente simétrica'
        : 'indefinida';

    return {
      resumo: {
        relatorio: dataset.nome,
        fonte: dataset.fonte,
        coluna: params.coluna,
        valoresAnalisados: total,
        media,
        mediana,
        desvioPadrao: round(stats?.desvio),
        minimo: round(stats?.minimo),
        maximo: round(stats?.maximo),
        p25: round(stats?.p25),
        p75: round(stats?.p75),
        p90: round(stats?.p90),
        p95: round(stats?.p95),
        formaDaDistribuicao: assimetria,
        graficoIncluido: chartSpec !== null,
      },
      chartSpec,
    };
  }

  /** Comparação período a período (MoM/YoY) com variação percentual. */
  async compararPeriodos(
    userId: number,
    params: {
      relatorioId: number;
      colunaData: string;
      colunaValor: string;
      granularidade?: AnalyticsGranularity;
      agregacao?: AnalyticsAggregation;
      periodos?: number;
    },
  ): Promise<AiAnalyticsResult> {
    const dataset = await this.resolveDataset(userId, params.relatorioId);
    if (isDatasetError(dataset)) {
      return errorResult(dataset.erro);
    }

    const columns = this.requireColumns(dataset, [
      params.colunaData,
      params.colunaValor,
    ]);
    if (isDatasetError(columns)) {
      return errorResult(columns.erro);
    }

    const granularidade = params.granularidade ?? 'mes';
    const agregacao = params.agregacao ?? 'soma';
    const periodos = Math.min(Math.max(params.periodos ?? 12, 2), 60);
    const unit = DATE_TRUNC_UNIT[granularidade];
    const aggregate = SQL_AGGREGATE[agregacao];
    const dataColumn = quoteIdentifier(params.colunaData, dataset.colunas);
    const valueColumn = quoteIdentifier(params.colunaValor, dataset.colunas);

    const rows = await this.duckDbService.runAggregation(
      dataset.readUri,
      (source) => `
        WITH base AS (
          SELECT date_trunc('${unit}', TRY_CAST(${dataColumn} AS TIMESTAMP)) AS periodo,
                 TRY_CAST(${valueColumn} AS DOUBLE) AS valor
          FROM ${source}
          WHERE TRY_CAST(${dataColumn} AS TIMESTAMP) IS NOT NULL
            AND TRY_CAST(${valueColumn} AS DOUBLE) IS NOT NULL
        ),
        agg AS (
          SELECT periodo, ${aggregate}(valor) AS valor FROM base GROUP BY periodo
        ),
        ord AS (
          SELECT periodo, valor, lag(valor) OVER (ORDER BY periodo) AS anterior FROM agg
        )
        SELECT periodo, valor, anterior,
               CASE WHEN anterior IS NULL OR anterior = 0 THEN NULL
                    ELSE (valor - anterior) / abs(anterior) * 100 END AS variacao
        FROM ord
        ORDER BY periodo DESC
        LIMIT $1
      `,
      [periodos],
    );

    if (rows.length < 2) {
      return errorResult(
        `Dados insuficientes para comparar períodos: encontrei apenas ${rows.length} período(s). Tente uma granularidade maior.`,
      );
    }

    const chronological = [...rows].reverse();
    const comparacoes = chronological.map((row) => ({
      periodo: formatPeriodLabel(row.periodo, granularidade),
      valor: round(row.valor),
      valorPeriodoAnterior: round(row.anterior),
      variacaoPercentual: round(row.variacao),
    }));

    const ultimo = comparacoes[comparacoes.length - 1];
    const comVariacao = comparacoes.filter(
      (item) => item.variacaoPercentual !== null,
    );
    const maiorAlta = comVariacao.reduce<(typeof comVariacao)[number] | null>(
      (best, current) =>
        best === null ||
        (current.variacaoPercentual ?? 0) > (best.variacaoPercentual ?? 0)
          ? current
          : best,
      null,
    );
    const maiorQueda = comVariacao.reduce<(typeof comVariacao)[number] | null>(
      (worst, current) =>
        worst === null ||
        (current.variacaoPercentual ?? 0) < (worst.variacaoPercentual ?? 0)
          ? current
          : worst,
      null,
    );

    const chartSpec = this.buildChartSpec({
      type: 'bar',
      title: `${params.colunaValor} por período (${granularidade})`,
      subtitle: `Agregação: ${agregacao} · últimos ${comparacoes.length} períodos`,
      xAxis: { key: 'periodo', label: 'Período', type: 'category' },
      yAxis: { label: params.colunaValor },
      series: [{ key: 'valor', label: params.colunaValor }],
      data: comparacoes.map((item) => ({
        periodo: item.periodo,
        valor: item.valor,
      })),
      source: dataset.fonte,
    });

    return {
      resumo: {
        relatorio: dataset.nome,
        fonte: dataset.fonte,
        colunaData: params.colunaData,
        colunaValor: params.colunaValor,
        granularidade,
        agregacao,
        periodosComparados: comparacoes.length,
        ultimoPeriodo: ultimo?.periodo ?? null,
        ultimoValor: ultimo?.valor ?? null,
        variacaoUltimoPeriodo: ultimo?.variacaoPercentual ?? null,
        maiorAlta,
        maiorQueda,
        serie: comparacoes,
        graficoIncluido: chartSpec !== null,
      },
      chartSpec,
    };
  }

  /**
   * Resolve o dataset analisável de um relatório.
   *
   * A análise roda sobre o snapshot Parquet: é o único formato onde o cálculo
   * pode ser empurrado inteiro para SQL. Relatórios online sem snapshot gerado
   * não são analisáveis — nesse caso devolvemos o motivo para o modelo explicar.
   */
  private async resolveDataset(
    userId: number,
    relatorioId: number,
  ): Promise<AnalyticsDataset | DatasetError> {
    await this.aiReportToolsService.assertAiKnowledgeAccess(userId, relatorioId);
    const relatorio = await this.reportService.findById(relatorioId, userId);

    let resolved: Awaited<
      ReturnType<ReportSnapshotService['resolveSnapshotFile']>
    >;
    try {
      resolved = await this.reportSnapshotService.resolveSnapshotFile(relatorioId);
    } catch (error) {
      this.logger.warn(
        `Snapshot indisponível para análise do relatório ${relatorioId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        erro: `O snapshot do relatório "${relatorio.nome}" não está disponível para análise. É necessário gerar o snapshot novamente antes de analisar.`,
      };
    }

    if (!resolved) {
      return {
        erro: `O relatório "${relatorio.nome}" ainda não tem snapshot gerado. A análise estatística usa o snapshot em Parquet, então é preciso gerar o snapshot antes de analisar.`,
      };
    }

    const { snapshot, readUri } = resolved;
    const colunas = (snapshot.colunas ?? []).filter(
      (column) => !isSensitiveColumnName(column),
    );

    if (colunas.length === 0) {
      return {
        erro: `O snapshot do relatório "${relatorio.nome}" não tem colunas analisáveis.`,
      };
    }

    const geradoEm = toDate(snapshot.gerado_em) ?? new Date(0);

    return {
      relatorioId,
      nome: relatorio.nome,
      estado: String(relatorio.estado),
      readUri,
      colunas,
      colunasTipos: snapshot.colunas_tipos ?? {},
      totalLinhas: Number(snapshot.total_linhas ?? 0),
      geradoEm,
      fonte: `Relatório "${relatorio.nome}" (snapshot de ${geradoEm.toISOString()})`,
    };
  }

  /** Garante que as colunas pedidas existem e não são sensíveis. */
  private requireColumns(
    dataset: AnalyticsDataset,
    requested: string[],
  ): true | DatasetError {
    const missing = requested.filter(
      (column) => !dataset.colunas.includes(column),
    );

    if (missing.length > 0) {
      return {
        erro: `Coluna(s) inexistente(s) no relatório "${dataset.nome}": ${missing.join(', ')}. Colunas disponíveis: ${dataset.colunas.join(', ')}.`,
      };
    }

    return true;
  }

  /** Amostra de pontos para o scatter do par mais correlacionado. */
  private async buildScatterForPair(
    dataset: AnalyticsDataset,
    colunaA: string,
    colunaB: string,
    correlacao: number | null,
  ): Promise<AiChartSpec | null> {
    const a = `TRY_CAST(${quoteIdentifier(colunaA, dataset.colunas)} AS DOUBLE)`;
    const b = `TRY_CAST(${quoteIdentifier(colunaB, dataset.colunas)} AS DOUBLE)`;

    const points = await this.duckDbService.runAggregation(
      dataset.readUri,
      (source) => `
        SELECT * FROM (
          SELECT ${a} AS x, ${b} AS y
          FROM ${source}
          WHERE ${a} IS NOT NULL AND ${b} IS NOT NULL
        ) USING SAMPLE reservoir(${MAX_SCATTER_POINTS} ROWS)
      `,
    );

    if (points.length < MIN_ROWS_FOR_STATS) {
      return null;
    }

    return this.buildChartSpec({
      type: 'scatter',
      title: `${colunaA} × ${colunaB}`,
      subtitle:
        correlacao !== null
          ? `Correlação ${correlacao} (${describeCorrelationStrength(correlacao)})`
          : undefined,
      xAxis: { key: 'x', label: colunaA, type: 'number' },
      yAxis: { label: colunaB },
      series: [{ key: 'y', label: colunaB }],
      data: points.map((point) => ({
        x: round(point.x, 4),
        y: round(point.y, 4),
      })),
      source: dataset.fonte,
      footnote:
        points.length >= MAX_SCATTER_POINTS
          ? `Amostra de ${MAX_SCATTER_POINTS} registros`
          : undefined,
    });
  }

  /** Valores extremos para o gráfico de outliers (somente a coluna analisada). */
  private async fetchTopOutliers(
    dataset: AnalyticsDataset,
    coluna: string,
    metodo: OutlierMethod,
    limite: number,
  ): Promise<number[]> {
    const column = quoteIdentifier(coluna, dataset.colunas);
    const numeric = `TRY_CAST(${column} AS DOUBLE)`;

    const rows =
      metodo === 'zscore'
        ? await this.duckDbService.runAggregation(
            dataset.readUri,
            (source) => `
              WITH base AS (
                SELECT ${numeric} AS v FROM ${source} WHERE ${numeric} IS NOT NULL
              ),
              stats AS (SELECT avg(v) AS m, stddev_samp(v) AS s FROM base)
              SELECT base.v AS valor
              FROM base CROSS JOIN stats
              WHERE abs((base.v - stats.m) / nullif(stats.s, 0)) > $1
              ORDER BY abs((base.v - stats.m) / nullif(stats.s, 0)) DESC
              LIMIT 10
            `,
            [limite],
          )
        : await this.duckDbService.runAggregation(
            dataset.readUri,
            (source) => `
              WITH base AS (
                SELECT ${numeric} AS v FROM ${source} WHERE ${numeric} IS NOT NULL
              ),
              q AS (
                SELECT quantile_cont(v, 0.25) AS q1, quantile_cont(v, 0.75) AS q3,
                       avg(v) AS m
                FROM base
              )
              SELECT base.v AS valor
              FROM base CROSS JOIN q
              WHERE base.v < q.q1 - $1 * (q.q3 - q.q1)
                 OR base.v > q.q3 + $1 * (q.q3 - q.q1)
              ORDER BY abs(base.v - q.m) DESC
              LIMIT 10
            `,
            [limite],
          );

    return rows
      .map((row) => round(row.valor))
      .filter((value): value is number => value !== null);
  }

  /** Valida o spec antes de mandar para o stream; gráfico inválido é descartado. */
  private buildChartSpec(candidate: unknown): AiChartSpec | null {
    const spec = parseChartSpec(candidate);

    if (!spec) {
      this.logger.warn('Chart spec inválido descartado pela validação Zod.');
    }

    return spec;
  }
}
