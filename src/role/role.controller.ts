import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Authorization } from 'src/shared/decorators/authorization.decorator';
import { RoleService } from './role.service';

@Controller('role')
@ApiTags('role')
@ApiBearerAuth('access-token')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get('/')
  @Authorization('role', ['REGRA_ADMIN'])
  @ApiOperation({ summary: 'Lista todas as regras com permissões aninhadas' })
  async findAll() {
    return this.roleService.findAll();
  }
}
