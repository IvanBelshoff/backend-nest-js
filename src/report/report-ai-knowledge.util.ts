import { Privacidade } from 'src/database/entities/privacidade.enum';
import type { Relatorio } from 'src/database/entities/Relatorios';

type RelatorioAiKnowledgeInput = Pick<
  Relatorio,
  'usuarioRelatorios' | 'privacidade' | 'visivel'
>;

export function isPublicVisibleReport(
  relatorio: Pick<Relatorio, 'privacidade' | 'visivel'>,
): boolean {
  return (
    relatorio.privacidade === Privacidade.PUBLIC && relatorio.visivel !== false
  );
}

export function resolvePermitirConhecimentoIa(
  relatorio: RelatorioAiKnowledgeInput,
  userId: number,
): boolean {
  if (isPublicVisibleReport(relatorio)) {
    return true;
  }

  const grant = relatorio.usuarioRelatorios?.find(
    (usuarioRelatorio) => Number(usuarioRelatorio.usuarioId) === Number(userId),
  );

  return grant?.permitirConhecimentoIa ?? false;
}
