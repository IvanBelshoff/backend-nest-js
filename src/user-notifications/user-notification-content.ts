import * as path from 'path';
import {
  RelatorioJob,
  RelatorioJobStatus,
  RelatorioJobTipo,
} from 'src/database/entities/RelatorioJobs';
import { UserNotificationType } from 'src/database/entities/UserNotification';
import type {
  AiAnalysisNotificationPayloadDto,
  ReportJobNotificationPayloadDto,
} from './dto/user-notification-payload.dto';

export function buildParametrosResumo(
  parametros: Record<string, unknown>,
): string | null {
  const activeKeys = Object.keys(parametros ?? {}).filter((key) => {
    const value = parametros[key];
    return value !== null && value !== undefined && value !== '';
  });

  if (activeKeys.length === 0) {
    return null;
  }

  if (activeKeys.length === 1) {
    return '1 filtro aplicado';
  }

  return `${activeKeys.length} filtros aplicados`;
}

export function buildNotificationFileName(
  job: Pick<RelatorioJob, 'tipo' | 'resultPath'>,
): string | null {
  if (job.tipo !== RelatorioJobTipo.EXPORT_CSV || !job.resultPath) {
    return null;
  }

  return path.basename(job.resultPath);
}

export function buildNotificationPayload(
  job: RelatorioJob,
  relatorioNome: string,
  downloadAvailable: boolean,
  origem: 'manual' | 'agendado' | null,
): ReportJobNotificationPayloadDto {
  return {
    kind: 'report_job',
    jobId: job.id,
    relatorioId: Number(job.relatorioId),
    relatorioNome,
    downloadAvailable,
    errorMessage: job.errorMessage,
    jobTipo: job.tipo,
    jobStatus: job.status,
    completedAt: job.completedAt?.toISOString() ?? null,
    origem,
    fileName: buildNotificationFileName(job),
    parametrosResumo: buildParametrosResumo(job.parametros ?? {}),
  };
}

export function buildNotificationContent(
  job: RelatorioJob,
  relatorioNome: string,
): { type: UserNotificationType; title: string; body: string } {
  if (job.tipo === RelatorioJobTipo.EXPORT_CSV) {
    if (job.status === RelatorioJobStatus.COMPLETED) {
      return {
        type: UserNotificationType.EXPORT_READY,
        title: `Exportação concluída — ${relatorioNome}`,
        body: `O CSV do relatório "${relatorioNome}" está pronto para download.`,
      };
    }

    return {
      type: UserNotificationType.EXPORT_FAILED,
      title: `Falha na exportação — ${relatorioNome}`,
      body:
        job.errorMessage ??
        `Não foi possível exportar o relatório "${relatorioNome}".`,
    };
  }

  if (job.status === RelatorioJobStatus.COMPLETED) {
    return {
      type: UserNotificationType.SNAPSHOT_READY,
      title: `Snapshot atualizado — ${relatorioNome}`,
      body: `O snapshot do relatório "${relatorioNome}" foi atualizado.`,
    };
  }

  return {
    type: UserNotificationType.SNAPSHOT_FAILED,
    title: `Falha no snapshot — ${relatorioNome}`,
    body:
      job.errorMessage ??
      `Não foi possível atualizar o snapshot do relatório "${relatorioNome}".`,
  };
}

const MAX_ANALYSIS_SUBJECT_LENGTH = 80;

/** Resume a pergunta para caber no título da notificação. */
function buildAnalysisSubject(pergunta: string): string {
  const normalized = pergunta.replace(/\s+/g, ' ').trim();

  return normalized.length > MAX_ANALYSIS_SUBJECT_LENGTH
    ? `${normalized.slice(0, MAX_ANALYSIS_SUBJECT_LENGTH - 3)}...`
    : normalized;
}

export function buildAiAnalysisNotificationPayload(params: {
  jobId: string;
  threadId: string;
  pergunta: string;
  errorMessage?: string | null;
}): AiAnalysisNotificationPayloadDto {
  return {
    kind: 'ai_analysis',
    jobId: params.jobId,
    threadId: params.threadId,
    status: params.errorMessage ? 'failed' : 'completed',
    pergunta: params.pergunta,
    errorMessage: params.errorMessage ?? null,
    completedAt: new Date().toISOString(),
  };
}

export function buildAiAnalysisNotificationContent(params: {
  pergunta: string;
  errorMessage?: string | null;
}): { type: UserNotificationType; title: string; body: string } {
  const subject = buildAnalysisSubject(params.pergunta);

  if (params.errorMessage) {
    return {
      type: UserNotificationType.AI_ANALYSIS_FAILED,
      title: 'Falha na análise do assistente',
      body: `Não foi possível concluir a análise "${subject}". ${params.errorMessage}`.trim(),
    };
  }

  return {
    type: UserNotificationType.AI_ANALYSIS_READY,
    title: 'Análise concluída',
    body: `A análise "${subject}" está pronta na conversa do assistente.`,
  };
}
