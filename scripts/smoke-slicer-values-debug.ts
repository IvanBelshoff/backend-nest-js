import 'dotenv/config';
import { appendFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TARGET =
  'https://app.powerbi.com/view?r=eyJrIjoiNWI5NWI0ODEtYmZiYy00Mjg3LTkzNWUtY2UyYjIwMDE1YWI2IiwidCI6IjNlYzkyOTY5LTVhNTEtNGYxOC04YWM5LWVmOThmYmFmYTk3OCJ9';
const LOG =
  '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-8bed27.log';

function log(message: string, data: Record<string, unknown>) {
  appendFileSync(
    LOG,
    JSON.stringify({
      sessionId: '8bed27',
      runId: 'slicer-values-3',
      hypothesisId: 'H9',
      location: 'smoke-slicer-values-debug.ts',
      message,
      data,
      timestamp: Date.now(),
    }) + '\n',
  );
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
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.locator('[aria-label="Next Page"]').click();
    await page.waitForTimeout(2500);

    for (const nome of ['Ano, Mês', 'UF', 'Sexo', 'Grande Grupamento']) {
      // close
      for (let i = 0; i < 3; i++) {
        const n = await page.locator('.slicer-dropdown-popup.focused').count();
        if (n === 0) break;
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      const before = await page.evaluate(() => ({
        focused: document.querySelectorAll('.slicer-dropdown-popup.focused').length,
        anyPopupText: Array.from(document.querySelectorAll('.slicer-dropdown-popup'))
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)),
      }));

      const dd = page.locator(
        `.slicer-dropdown-menu[role="combobox"][aria-label="${nome}"]`,
      );
      await dd.scrollIntoViewIfNeeded().catch(() => undefined);
      await dd.click({ timeout: 4000 });
      await page.waitForTimeout(1500);

      const after = await page.evaluate(() => {
        const clean = (v: string | null | undefined) =>
          (v ?? '').replace(/\s+/g, ' ').trim();
        const focused = document.querySelector('.slicer-dropdown-popup.focused');
        const items = focused
          ? Array.from(
              focused.querySelectorAll(
                '.slicerItemContainer, .slicerItem, [class*="slicerItem"]',
              ),
            )
              .map((el) => clean(el.getAttribute('aria-label') || el.textContent))
              .filter(Boolean)
              .slice(0, 15)
          : [];
        const leaves = focused
          ? Array.from(focused.querySelectorAll('span, div, label'))
              .filter((el) => el.children.length === 0)
              .map((el) => clean(el.textContent))
              .filter((t) => t && t.length >= 2 && t.length <= 60)
              .slice(0, 15)
          : [];
        return {
          focusedCount: document.querySelectorAll('.slicer-dropdown-popup.focused').length,
          focusedText: clean(focused?.textContent).slice(0, 200),
          focusedCls: focused?.getAttribute('class') || null,
          items,
          leaves,
        };
      });

      log(`slicer ${nome}`, { before, after });
      console.log('\n===', nome, '===');
      console.log(JSON.stringify({ before, after }, null, 2));
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
