import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Authorization } from 'src/shared/decorators/authorization.decorator';
import { ZodQueryValidation } from 'src/shared/decorators/zod-validation.decorator';
import { AuditService } from './audit.service';
import { auditQuerySchema, type AuditQueryDto } from './dto/audit-query.dto';

@Controller('admin/audit')
@ApiTags('admin-audit')
@ApiBearerAuth('access-token')
@Authorization('role', ['REGRA_ADMIN'])
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('meta/actions')
  @ApiOperation({ summary: 'Lista distinta de ações de auditoria' })
  @ApiOkResponse({
    schema: {
      example: { actions: ['auth.login.success', 'user.create'] },
    },
  })
  async listActions() {
    const actions = await this.auditService.listDistinctActions();
    return { actions };
  }

  @Get()
  @ApiOperation({ summary: 'Lista paginada de eventos de auditoria' })
  @ZodQueryValidation(auditQuerySchema)
  async list(@Query() query: AuditQueryDto) {
    return this.auditService.findPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um evento de auditoria' })
  async findById(@Param('id') id: string) {
    return this.auditService.findById(id);
  }
}
