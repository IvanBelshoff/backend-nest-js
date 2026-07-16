import { Relatorio } from 'src/database/entities/Relatorios';
import { Usuario } from 'src/database/entities/Usuarios';
import { UsuarioRelatorio } from 'src/database/entities/UsuarioRelatorio';

export type RelatorioGrantInput = {
  id: number;
  permitirConhecimentoIa?: boolean;
};

export function getUsuarioRelatorios(user: Usuario): Relatorio[] {
  return (user.usuarioRelatorios ?? [])
    .map((grant) => grant.relatorio)
    .filter((relatorio): relatorio is Relatorio => relatorio != null);
}

export function getRelatorioAssignedUsers(relatorio: Relatorio): Usuario[] {
  return (relatorio.usuarioRelatorios ?? [])
    .map((grant) => grant.usuario)
    .filter((usuario): usuario is Usuario => usuario != null);
}

export function userHasRelatorioGrant(user: Usuario, relatorioId: number): boolean {
  return (user.usuarioRelatorios ?? []).some(
    (grant) => Number(grant.relatorioId) === Number(relatorioId),
  );
}

export function relatorioHasUserGrant(relatorio: Relatorio, userId: number): boolean {
  return (relatorio.usuarioRelatorios ?? []).some(
    (grant) => Number(grant.usuarioId) === Number(userId),
  );
}

export function buildUsuarioRelatorioGrants(
  usuarioId: number,
  grants: RelatorioGrantInput[],
  existing: UsuarioRelatorio[] = [],
): UsuarioRelatorio[] {
  const existingByRelatorioId = new Map(
    existing.map((grant) => [Number(grant.relatorioId), grant]),
  );

  return grants.map((grant) => {
    const current = existingByRelatorioId.get(grant.id);
    const entity = current ?? new UsuarioRelatorio();
    entity.usuarioId = usuarioId;
    entity.relatorioId = grant.id;
    entity.permitirConhecimentoIa =
      grant.permitirConhecimentoIa ?? current?.permitirConhecimentoIa ?? false;
    return entity;
  });
}

export function buildRelatorioUsuarioGrants(
  relatorioId: number,
  grants: Array<{ id: number; permitirConhecimentoIa?: boolean }>,
  existing: UsuarioRelatorio[] = [],
): UsuarioRelatorio[] {
  const existingByUsuarioId = new Map(
    existing.map((grant) => [Number(grant.usuarioId), grant]),
  );

  return grants.map((grant) => {
    const current = existingByUsuarioId.get(grant.id);
    const entity = current ?? new UsuarioRelatorio();
    entity.usuarioId = grant.id;
    entity.relatorioId = relatorioId;
    entity.permitirConhecimentoIa =
      grant.permitirConhecimentoIa ?? current?.permitirConhecimentoIa ?? false;
    return entity;
  });
}
