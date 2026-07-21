/**
 * Diagnóstico: como expandir e listar todas as abas do Publish-to-web.
 */
import 'dotenv/config';
import { appendFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const TARGET =
  process.argv[2] ||
  'https://app.powerbi.com/view?r=eyJrIjoiNWI5NWI0ODEtYmZiYy00Mjg3LTkzNWUtY2UyYjIwMDE1YWI2IiwidCI6IjNlYzkyOTY5LTVhNTEtNGYxOC04YWM5LWVmOThmYmFmYTk3OCJ9';

const LOG =
  '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-8bed27.log';

function log(hypothesisId: string, message: string, data: Record<string, unknown>) {
  appendFileSync(
    LOG,
    JSON.stringify({
      sessionId: '8bed27',
      runId: 'pages-debug-2',
      hypothesisId,
      location: 'smoke-list-pages-debug.ts',
      message,
      data,
      timestamp: Date.now(),
    }) + '\n',
  );
}

async function collectSectionItems(page: Page) {
  return page.evaluate(() => {
    const clean = (v: string | null | undefined) =>
      (v ?? '').replace(/\s+/g, ' ').trim();
    const items = Array.from(
      document.querySelectorAll(
        'button.sectionItem, .sectionItem, [class*="sectionItem"]',
      ),
    ).map((el) => ({
      aria: clean(el.getAttribute('aria-label')),
      text: clean(el.textContent).slice(0, 80),
      selected: el.classList.contains('selected'),
      cls: (el.getAttribute('class') || '').slice(0, 100),
    }));
    const pageOf = (document.body?.innerText || '').match(/(\d+)\s*of\s*(\d+)/i);
    return {
      items,
      pageOf: pageOf ? { current: pageOf[1], total: pageOf[2] } : null,
    };
  });
}

async function main() {
  const url = new globalThis.URL(TARGET);
  url.searchParams.set('pageView', 'fitToWidth');
  // espelha produção
  url.searchParams.set('chromeless', '1');

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(5000);

    const before = await collectSectionItems(page);
    log('H3', 'sectionItems before expand', before as unknown as Record<string, unknown>);
    console.log('BEFORE', JSON.stringify(before, null, 2));

    // Hipótese H3: clicar no botão da página atual abre a lista
    const selected = page.locator('button.sectionItem.selected, .sectionItem.selected').first();
    if ((await selected.count()) > 0) {
      await selected.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(1000);
    }
    const afterSelectedClick = await collectSectionItems(page);
    log(
      'H3',
      'sectionItems after selected click',
      afterSelectedClick as unknown as Record<string, unknown>,
    );
    console.log('AFTER selected click', JSON.stringify(afterSelectedClick, null, 2));

    // Hipótese H4: botão Pages / Page navigation / "Go back" área
    const openers = [
      '[aria-label="Page navigation"]',
      '[aria-label*="Page navigation" i]',
      '[aria-label*="Pages" i]',
      '[aria-label*="Páginas" i]',
      'button:has-text("Pages")',
      '[class*="pagesPane"]',
      '[class*="pageNavigation"]',
      '[aria-label="Go back"]',
    ];
    for (const sel of openers) {
      const loc = page.locator(sel).first();
      const count = await loc.count();
      if (count > 0) {
        await loc.click({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        const after = await collectSectionItems(page);
        log('H4', `after click ${sel}`, {
          opener: sel,
          itemCount: after.items.length,
          items: after.items,
        });
        console.log(`OPENER ${sel}`, after.items.length, after.items.map((i) => i.aria || i.text));
      }
    }

    // Hipótese H5: navegar com Next Page e coletar nomes
    const walked: string[] = [];
    for (let i = 0; i < 8; i++) {
      const cur = await collectSectionItems(page);
      const name =
        cur.items.find((x) => x.selected)?.aria ||
        cur.items.find((x) => x.selected)?.text ||
        `page-${i}`;
      if (!walked.includes(name)) walked.push(name);
      const next = page.locator('[aria-label="Next Page"]').first();
      if ((await next.count()) === 0) break;
      const disabled = await next.getAttribute('aria-disabled');
      if (disabled === 'true') break;
      await next.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
    }
    log('H5', 'walked via Next Page', { walked, count: walked.length });
    console.log('WALKED', walked);

    // Dump HTML classes around sectionItem parent
    const navHtml = await page.evaluate(() => {
      const el =
        document.querySelector('button.sectionItem, .sectionItem') ||
        document.querySelector('[aria-label="Next Page"]');
      const root = el?.closest('[class*="nav"], [class*="page"], exploration-footer, footer') || el?.parentElement?.parentElement;
      return {
        parentClass: root?.getAttribute('class') || null,
        html: (root?.outerHTML || '').slice(0, 2500),
      };
    });
    log('H6', 'nav chrome html sample', {
      parentClass: navHtml.parentClass,
      htmlLen: navHtml.html.length,
      html: navHtml.html.slice(0, 1500),
    });
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
