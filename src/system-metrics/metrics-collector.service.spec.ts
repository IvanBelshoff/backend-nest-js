import { MetricsCollectorService } from './metrics-collector.service';

import { MetricsHttpStore } from './metrics-http.store';



describe('MetricsCollectorService', () => {

  const dataSource = {

    query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),

  };

  const mongoConnection = {

    readyState: 1,

    db: {

      admin: () => ({

        command: jest.fn().mockResolvedValue({ ok: 1 }),

      }),

    },

  };

  const pgBossService = {

    isEnabled: false,

    getQueueMetrics: jest.fn(),

  };



  function createService(metricsHttpStore = new MetricsHttpStore()) {

    return new MetricsCollectorService(

      dataSource as any,

      mongoConnection as any,

      pgBossService as any,

      metricsHttpStore,

    );

  }



  beforeEach(() => {

    jest.clearAllMocks();

  });



  it('collects process and dependency metrics', async () => {

    const metricsHttpStore = new MetricsHttpStore();

    metricsHttpStore.record(50, false);

    const service = createService(metricsHttpStore);



    const snapshot = await service.collectSnapshot();



    expect(snapshot.dependencies.postgresql.status).toBe('up');

    expect(snapshot.dependencies.mongodb.status).toBe('up');

    expect(snapshot.dependencies.pgBoss.status).toBe('disabled');

    expect(snapshot.http.requestsInWindow).toBe(1);

    expect(snapshot.process.uptimeSeconds).toBeGreaterThanOrEqual(0);

    expect(snapshot.process).toHaveProperty('cpuPercent');

  });



  it('collects live snapshot without querying dependencies or storage', async () => {

    const metricsHttpStore = new MetricsHttpStore();

    metricsHttpStore.record(80, false);

    metricsHttpStore.record(120, true);

    const service = createService(metricsHttpStore);



    const live = await service.collectLiveSnapshot();



    expect(dataSource.query).not.toHaveBeenCalled();

    expect(live.http.requestsInWindow).toBe(2);

    expect(live.http.errorRatePercent).toBe(50);

    expect(live.process.uptimeSeconds).toBeGreaterThanOrEqual(0);

    expect(live.process.cpuPercent).toBeNull();



    const liveAgain = await service.collectLiveSnapshot();

    expect(liveAgain.http.requestsInWindow).toBe(2);

    expect(typeof liveAgain.process.cpuPercent).toBe('number');

  });

});


