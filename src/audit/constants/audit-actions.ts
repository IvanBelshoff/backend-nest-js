export const AUDIT_ACTIONS = {
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',

  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_PASSWORD_CHANGE: 'user.password.change',
  USER_ROLES_UPDATE: 'user.roles.update',
  USER_DASHBOARDS_COPY: 'user.dashboards.copy',
  USER_RELATORIOS_COPY: 'user.relatorios.copy',

  CONNECTION_CREATE: 'connection.create',
  CONNECTION_UPDATE: 'connection.update',
  CONNECTION_DELETE: 'connection.delete',
  CONNECTION_TEST: 'connection.test',
  CONNECTION_QUERY_PREVIEW: 'connection.query_preview',
  CONNECTION_QUERY_COUNT: 'connection.query_count',

  DASHBOARD_CREATE: 'dashboard.create',
  DASHBOARD_UPDATE: 'dashboard.update',
  DASHBOARD_DELETE: 'dashboard.delete',
  DASHBOARD_ACL_ASSIGN: 'dashboard.acl.assign',

  REPORT_CREATE: 'report.create',
  REPORT_UPDATE: 'report.update',
  REPORT_DELETE: 'report.delete',
  REPORT_ACL_ASSIGN: 'report.acl.assign',
  REPORT_ACL_IA_KNOWLEDGE_UPDATE: 'report.acl.ia_knowledge.update',
  REPORT_EXECUTE: 'report.execute',

  AI_QUERY_SNAPSHOT: 'ai.query.snapshot',
  AI_QUERY_CONNECTION: 'ai.query.connection',

  SCHEDULER_CREATE: 'scheduler.create',
  SCHEDULER_UPDATE: 'scheduler.update',
  SCHEDULER_DELETE: 'scheduler.delete',
  SCHEDULER_VINCULO_CREATE: 'scheduler.vinculo.create',
  SCHEDULER_VINCULO_DELETE: 'scheduler.vinculo.delete',
  REPORT_SNAPSHOT_SCHEDULE_CREATE: 'report.snapshot_schedule.create',
  REPORT_SNAPSHOT_SCHEDULE_DELETE: 'report.snapshot_schedule.delete',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
