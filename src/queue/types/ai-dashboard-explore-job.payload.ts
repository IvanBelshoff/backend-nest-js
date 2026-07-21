import type { AiDashboardExploreFase } from 'src/database/entities/AiDashboardExploreJobs';

export type AiDashboardExploreJobPayload = {
  jobId: string;
  userId: number;
  threadId: string;
  dashboardId: number;
  fase: AiDashboardExploreFase;
};
