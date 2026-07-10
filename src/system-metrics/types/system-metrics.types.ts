export type DependencyStatus = 'up' | 'down' | 'disabled';

export type QueueMetric = {
  name: string;
  pending: number;
  active: number;
  failed: number;
};

export type SystemMetricsProcess = {
  uptimeSeconds: number;
  memoryMb: {
    heapUsed: number;
    rss: number;
    external: number;
  };
  loadAvg: [number, number, number];
  eventLoopLagMs: number;
  cpuPercent: number | null;
};

export type SystemMetricsSnapshot = {
  recordedAt: string;
  version: string;
  environment: string;
  process: SystemMetricsProcess;
  dependencies: {
    postgresql: { status: Exclude<DependencyStatus, 'disabled'>; latencyMs: number };
    mongodb: { status: Exclude<DependencyStatus, 'disabled'>; latencyMs: number };
    pgBoss: { status: DependencyStatus; queues: QueueMetric[] };
  };
  http: {
    requestsInWindow: number;
    errorRatePercent: number;
    latencyMs: {
      p50: number;
      p95: number;
      p99: number;
    };
  };
  storage: {
    snapshotsDiskMb: number;
    snapshotsFileCount: number;
  };
};

export type SystemMetricsLiveSnapshot = {
  recordedAt: string;
  process: SystemMetricsProcess;
  http: SystemMetricsSnapshot['http'];
};
