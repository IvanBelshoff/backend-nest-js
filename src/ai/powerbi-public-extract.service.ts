import { Injectable, Logger } from '@nestjs/common';
import { chromium, type Browser, type Frame, type Page } from 'playwright';
import { env } from 'src/shared/env.schema';
import {
  buildPowerBiExtractUrl,
  redactUrlsFromText,
} from './powerbi-public-extract.util';

export type PowerBiExtractPage = {
  titulo: string | null;
  kpis: string[];
  tabelas: string[][];
  textos: string[];
};

export type PowerBiExtractResult = {
  geradoEm: string;
  paginas: PowerBiExtractPage[];
  avisoLimitacoes: string[];
};

type FrameExtract = {
  titulo: string | null;
  kpis: string[];
  tabelas: string[][];
  textos: string[];
};

@Injectable()
export class PowerbiPublicExtractService {
  private readonly logger = new Logger(PowerbiPublicExtractService.name);
  private browserPromise: Promise<Browser> | null = null;

  isEnabled(): boolean {
    return env.AI_DASHBOARD_EXTRACT_ENABLED !== false;
  }

  async extract(params: {
    url: string;
    query?: string | null;
    foco?: string;
  }): Promise<PowerBiExtractResult> {
    if (!this.isEnabled()) {
      return {
        geradoEm: new Date().toISOString(),
        paginas: [],
        avisoLimitacoes: [
          'Inspeção de dashboard desabilitada (AI_DASHBOARD_EXTRACT_ENABLED=false).',
        ],
      };
    }

    const extractUrl = buildPowerBiExtractUrl(params.url, params.query);
    if (!extractUrl) {
      return {
        geradoEm: new Date().toISOString(),
        paginas: [],
        avisoLimitacoes: ['Dashboard sem URL configurada para inspeção.'],
      };
    }

    const timeoutMs = env.AI_DASHBOARD_EXTRACT_TIMEOUT_MS;
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
      });
      page.setDefaultTimeout(timeoutMs);

      await page.goto(extractUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });

      await this.waitForPowerBiReady(page, timeoutMs);
      // Tempo extra para visuals/texto (ex.: caixa "Vigência") renderizarem
      await delay(4000);
      await page
        .getByText(/vig[eê]ncia/i)
        .first()
        .waitFor({ state: 'attached', timeout: 8000 })
        .catch(() => undefined);

      const frameResults: FrameExtract[] = [];
      for (const frame of page.frames()) {
        const frameRaw = await this.extractFromFrame(frame).catch(() => null);
        if (frameRaw) {
          frameResults.push(frameRaw);
        }
      }

      const a11yTexts = await this.collectAccessibilityTexts(page);
      const merged = this.mergeFrameExtracts(frameResults, a11yTexts);

      const avisoLimitacoes = [
        'Inspeção limitada à página/vista inicial do Power BI (sem navegação entre páginas nem slicers).',
        'Use APENAS textos/kpis/tabelas retornados. PROIBIDO inventar seções (ex.: "Resumo Executivo") ou datas/valores que não apareçam literalmente no resultado.',
        'Gráficos ou textos só visuais (sem DOM/ARIA) podem não aparecer; se o dado pedido não estiver no resultado, diga que não encontrou — não invente.',
      ];

      if (params.foco?.trim()) {
        avisoLimitacoes.push(
          `Pergunta de foco do usuário: "${params.foco.trim().slice(0, 200)}".`,
        );
        const focoLower = params.foco.toLowerCase();
        const hasVigencia = merged.textos.some((t) =>
          /vig[eê]ncia/i.test(t),
        );
        if (
          /vig[eê]ncia|ano|per[ií]odo/.test(focoLower) &&
          !hasVigencia &&
          !merged.textos.some((t) => /07\/2026|2026|2024|2025/.test(t))
        ) {
          avisoLimitacoes.push(
            'O extract NÃO contém texto de "vigência" nem período explícito. Informe ao usuário que não foi possível ler a vigência no painel (não invente datas).',
          );
        }
      }

      if (
        merged.kpis.length === 0 &&
        merged.tabelas.length === 0 &&
        merged.textos.length === 0
      ) {
        avisoLimitacoes.push(
          'Nenhum texto/KPI legível foi encontrado no DOM; o painel pode ainda estar carregando ou usar apenas renderização visual.',
        );
      }

      const pagina: PowerBiExtractPage = {
        titulo: merged.titulo ? redactUrlsFromText(merged.titulo) : null,
        kpis: merged.kpis.map(redactUrlsFromText),
        tabelas: merged.tabelas.map((row) => row.map(redactUrlsFromText)),
        textos: merged.textos.map(redactUrlsFromText),
      };

      return {
        geradoEm: new Date().toISOString(),
        paginas: [pagina],
        avisoLimitacoes,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha desconhecida na inspeção';
      this.logger.warn(`Falha ao extrair Power BI público: ${message}`);

      return {
        geradoEm: new Date().toISOString(),
        paginas: [],
        avisoLimitacoes: [
          'Não foi possível inspecionar o dashboard Power BI neste momento.',
          'Verifique se o Chromium do Playwright está instalado (`npx playwright install chromium`).',
          redactUrlsFromText(message),
        ],
      };
    } finally {
      await page?.close().catch(() => undefined);
    }
  }

  private async extractFromFrame(frame: Frame): Promise<FrameExtract | null> {
    return frame.evaluate(() => {
      const clean = (value: string | null | undefined): string =>
        (value ?? '').replace(/\s+/g, ' ').trim();

      const titulo =
        clean(document.title) ||
        clean(
          document
            .querySelector(
              '[aria-label*="Report"], [data-testid="report-title"]',
            )
            ?.getAttribute('aria-label'),
        ) ||
        null;

      const kpis: string[] = [];
      const kpiSelectors = [
        '[aria-label*="Card"]',
        '[aria-label*="card"]',
        '[class*="card"] [aria-label]',
        '[role="group"][aria-label]',
        'visual-container [aria-label]',
        '.visualContainer [aria-label]',
        '[class*="visual"] [aria-label]',
      ];
      for (const selector of kpiSelectors) {
        document.querySelectorAll(selector).forEach((el) => {
          const label = clean(el.getAttribute('aria-label'));
          const text = clean(el.textContent);
          const candidate = label || text;
          if (candidate && candidate.length <= 240) {
            kpis.push(candidate);
          }
        });
      }

      const tabelas: string[][] = [];
      document.querySelectorAll('table').forEach((table) => {
        const rows: string[][] = [];
        table.querySelectorAll('tr').forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll('th,td'))
            .map((cell) => clean(cell.textContent))
            .filter(Boolean);
          if (cells.length > 0) {
            rows.push(cells);
          }
        });
        if (rows.length > 0) {
          tabelas.push(...rows);
        }
      });

      const textos: string[] = [];
      const seen = new Set<string>();
      const pushUnique = (value: string) => {
        if (!value || value.length < 2 || value.length > 300) {
          return;
        }
        const key = value.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        textos.push(value);
      };

      document
        .querySelectorAll(
          '[aria-label], [role="img"], [role="heading"], [role="text"], h1, h2, h3, visual-container, .visualContainer, .textRun, .title',
        )
        .forEach((el) => {
          pushUnique(clean(el.getAttribute('aria-label')));
          pushUnique(clean(el.textContent));
        });

      document.querySelectorAll('svg text').forEach((el) => {
        pushUnique(clean(el.textContent));
      });

      const bodyRaw = document.body?.innerText ?? '';
      bodyRaw
        .split('\n')
        .map((line) => clean(line))
        .filter(Boolean)
        .slice(0, 400)
        .forEach(pushUnique);

      return {
        titulo,
        kpis: [...new Set(kpis)].slice(0, 100),
        tabelas: tabelas.slice(0, 100),
        textos: textos.slice(0, 250),
      };
    });
  }

  private async collectAccessibilityTexts(page: Page): Promise<string[]> {
    // page.accessibility foi removido no Playwright recente; usa CDP AX tree.
    try {
      const client = await page.context().newCDPSession(page);
      const result = (await client.send('Accessibility.getFullAXTree')) as {
        nodes?: Array<{
          name?: { value?: string };
          description?: { value?: string };
          value?: { value?: string | number };
        }>;
      };
      await client.detach().catch(() => undefined);

      const out: string[] = [];
      const seen = new Set<string>();
      for (const node of result.nodes ?? []) {
        for (const part of [
          node.name?.value,
          node.description?.value,
          node.value?.value,
        ]) {
          const text = String(part ?? '')
            .replace(/\s+/g, ' ')
            .trim();
          if (text.length < 2 || text.length > 300) {
            continue;
          }
          const key = text.toLowerCase();
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          out.push(text);
        }
      }
      return out.slice(0, 300);
    } catch {
      return [];
    }
  }

  private mergeFrameExtracts(
    frames: FrameExtract[],
    a11yTexts: string[],
  ): {
    titulo: string | null;
    kpis: string[];
    tabelas: string[][];
    textos: string[];
  } {
    const seen = new Set<string>();
    const push = (list: string[], value: string) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) {
        return;
      }
      seen.add(key);
      list.push(value);
    };

    const kpis: string[] = [];
    const textos: string[] = [];
    const tabelas: string[][] = [];
    let titulo: string | null = null;

    for (const frame of frames) {
      if (!titulo && frame.titulo) {
        titulo = frame.titulo;
      }
      for (const k of frame.kpis) {
        push(kpis, k);
      }
      for (const t of frame.textos) {
        push(textos, t);
      }
      tabelas.push(...frame.tabelas);
    }

    for (const t of a11yTexts) {
      push(textos, t);
    }

    return {
      titulo,
      kpis: kpis.slice(0, 120),
      tabelas: tabelas.slice(0, 100),
      textos: textos.slice(0, 300),
    };
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launchBrowser().catch((error) => {
        this.browserPromise = null;
        throw error;
      });
    }
    return this.browserPromise;
  }

  private async launchBrowser(): Promise<Browser> {
    const commonArgs = ['--disable-dev-shm-usage', '--no-sandbox'];

    try {
      return await chromium.launch({
        headless: true,
        args: commonArgs,
      });
    } catch (bundledError) {
      this.logger.warn(
        `Chromium do Playwright indisponível; tentando Google Chrome do sistema. ${
          bundledError instanceof Error ? bundledError.message : bundledError
        }`,
      );
      return chromium.launch({
        headless: true,
        channel: 'chrome',
        args: commonArgs,
      });
    }
  }

  private async waitForPowerBiReady(
    page: Page,
    timeoutMs: number,
  ): Promise<void> {
    const deadline = Date.now() + Math.min(timeoutMs, 30000);
    const selectors = [
      '[aria-label]',
      'visual-container',
      '.visualContainer',
      '[class*="visual"]',
      'canvas',
    ];

    while (Date.now() < deadline) {
      for (const selector of selectors) {
        const count = await page.locator(selector).count().catch(() => 0);
        if (count > 0) {
          await delay(2000);
          return;
        }
      }
      await delay(500);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
