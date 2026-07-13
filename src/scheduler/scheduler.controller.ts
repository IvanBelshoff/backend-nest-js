import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorization, AuthorizationAll } from 'src/shared/decorators/authorization.decorator';
import { ZodQueryValidation, ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import {
  createAgendamentoSchema,
  type CreateAgendamentoDto,
} from './dto/create-agendamento.dto';
import {
  updateAgendamentoSchema,
  type UpdateAgendamentoDto,
} from './dto/update-agendamento.dto';
import {
  createVinculoSchema,
  listVinculosQuerySchema,
  type CreateVinculoDto,
  type ListVinculosQueryDto,
} from './dto/create-vinculo.dto';
import { SchedulerService } from './scheduler.service';

@Controller('agendamentos')
@ApiTags('agendamentos')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post('/')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_ADMIN'] },
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Criar regra de agendamento' })
  @ZodValidation(createAgendamentoSchema)
  create(
    @Body() dto: CreateAgendamentoDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.schedulerService.createAgendamento(dto, req.user);
  }

  @Patch('/:id')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_ADMIN'] },
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Atualizar regra de agendamento' })
  @ZodValidation(updateAgendamentoSchema)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAgendamentoDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.schedulerService.updateAgendamento(id, dto, req.user);
  }

  @Delete('/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_ADMIN'] },
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remover agendamento e vínculos' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.schedulerService.deleteAgendamento(id);
  }

  @Post('/:id/vinculos')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_ADMIN'] },
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Criar vínculo de agendamento' })
  @ZodValidation(createVinculoSchema)
  createVinculo(
    @Param('id', ParseIntPipe) agendamentoId: number,
    @Body() dto: CreateVinculoDto,
  ) {
    return this.schedulerService.createVinculo(agendamentoId, dto);
  }

  @Delete('/vinculos/:vinculoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_ADMIN'] },
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remover vínculo de agendamento' })
  async removeVinculo(
    @Param('vinculoId', ParseIntPipe) vinculoId: number,
  ): Promise<void> {
    await this.schedulerService.deleteVinculo(vinculoId);
  }

  @Get('/vinculos')
  @Authorization('role', ['REGRA_ADMIN'])
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar vínculos de agendamento' })
  @ZodQueryValidation(listVinculosQuerySchema)
  listVinculos(@Query() query: ListVinculosQueryDto) {
    return this.schedulerService.listVinculos({
      entidadeTipo: query.entidade_tipo,
      entidadeId: query.entidade_id,
      tipo: query.tipo,
    });
  }

  @Get('/vinculos/:vinculoId/execucoes')
  @Authorization('role', ['REGRA_ADMIN'])
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar execuções de um vínculo' })
  listExecucoes(@Param('vinculoId', ParseIntPipe) vinculoId: number) {
    return this.schedulerService.listExecucoesByVinculo(vinculoId);
  }
}
