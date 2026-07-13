import { Controller, Get, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Authorization } from 'src/shared/decorators/authorization.decorator';
import { ZodQueryValidation } from 'src/shared/decorators/zod-validation.decorator';
import { setTotalCount } from 'src/shared/dto/pagination.dto';
import { ReportJobService } from 'src/report/jobs/report-job.service';
import { SchedulerService } from 'src/scheduler/scheduler.service';
import {
  listAdminJobsQuerySchema,
  type ListAdminJobsQueryDto,
} from './dto/list-admin-jobs-query.dto';
import {
  listAdminScheduleExecutionsQuerySchema,
  type ListAdminScheduleExecutionsQueryDto,
} from './dto/list-admin-schedule-executions-query.dto';

@Controller('admin/jobs')
@ApiTags('admin-jobs')
@ApiBearerAuth('access-token')
@Authorization('role', ['REGRA_ADMIN'])
export class AdminJobsController {
  constructor(
    private readonly reportJobService: ReportJobService,
    private readonly schedulerService: SchedulerService,
  ) {}

  @Get('/')
  @ZodQueryValidation(listAdminJobsQuerySchema)
  @ApiOperation({ summary: 'Lista paginada de jobs de relatório (admin)' })
  @ApiHeader({ name: 'x-total-count', description: 'Total de registros' })
  async listJobs(
    @Query() query: ListAdminJobsQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.reportJobService.listJobsForAdmin(query);
    setTotalCount(response, result.total);

    return {
      items: result.items,
      page: result.page,
      page_size: result.pageSize,
      total: result.total,
    };
  }

  @Get('/schedules')
  @ZodQueryValidation(listAdminScheduleExecutionsQuerySchema)
  @ApiOperation({ summary: 'Lista paginada de execuções agendadas (admin)' })
  @ApiHeader({ name: 'x-total-count', description: 'Total de registros' })
  async listScheduleExecutions(
    @Query() query: ListAdminScheduleExecutionsQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.schedulerService.listExecucoesAdmin(query);
    setTotalCount(response, result.total);

    return {
      items: result.items,
      page: result.page,
      page_size: result.pageSize,
      total: result.total,
    };
  }
}
