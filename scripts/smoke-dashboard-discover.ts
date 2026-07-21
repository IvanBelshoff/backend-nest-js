/**
 * Smoke: discovery Playwright no BI Senac (Publish to web).
 * Uso: PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npx ts-node -r dotenv/config -r tsconfig-paths/register scripts/smoke-dashboard-discover.ts
 */
import 'dotenv/config';
import { PowerbiPublicExploreService } from '../src/ai/powerbi-public-explore.service';

const URL =
  'https://app.powerbi.com/view?r=eyJrIjoiZTkyNGU2MjctM2RhNC00YzQ4LTgyZGItMDY1ZmE4NWQzYTA4IiwidCI6ImFiMDVjMmE3LTI1NTctNDM4MS04ZTkzLWQxN2QwZWM5ODg1YSJ9';

async function main() {
  const service = new PowerbiPublicExploreService();
  console.log('discover() starting...');
  const mapa = await service.discover({ url: URL });
  console.log(JSON.stringify(mapa, null, 2));

  const hasAno = mapa.filtros.some(
    (f) =>
      /ano/i.test(f.nome) &&
      Boolean(f.valores?.length || f.valoresAmostra?.length),
  );
  const hasVigencia = mapa.destaquesCapa.some((d) => /vig[eê]ncia/i.test(d));

  if (!hasAno && !hasVigencia && mapa.destaquesCapa.length === 0) {
    console.error('Smoke FAILED: mapa vazio demais');
    process.exit(1);
  }

  console.log(
    `Smoke OK: abas=${mapa.abas.length} filtros=${mapa.filtros.length} destaques=${mapa.destaquesCapa.length} ano=${hasAno} vigencia=${hasVigencia}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
