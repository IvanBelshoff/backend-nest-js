import { Injectable, Logger } from '@nestjs/common';
import { chromium, type Browser, type Page } from 'playwright';
import type {
  AiDashboardExploreMapa,
  AiDashboardExplorePlano,
} from 'src/database/entities/AiDashboardExploreJobs';
import { env } from 'src/shared/env.schema';
import {
  buildPowerBiExtractUrl,
  redactUrlsFromText,
} from './powerbi-public-extract.util';
import type { PowerBiExtractPage } from './powerbi-public-extract.service';

export type PowerBiAnalysisResult = {
  geradoEm: string;
  filtrosAplicados: Array<{ nome: string; valor: string; ok: boolean }>;
  paginas: Array<PowerBiExtractPage & { nomeAba: string }>;
  avisoLimitacoes: string[];
};

@Injectable()
export class PowerbiPublicExploreService {
  private readonly logger = new Logger(PowerbiPublicExploreService.name);

  isEnabled(): boolean {
    return env.AI_DASHBOARD_EXTRACT_ENABLED !== false;
  }

  async discover(params: {
    url: string;
    query?: string | null;
  }): Promise<AiDashboardExploreMapa> {
    const extractUrl = buildPowerBiExtractUrl(params.url, params.query);
    if (!extractUrl) {
      return {
        abas: [],
        filtros: [],
        destaquesCapa: [],
        geradoEm: new Date().toISOString(),
      };
    }

    const timeoutMs = env.AI_DASHBOARD_EXPLORE_TIMEOUT_MS;
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      browser = await this.launchBrowser();
      page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      page.setDefaultTimeout(Math.min(timeoutMs, 60000));

      await page.goto(extractUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(timeoutMs, 60000),
      });
      await this.waitForReady(page);
      await delay(3500);
      await page
        .getByText(/vig[eê]ncia/i)
        .first()
        .waitFor({ state: 'attached', timeout: 8000 })
        .catch(() => undefined);

      const abas = await this.listPages(page);
      const capa = await this.extractCurrentView(page);
      const a11yTexts = await this.collectAccessibilityTexts(page);
      const destaquesCapa = [
        ...capa.kpis
          .filter((t) => !/clear selections|navigating to visual|^card$|^image$/i.test(t))
          .slice(0, 20),
        ...capa.textos
          .filter((t) =>
            /vig[eê]ncia|\d{1,2}\/\d{4}|turmas|alunos|nps|matr[ií]culas/i.test(t),
          )
          .slice(0, 20),
        ...a11yTexts
          .filter((t) => /vig[eê]ncia|\d{1,2}\/\d{4}/i.test(t))
          .slice(0, 10),
      ].map(redactUrlsFromText);

      // Segmentadores costumam estar só em abas de conteúdo (não na capa)
      await this.ensureSlicersVisible(page);
      const filtros = await this.listSlicersWithValues(page);

      const mapa = {
        abas: abas.map(redactUrlsFromText).slice(0, 20),
        filtros: filtros.map((f) => ({
          nome: redactUrlsFromText(f.nome),
          valores: f.valores?.map(redactUrlsFromText).slice(0, 40),
          valoresAmostra: f.valoresAmostra?.map(redactUrlsFromText).slice(0, 20),
        })),
        destaquesCapa: [...new Set(destaquesCapa)].slice(0, 40),
        geradoEm: new Date().toISOString(),
      };

      // #region agent log
      fetch('http://127.0.0.1:7570/ingest/0db2c04a-a5ac-44c9-a409-caf72cacc101', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '8bed27',
        },
        body: JSON.stringify({
          sessionId: '8bed27',
          runId: 'post-fix-slicers',
          hypothesisId: 'H7',
          location: 'powerbi-public-explore.service.ts:discover',
          message: 'discover mapa summary',
          data: {
            abasCount: mapa.abas.length,
            abas: mapa.abas,
            filtrosCount: mapa.filtros.length,
            filtros: mapa.filtros.map((f) => f.nome),
            pageAfterSlicers: await this.getSelectedPageName(page),
            destaquesCount: mapa.destaquesCapa.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      return mapa;
    } finally {
      await page?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  async analyze(params: {
    url: string;
    query?: string | null;
    plano: AiDashboardExplorePlano;
  }): Promise<PowerBiAnalysisResult> {
    const extractUrl = buildPowerBiExtractUrl(params.url, params.query);
    const avisoLimitacoes: string[] = [
      'Análise limitada às abas e filtros do plano confirmado.',
      'PROIBIDO inventar números ou seções ausentes do extract.',
    ];
    const filtrosAplicados: PowerBiAnalysisResult['filtrosAplicados'] = [];
    const paginas: PowerBiAnalysisResult['paginas'] = [];

    if (!extractUrl) {
      return {
        geradoEm: new Date().toISOString(),
        filtrosAplicados,
        paginas,
        avisoLimitacoes: [...avisoLimitacoes, 'Dashboard sem URL.'],
      };
    }

    const timeoutMs = env.AI_DASHBOARD_EXPLORE_TIMEOUT_MS;
    const maxPages = env.AI_DASHBOARD_EXPLORE_MAX_PAGES;
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      browser = await this.launchBrowser();
      page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      page.setDefaultTimeout(Math.min(timeoutMs, 90000));

      await page.goto(extractUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(timeoutMs, 90000),
      });
      await this.waitForReady(page);
      await delay(3000);

      const availablePages = await this.listPages(page);
      let targetPages = params.plano.abas?.length
        ? params.plano.abas
        : availablePages;
      if (targetPages.length === 0) {
        targetPages = ['Página atual'];
      }
      targetPages = targetPages.slice(0, maxPages);

      // Ir para uma aba com conteúdo antes de aplicar filtros (capa costuma não ter slicers)
      const firstAba = targetPages.find((a) => a !== 'Página atual');
      if (firstAba) {
        const okNav = await this.navigateToPage(page, firstAba);
        if (!okNav) {
          await this.ensureSlicersVisible(page);
        }
        await delay(2000);
      } else {
        await this.ensureSlicersVisible(page);
      }

      for (const filtro of params.plano.filtros ?? []) {
        const ok = await this.applySlicer(page, filtro.nome, filtro.valor);
        filtrosAplicados.push({
          nome: filtro.nome,
          valor: filtro.valor,
          ok,
        });
        if (!ok) {
          avisoLimitacoes.push(
            `Não foi possível aplicar o filtro "${filtro.nome}" = "${filtro.valor}".`,
          );
        }
        await delay(1500);
      }

      for (const aba of targetPages) {
        if (aba !== 'Página atual') {
          const navigated = await this.navigateToPage(page, aba);
          if (!navigated) {
            avisoLimitacoes.push(`Não foi possível abrir a aba "${aba}".`);
            // #region agent log
            fetch('http://127.0.0.1:7570/ingest/0db2c04a-a5ac-44c9-a409-caf72cacc101', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Debug-Session-Id': '8bed27',
              },
              body: JSON.stringify({
                sessionId: '8bed27',
                runId: 'post-fix-slicers',
                hypothesisId: 'H8',
                location: 'powerbi-public-explore.service.ts:analyze',
                message: 'navigateToPage failed',
                data: { aba, selected: await this.getSelectedPageName(page) },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            continue;
          }
          await delay(2500);
        }
        const view = await this.extractCurrentView(page);
        paginas.push({
          nomeAba: redactUrlsFromText(aba),
          titulo: view.titulo ? redactUrlsFromText(view.titulo) : null,
          kpis: view.kpis.map(redactUrlsFromText),
          tabelas: view.tabelas.map((row) => row.map(redactUrlsFromText)),
          textos: view.textos.map(redactUrlsFromText),
        });
      }

      return {
        geradoEm: new Date().toISOString(),
        filtrosAplicados,
        paginas,
        avisoLimitacoes,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha na análise';
      this.logger.warn(`analyze failed: ${message}`);
      return {
        geradoEm: new Date().toISOString(),
        filtrosAplicados,
        paginas,
        avisoLimitacoes: [
          ...avisoLimitacoes,
          redactUrlsFromText(message),
        ],
      };
    } finally {
      await page?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  private async listPages(page: Page): Promise<string[]> {
    const names = await page.evaluate(() => {
      const clean = (v: string | null | undefined) =>
        (v ?? '').replace(/\s+/g, ' ').trim();
      const chrome =
        /page navigation|press enter|zoom|fit to page|previous page|next page|share|close full-screen|full screen|show keyboard|screen reader|skip to|navigating|select all|clear selections|^[+\-–—]$|^\d+%$/i;
      const names: string[] = [];
      const seen = new Set<string>();
      const push = (raw: string) => {
        const value = clean(raw);
        if (!value || value.length > 60 || value.length < 2) {
          return;
        }
        if (chrome.test(value)) {
          return;
        }
        const key = value.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        names.push(value);
      };

      // Publish-to-web: abas reais ficam em button.sectionItem (ex.: "Página inicial", "Geral")
      document
        .querySelectorAll(
          'button.sectionItem, .sectionItem[aria-label], [role="tab"], .pageNavigation button, [class*="pageNavigation"] button, [class*="pages"] button, [aria-label^="Page "]',
        )
        .forEach((el) => {
          // Preferir aria-label; textContent em sectionItemHidden duplica o mesmo nome
          push(el.getAttribute('aria-label') || '');
          if (!el.getAttribute('aria-label')) {
            push(el.textContent || '');
          }
        });

      // Fallback legados (relatórios sem sectionItem)
      for (const candidate of ['Capa', 'Detalhe', 'Resumo', 'Indicadores']) {
        if (document.body?.innerText?.includes(candidate)) {
          push(candidate);
        }
      }

      return names.slice(0, 20);
    });

    // #region agent log
    fetch('http://127.0.0.1:7570/ingest/0db2c04a-a5ac-44c9-a409-caf72cacc101', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '8bed27',
      },
      body: JSON.stringify({
        sessionId: '8bed27',
        runId: 'post-fix',
        hypothesisId: 'H3',
        location: 'powerbi-public-explore.service.ts:listPages',
        message: 'listPages result',
        data: { count: names.length, names },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return names;
  }

  private async listSlicerNames(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const clean = (v: string | null | undefined) =>
        (v ?? '').replace(/\s+/g, ' ').trim();
      const names: string[] = [];
      const seen = new Set<string>();
      const push = (raw: string) => {
        const value = clean(raw)
          .replace(/\(not yet applied\)/gi, '')
          .replace(/slicer/gi, '')
          .replace(/press enter.*/gi, '')
          .trim();
        if (!value || value.length < 1 || value.length > 60) {
          return;
        }
        if (
          /clear selections|page navigation|previous page|next page|zoom|keyboard|screen reader/i.test(
            value,
          )
        ) {
          return;
        }
        const key = value.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        names.push(value);
      };

      // Segmentadores padrão Power BI (dropdown)
      document
        .querySelectorAll(
          'h3.slicer-header-text, .slicer-dropdown-menu[role="combobox"], .visual-slicer .slicer-header-text',
        )
        .forEach((el) => {
          push(el.getAttribute('aria-label') || el.textContent || '');
        });

      // Fallback legado
      document
        .querySelectorAll(
          '[aria-label*="Slicer" i], [aria-label*="slicer" i]',
        )
        .forEach((el) => {
          push(el.getAttribute('aria-label') || '');
        });

      return names.slice(0, 16);
    });
  }

  private async ensureSlicersVisible(page: Page): Promise<void> {
    const maxSteps = Math.min(env.AI_DASHBOARD_EXPLORE_MAX_PAGES ?? 6, 8);
    if ((await this.listSlicerNames(page)).length > 0) {
      return;
    }
    for (let i = 0; i < maxSteps; i++) {
      const next = page.locator('[aria-label="Next Page"]').first();
      if ((await next.count()) === 0) {
        break;
      }
      const disabled = await next.getAttribute('aria-disabled');
      if (disabled === 'true') {
        break;
      }
      await next.click({ timeout: 4000 }).catch(() => undefined);
      await delay(2000);
      if ((await this.listSlicerNames(page)).length > 0) {
        // #region agent log
        fetch('http://127.0.0.1:7570/ingest/0db2c04a-a5ac-44c9-a409-caf72cacc101', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '8bed27',
          },
          body: JSON.stringify({
            sessionId: '8bed27',
            runId: 'post-fix-slicers',
            hypothesisId: 'H7',
            location: 'powerbi-public-explore.service.ts:ensureSlicersVisible',
            message: 'found slicers after Next Page',
            data: {
              steps: i + 1,
              page: await this.getSelectedPageName(page),
              names: await this.listSlicerNames(page),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        return;
      }
    }
  }

  private async getSelectedPageName(page: Page): Promise<string | null> {
    return page.evaluate(() => {
      const el = document.querySelector('button.sectionItem.selected');
      const value = (
        el?.getAttribute('aria-label') ||
        el?.textContent ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      return value || null;
    });
  }

  private async listSlicersWithValues(
    page: Page,
  ): Promise<
    Array<{ nome: string; valores?: string[]; valoresAmostra?: string[] }>
  > {
    const slicerNames = await this.listSlicerNames(page);

    const result: Array<{
      nome: string;
      valores?: string[];
      valoresAmostra?: string[];
    }> = [];

    for (const nome of slicerNames) {
      const values = await this.readSlicerValues(page, nome);
      result.push({
        nome,
        valores:
          values.length > 0 && values.length <= 30 ? values : undefined,
        valoresAmostra:
          values.length > 30 ? values.slice(0, 20) : undefined,
      });
    }

    return result;
  }

  private async slicerDropdownLocator(page: Page, nome: string) {
    const exact = page
      .locator(
        `.slicer-dropdown-menu[role="combobox"][aria-label="${nome}"]`,
      )
      .first();
    if ((await exact.count()) > 0) {
      return exact;
    }
    const partial = page
      .locator(
        `.slicer-dropdown-menu[role="combobox"][aria-label*="${nome}" i]`,
      )
      .first();
    if ((await partial.count()) > 0) {
      return partial;
    }
    return page
      .locator(`h3.slicer-header-text[aria-label="${nome}"]`)
      .first();
  }

  private async closeSlicerPopup(page: Page): Promise<void> {
    for (let i = 0; i < 4; i++) {
      const open = await page.locator('.slicer-dropdown-popup.focused').count();
      if (open === 0) {
        return;
      }
      await page.keyboard.press('Escape').catch(() => undefined);
      await delay(300);
    }
    // Escape às vezes não remove .focused — clicar no canvas ajuda
    await page
      .locator('.displayArea, .explorationCanvas, [aria-label="Power BI Report"]')
      .first()
      .click({ timeout: 1500, force: true })
      .catch(() => undefined);
    await delay(300);
  }

  private async readSlicerValues(page: Page, nome: string): Promise<string[]> {
    try {
      const locator = await this.slicerDropdownLocator(page, nome);
      if ((await locator.count()) === 0) {
        return [];
      }
      await this.closeSlicerPopup(page);

      const beforeCount = await page
        .locator('.slicer-dropdown-popup')
        .filter({ hasText: /\S/ })
        .count();

      await locator.click({ timeout: 4000 });
      await delay(1500);

      // Esperar surgir conteúdo novo (ou focused count aumentar)
      await page
        .waitForFunction(
          (prev) => {
            const filled = Array.from(
              document.querySelectorAll('.slicer-dropdown-popup'),
            ).filter((el) => (el.textContent || '').trim().length > 1);
            const focused = document.querySelectorAll(
              '.slicer-dropdown-popup.focused',
            ).length;
            return filled.length > prev || focused > 0;
          },
          beforeCount,
          { timeout: 5000 },
        )
        .catch(() => undefined);

      const values = await page.evaluate(() => {
        const clean = (v: string | null | undefined) =>
          (v ?? '').replace(/\s+/g, ' ').trim();
        const out: string[] = [];
        const seen = new Set<string>();

        const focused = Array.from(
          document.querySelectorAll('.slicer-dropdown-popup.focused'),
        ).filter((el) => clean(el.textContent).length > 1);
        // Último focused com texto = popup recém aberto
        const popup =
          focused[focused.length - 1] ||
          Array.from(document.querySelectorAll('.slicer-dropdown-popup'))
            .filter((el) => clean(el.textContent).length > 1)
            .at(-1);
        if (!popup) {
          return out;
        }

        popup
          .querySelectorAll(
            '.slicerItemContainer, .slicerItem, [class*="slicerItem"], [role="treeitem"]',
          )
          .forEach((el) => {
            const text = clean(
              el.getAttribute('aria-label') || el.textContent,
            );
            if (!text || text.length > 80) {
              return;
            }
            if (/^select all$|^all$|^todos$/i.test(text)) {
              return;
            }
            const key = text.toLowerCase();
            if (seen.has(key)) {
              return;
            }
            seen.add(key);
            out.push(text);
          });

        if (out.length === 0) {
          popup.querySelectorAll('span, div, label').forEach((el) => {
            if (el.children.length > 0) {
              return;
            }
            const text = clean(el.textContent);
            if (!text || text.length > 60 || text.length < 2) {
              return;
            }
            if (/^select all$|^all$|^todos$/i.test(text)) {
              return;
            }
            const key = text.toLowerCase();
            if (seen.has(key)) {
              return;
            }
            seen.add(key);
            out.push(text);
          });
        }

        return out.slice(0, 60);
      });
      await this.closeSlicerPopup(page);
      return values;
    } catch {
      await this.closeSlicerPopup(page).catch(() => undefined);
      return [];
    }
  }

  private async applySlicer(
    page: Page,
    nome: string,
    valor: string,
  ): Promise<boolean> {
    try {
      const slicer = await this.slicerDropdownLocator(page, nome);
      if ((await slicer.count()) === 0) {
        return false;
      }
      await this.closeSlicerPopup(page);
      await slicer.click({ timeout: 4000 });
      await delay(1000);

      // Popup ligado ao listbox do segmentador (evita pegar popup stale de outro slicer)
      const popup = page
        .locator('.slicer-dropdown-popup')
        .filter({
          has: page.locator(
            `.slicerBody[aria-label="${nome}"], .slicerBody[aria-label*="${nome}" i]`,
          ),
        })
        .last();
      await popup.waitFor({ state: 'attached', timeout: 4000 }).catch(() => undefined);
      if ((await popup.count()) === 0) {
        await this.closeSlicerPopup(page);
        return false;
      }

      // Expandir busca (header costuma estar collapsed / invisível ao Playwright)
      await popup
        .evaluate((root) => {
          const icon = root.querySelector('.searchIcon') as HTMLElement | null;
          icon?.click();
          const input = root.querySelector(
            'input.searchInput',
          ) as HTMLInputElement | null;
          if (input) {
            input.focus();
          }
        })
        .catch(() => undefined);
      await delay(300);

      const search = popup.locator('input.searchInput').first();
      if ((await search.count()) > 0) {
        await search.fill(valor, { force: true, timeout: 3000 }).catch(() => undefined);
        await delay(700);
      }

      const clickItem = async () => {
        const byTitle = popup.locator(
          `.slicerItemContainer[title="${valor}"]`,
        );
        if ((await byTitle.count()) > 0) {
          await byTitle.first().click({ force: true, timeout: 4000 });
          return true;
        }
        const byText = popup
          .locator('.slicerItemContainer')
          .filter({
            hasText: new RegExp(`^\\s*${escapeRegex(valor)}\\s*$`, 'i'),
          })
          .first();
        if ((await byText.count()) > 0) {
          await byText.click({ force: true, timeout: 4000 });
          return true;
        }
        return false;
      };

      if (await clickItem()) {
        await delay(1000);
        await this.closeSlicerPopup(page);
        return true;
      }

      // Lista virtualizada: rolar .scroll-content até o item existir no DOM
      for (let i = 0; i < 45; i++) {
        await popup.locator('.slicerBody').evaluate((el) => {
          const sc = el.querySelector('.scroll-content') as HTMLElement | null;
          if (sc) {
            sc.scrollTop += 100;
          }
        });
        await delay(120);
        if (await clickItem()) {
          await delay(1000);
          await this.closeSlicerPopup(page);
          return true;
        }
      }

      await this.closeSlicerPopup(page);
      return false;
    } catch {
      return false;
    }
  }

  private async navigateToPage(page: Page, aba: string): Promise<boolean> {
    try {
      const selected = await this.getSelectedPageName(page);
      if (selected && selected.toLowerCase() === aba.toLowerCase()) {
        return true;
      }

      // sectionItem de outras abas fica no flyout (não visível) — force click
      const bySectionAria = page
        .locator(`button.sectionItem[aria-label="${aba}"]`)
        .first();
      if ((await bySectionAria.count()) > 0) {
        await bySectionAria.click({ force: true, timeout: 4000 });
        await delay(1500);
        const after = await this.getSelectedPageName(page);
        if (after && after.toLowerCase() === aba.toLowerCase()) {
          return true;
        }
      }

      // Fallback: Previous/Next Page até a aba alvo
      if (await this.walkToPage(page, aba)) {
        return true;
      }

      const byRole = page
        .getByRole('tab', { name: new RegExp(escapeRegex(aba), 'i') })
        .first();
      if ((await byRole.count()) > 0) {
        await byRole.click({ force: true, timeout: 4000 });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async walkToPage(page: Page, aba: string): Promise<boolean> {
    const maxSteps = 12;
    const tryDirection = async (aria: 'Next Page' | 'Previous Page') => {
      for (let i = 0; i < maxSteps; i++) {
        const cur = await this.getSelectedPageName(page);
        if (cur && cur.toLowerCase() === aba.toLowerCase()) {
          return true;
        }
        const btn = page.locator(`[aria-label="${aria}"]`).first();
        if ((await btn.count()) === 0) {
          return false;
        }
        const disabled = await btn.getAttribute('aria-disabled');
        if (disabled === 'true') {
          return false;
        }
        await btn.click({ timeout: 3000 }).catch(() => undefined);
        await delay(1800);
      }
      const cur = await this.getSelectedPageName(page);
      return Boolean(cur && cur.toLowerCase() === aba.toLowerCase());
    };

    if (await tryDirection('Next Page')) {
      return true;
    }
    return tryDirection('Previous Page');
  }

  private async extractCurrentView(page: Page): Promise<PowerBiExtractPage> {
    return page.evaluate(() => {
      const clean = (value: string | null | undefined): string =>
        (value ?? '').replace(/\s+/g, ' ').trim();

      const titulo = clean(document.title) || null;
      const kpis: string[] = [];
      document
        .querySelectorAll(
          '[aria-label*="card" i], [aria-label*="Card"], visual-container [aria-label], .visualContainer [aria-label]',
        )
        .forEach((el) => {
          const label = clean(el.getAttribute('aria-label'));
          if (label && label.length <= 240) {
            kpis.push(label);
          }
        });

      const textos: string[] = [];
      const seen = new Set<string>();
      const push = (value: string) => {
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
        .querySelectorAll('[aria-label], .textRun, h1, h2, h3')
        .forEach((el) => {
          push(clean(el.getAttribute('aria-label')));
          push(clean(el.textContent));
        });

      (document.body?.innerText ?? '')
        .split('\n')
        .map((line) => clean(line))
        .filter(Boolean)
        .slice(0, 250)
        .forEach(push);

      return {
        titulo,
        kpis: [...new Set(kpis)].slice(0, 80),
        tabelas: [],
        textos: textos.slice(0, 200),
      };
    });
  }

  private async launchBrowser(): Promise<Browser> {
    const args = ['--disable-dev-shm-usage', '--no-sandbox'];
    try {
      return await chromium.launch({ headless: true, args });
    } catch {
      return chromium.launch({ headless: true, channel: 'chrome', args });
    }
  }

  private async waitForReady(page: Page): Promise<void> {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const count = await page
        .locator('[aria-label], visual-container, canvas, [class*="visual"]')
        .count()
        .catch(() => 0);
      if (count > 0) {
        await delay(1500);
        return;
      }
      await delay(400);
    }
  }

  private async collectAccessibilityTexts(page: Page): Promise<string[]> {
    try {
      const client = await page.context().newCDPSession(page);
      const result = (await client.send('Accessibility.getFullAXTree')) as {
        nodes?: Array<{ name?: { value?: string }; role?: { value?: string } }>;
      };
      const texts: string[] = [];
      const seen = new Set<string>();
      for (const node of result.nodes ?? []) {
        const name = (node.name?.value ?? '').replace(/\s+/g, ' ').trim();
        if (!name || name.length < 2 || name.length > 300) {
          continue;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        texts.push(name);
      }
      await client.detach().catch(() => undefined);
      return texts.slice(0, 400);
    } catch {
      return [];
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
