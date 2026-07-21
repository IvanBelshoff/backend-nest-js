import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DashboardService } from 'src/dashboard/dashboard.service';
import { env } from 'src/shared/env.schema';
import {
  PowerbiPublicExtractService,
  type PowerBiExtractResult,
} from './powerbi-public-extract.service';
import { redactUrlsFromText } from './powerbi-public-extract.util';

export type AiDashboardInspectResult = {
  dashboardId: number;
  dashboardNome: string;
  fonte: string;
  cache: boolean;
  geradoEm: string;
  paginas: PowerBiExtractResult['paginas'];
  avisoLimitacoes: string[];
};

type CacheEntry = {
  expiresAt: number;
  value: AiDashboardInspectResult;
};

@Injectable()
export class AiDashboardToolsService {
  private readonly logger = new Logger(AiDashboardToolsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly powerbiPublicExtractService: PowerbiPublicExtractService,
  ) {}

  async inspect(
    userId: number,
    dashboardId: number,
    foco?: string,
  ): Promise<AiDashboardInspectResult> {
    const dashboard = await this.dashboardService.findById(dashboardId, userId);
    const cacheKey = `${userId}:${Number(dashboard.id)}`;
    // Perguntas com foco (ex.: vigência) sempre reinspectam — cache pode omitir campos.
    const cached = foco?.trim() ? null : this.getCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        cache: true,
        avisoLimitacoes: [
          ...cached.avisoLimitacoes,
          ...(foco?.trim()
            ? [
                `Pergunta de foco do usuário (sobre extract em cache): "${foco.trim().slice(0, 200)}".`,
              ]
            : []),
        ],
      };
    }

    if (!this.powerbiPublicExtractService.isEnabled()) {
      throw new ServiceUnavailableException(
        'Inspeção de dashboards Power BI está desabilitada.',
      );
    }

    const extract = await this.powerbiPublicExtractService.extract({
      url: dashboard.url,
      query: dashboard.query,
      foco,
    });

    const result = this.sanitizeResult({
      dashboardId: Number(dashboard.id),
      dashboardNome: dashboard.nome,
      fonte: dashboard.nome,
      cache: false,
      geradoEm: extract.geradoEm,
      paginas: extract.paginas,
      avisoLimitacoes: extract.avisoLimitacoes,
    });

    const hasContent = result.paginas.some(
      (page) =>
        page.kpis.length > 0 ||
        page.tabelas.length > 0 ||
        page.textos.length > 0,
    );
    if (hasContent) {
      this.setCache(cacheKey, result);
    } else {
      this.logger.warn(
        `Extract sem conteúdo útil para dashboardId=${result.dashboardId}`,
      );
    }

    return result;
  }

  /** Expõe limpeza do cache para testes. */
  clearCache(): void {
    this.cache.clear();
  }

  private getCache(key: string): AiDashboardInspectResult | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCache(key: string, value: AiDashboardInspectResult): void {
    this.cache.set(key, {
      expiresAt: Date.now() + env.AI_DASHBOARD_EXTRACT_CACHE_TTL_MS,
      value: { ...value, cache: false },
    });
  }

  private sanitizeResult(
    result: AiDashboardInspectResult,
  ): AiDashboardInspectResult {
    const serialized = JSON.stringify(result);
    if (/https?:\/\//i.test(serialized) || /powerbi\.com/i.test(serialized)) {
      return JSON.parse(redactUrlsFromText(serialized)) as AiDashboardInspectResult;
    }
    return result;
  }
}
