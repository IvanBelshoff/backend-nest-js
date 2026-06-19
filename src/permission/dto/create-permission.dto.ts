import { Permissao } from 'src/database/entities/Permissoes';

import { PartialType } from '@nestjs/mapped-types';

export class CreatePermissionDto extends PartialType(Permissao) {
  regra_id!: number;
}
