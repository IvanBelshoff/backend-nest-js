import { Permissao } from 'src/database/entities/Permissoes';

import { PartialType } from '@nestjs/mapped-types';

export class UpdatePermissionDto extends PartialType(Permissao) {
  regra_id?: number;
}
