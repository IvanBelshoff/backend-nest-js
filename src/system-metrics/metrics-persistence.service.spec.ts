import { MetricsPersistenceService } from './metrics-persistence.service';

describe('MetricsPersistenceService', () => {
  const snapshot = {
    recordedAt: '2026-07-10T12:00:00.000Z',
    version: '0.0.1',
    environment: 'test',
    process: {
      uptimeSeconds: 10,
      memoryMb: { heapUsed: 1, rss: 2, external: 0 },
      loadAvg: [0, 0, 0] as [number, number, number],
      eventLoopLagMs: 1,
    },
    dependencies: {
      postgresql: { status: 'up' as const, latencyMs: 1 },
      mongodb: { status: 'up' as const, latencyMs: 1 },
      pgBoss: { status: 'disabled' as const, queues: [] },
    },
    http: {
      requestsInWindow: 1,
      errorRatePercent: 0,
      latencyMs: { p50: 10, p95: 10, p99: 10 },
    },
    storage: { snapshotsDiskMb: 0, snapshotsFileCount: 0 },
  };

  it('saves and queries history snapshots', async () => {
    const create = jest.fn().mockResolvedValue(snapshot);
    const lean = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        { ...snapshot, recordedAt: new Date(snapshot.recordedAt) },
      ]),
    });
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    const find = jest.fn().mockReturnValue({ sort });
    const createIndex = jest.fn().mockResolvedValue(undefined);
    const dropIndex = jest.fn().mockResolvedValue(undefined);
    const indexes = jest
      .fn()
      .mockResolvedValue([{ name: 'recordedAt_1', expireAfterSeconds: 1 }]);

    const service = new MetricsPersistenceService({
      create,
      find,
      collection: { createIndex, dropIndex, indexes },
    } as any);

    await service.onModuleInit();
    await service.saveSnapshot(snapshot);

    const history = await service.findHistory(24);

    expect(indexes).toHaveBeenCalled();
    expect(dropIndex).toHaveBeenCalledWith('recordedAt_1');
    expect(createIndex).toHaveBeenCalledWith(
      { recordedAt: 1 },
      expect.objectContaining({ expireAfterSeconds: expect.any(Number), name: 'recordedAt_1' }),
    );
    expect(create).toHaveBeenCalledWith({
      ...snapshot,
      recordedAt: new Date(snapshot.recordedAt),
    });
    expect(history).toHaveLength(1);
    expect(history[0].recordedAt).toBe(snapshot.recordedAt);
  });
});
