export type AuditUsuarioDisplaySource = {
  id: number
  nome: string
  sobrenome: string
  email: string
}

export function formatAuditUsuarioDisplay(user: AuditUsuarioDisplaySource): string {
  const name = `${user.nome} ${user.sobrenome}`.trim()
  return `${name} (${user.email}) #${user.id}`
}

export function formatAuditUsuarioDisplayById(userId: number): string {
  return `Usuário #${userId}`
}

export function buildAuditUsuarioDisplayMap(
  usuarios: AuditUsuarioDisplaySource[],
): Map<number, AuditUsuarioDisplaySource> {
  const map = new Map<number, AuditUsuarioDisplaySource>()

  for (const usuario of usuarios) {
    map.set(Number(usuario.id), usuario)
  }

  return map
}

export function buildAuditUsuarioDisplayLabels(
  ids: number[],
  usuariosById: Map<number, AuditUsuarioDisplaySource>,
): string[] {
  return ids.map((id) => {
    const usuario = usuariosById.get(id)
    return usuario ? formatAuditUsuarioDisplay(usuario) : formatAuditUsuarioDisplayById(id)
  })
}

export function mergeAuditUsuarioDisplaySources(
  ...groups: AuditUsuarioDisplaySource[][]
): AuditUsuarioDisplaySource[] {
  const map = new Map<number, AuditUsuarioDisplaySource>()

  for (const group of groups) {
    for (const usuario of group) {
      map.set(Number(usuario.id), usuario)
    }
  }

  return Array.from(map.values())
}
