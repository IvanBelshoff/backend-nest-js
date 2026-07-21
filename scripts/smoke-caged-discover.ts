/**
 * Smoke: discovery no Novo Caged (Publish to web).
 */
import 'dotenv/config';
import { PowerbiPublicExploreService } from '../src/ai/powerbi-public-explore.service';

const URL =
  process.argv[2] ||
  'https://app.powerbi.com/view?r=eyJrIjoiNWI5NWI0ODEtYmZiYy00Mjg3LTkzNWUtY2UyYjIwMDE1YWI2IiwidCI6IjNlYzkyOTY5LTVhNTEtNGYxOC04YWM5LWVmOThmYmFmYTk3OCJ9';

async function main() {
  const service = new PowerbiPublicExploreService();
  console.log('discover() starting...');
  const mapa = await service.discover({ url: URL });
  console.log(JSON.stringify(mapa, null, 2));

  const expected = [
    'Página inicial',
    'Geral',
    'Setorial',
    'Geográfico',
    'Vínculo',
    'Novo Caged',
  ];
  const missing = expected.filter(
    (name) => !mapa.abas.some((a) => a.toLowerCase() === name.toLowerCase()),
  );
  if (missing.length) {
    console.error('Smoke FAILED: abas faltando:', missing, 'got:', mapa.abas);
    process.exit(1);
  }
  console.log(`Smoke OK: abas=${mapa.abas.length} → ${mapa.abas.join(' | ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
