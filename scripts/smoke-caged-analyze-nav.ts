/**
 * Smoke: navegar para Geral + aplicar UF=Espírito Santo + extract KPIs.
 */
import 'dotenv/config';
import { PowerbiPublicExploreService } from '../src/ai/powerbi-public-explore.service';

const URL =
  'https://app.powerbi.com/view?r=eyJrIjoiNWI5NWI0ODEtYmZiYy00Mjg3LTkzNWUtY2UyYjIwMDE1YWI2IiwidCI6IjNlYzkyOTY5LTVhNTEtNGYxOC04YWM5LWVmOThmYmFmYTk3OCJ9';

async function main() {
  const service = new PowerbiPublicExploreService();
  const result = await service.analyze({
    url: URL,
    plano: {
      abas: ['Geral'],
      filtros: [{ nome: 'UF', valor: 'Espírito Santo' }],
      objetivo: 'smoke nav+filtro',
    } as any,
  });
  console.log(JSON.stringify(result, null, 2));
  const navOk = result.paginas.some((p) => /geral/i.test(p.nomeAba));
  const filtroOk = result.filtrosAplicados.some((f) => f.nome === 'UF' && f.ok);
  const hasKpi = result.paginas.some((p) =>
    p.kpis.some((k) => /admiss|deslig|saldo|estoque/i.test(k)),
  );
  if (!navOk || !filtroOk || !hasKpi) {
    console.error('Smoke FAILED', { navOk, filtroOk, hasKpi });
    process.exit(1);
  }
  console.log('Smoke OK: nav+UF+KPIs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
