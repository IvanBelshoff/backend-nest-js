/**
 * Diagnóstico: segmentadores na aba Geral (via Next Page / force click).
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
      runId: 'slicers-debug-2',
      hypothesisId,
      location: 'smoke-slicers-debug.ts',
      message,
      data,
      timestamp: Date.now(),
    }) + '\n',
  );
}

async function currentSection(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('button.sectionItem.selected');
    return (
      (el?.getAttribute('aria-label') || el?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim() || null
    );
  });
}

async function dumpSlicers(page: Page, label: string) {
  const dump = await page.evaluate(() => {
    const clean = (v: string | null | undefined) =>
      (v ?? '').replace(/\s+/g, ' ').trim();

    const allAria = Array.from(document.querySelectorAll('[aria-label]'))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        aria: clean(el.getAttribute('aria-label')),
        cls: (el.getAttribute('class') || '').slice(0, 60),
      }))
      .filter((x) => x.aria && x.aria.length <= 120);

    const filterLike = allAria.filter((x) =>
      /slicer|ano|m[eê]s|uf|munic|sexo|grupamento|filtro|dropdown|combo/i.test(
        x.aria,
      ),
    );

    // Títulos de visuais (Power BI)
    const titles = Array.from(
      document.querySelectorAll(
        '.visualTitle, [class*="visualTitle"], [class*="VisualTitle"], h3, .title',
      ),
    )
      .map((el) => clean(el.textContent))
      .filter((t) => t && t.length < 80);

    // Combobox / listbox roles
    const roles = Array.from(
      document.querySelectorAll(
        '[role="combobox"], [role="listbox"], [role="button"][aria-haspopup], .slicer-dropdown, [class*="slicer"]',
      ),
    ).map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      aria: clean(el.getAttribute('aria-label')).slice(0, 100),
      text: clean(el.textContent).slice(0, 60),
      cls: (el.getAttribute('class') || '').slice(0, 80),
    }));

    const bodyKeys = [
      'Ano',
      'Mês',
      'UF',
      'Município',
      'Sexo',
      'Grande Grupamento',
      'Admissões',
      'Desligamentos',
      'Saldo',
    ].map((k) => ({ key: k, present: (document.body?.innerText || '').includes(k) }));

    return {
      currentPage: clean(
        document.querySelector('button.sectionItem.selected')?.getAttribute('aria-label') ||
          '',
      ),
      filterLike: filterLike.slice(0, 40),
      titles: [...new Set(titles)].slice(0, 40),
      roles: roles.slice(0, 40),
      bodyKeys,
      ariaSample: allAria.slice(0, 50).map((x) => x.aria),
    };
  });
  log(label, 'slicer dump', dump as unknown as Record<string, unknown>);
  console.log(label, JSON.stringify(dump, null, 2));
  return dump;
}

async function goNext(page: Page) {
  const next = page.locator('[aria-label="Next Page"]').first();
  if ((await next.count()) === 0) return false;
  await next.click({ timeout: 4000 });
  await page.waitForTimeout(2200);
  return true;
}

async function goToByNext(page: Page, target: string, max = 8) {
  for (let i = 0; i < max; i++) {
    const cur = await currentSection(page);
    if (cur && cur.toLowerCase() === target.toLowerCase()) return true;
    if (!(await goNext(page))) return false;
  }
  return false;
}

async function goToForceClick(page: Page, name: string) {
  const btn = page.locator(`button.sectionItem[aria-label="${name}"]`).first();
  if ((await btn.count()) === 0) return false;
  await btn.click({ force: true, timeout: 4000 });
  await page.waitForTimeout(2200);
  return true;
}

async function main() {
  const url = new globalThis.URL(TARGET);
  url.searchParams.set('pageView', 'fitToWidth');
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

    await dumpSlicers(page, 'H1_capa');

    // H2a: Next Page até Geral
    const viaNext = await goToByNext(page, 'Geral');
    log('H2a', 'navigate via Next Page', {
      ok: viaNext,
      page: await currentSection(page),
    });
    console.log('viaNext', viaNext, await currentSection(page));
    if (viaNext) {
      await dumpSlicers(page, 'H2a_geral_next');
    } else {
      // voltar à capa e tentar force
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      const viaForce = await goToForceClick(page, 'Geral');
      log('H2b', 'navigate via force click', {
        ok: viaForce,
        page: await currentSection(page),
      });
      console.log('viaForce', viaForce, await currentSection(page));
      await dumpSlicers(page, 'H2b_geral_force');
    }

    // H3: clicar textos Ano / UF
    for (const text of ['Ano', 'UF', 'Município', 'Sexo', 'Grande Grupamento']) {
      const loc = page.getByText(text, { exact: true }).first();
      if ((await loc.count()) === 0) {
        log('H3', `missing text ${text}`, {});
        continue;
      }
      await loc.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(900);
      const options = await page.evaluate(() => {
        const clean = (v: string | null | undefined) =>
          (v ?? '').replace(/\s+/g, ' ').trim();
        return Array.from(
          document.querySelectorAll(
            '[role="option"], [role="checkbox"], .slicerItem, [class*="slicerItem"], [class*="slicer-restatement"]',
          ),
        )
          .map((el) => clean(el.getAttribute('aria-label') || el.textContent))
          .filter(Boolean)
          .slice(0, 30);
      });
      log('H3', `click text ${text}`, {
        optionsCount: options.length,
        options: options.slice(0, 20),
      });
      console.log('click', text, options.slice(0, 12));
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
