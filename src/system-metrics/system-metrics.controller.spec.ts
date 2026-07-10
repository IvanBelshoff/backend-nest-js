import { SystemMetricsController } from './system-metrics.controller';



describe('SystemMetricsController', () => {

  const metricsCollectorService = {

    collectSnapshot: jest.fn().mockResolvedValue({

      recordedAt: '2026-07-10T12:00:00.000Z',

      version: '0.0.1',

    }),

    collectLiveSnapshot: jest.fn().mockResolvedValue({

      recordedAt: '2026-07-10T12:00:00.000Z',

      process: { cpuPercent: 10 },

      http: { requestsInWindow: 1 },

    }),

  };



  const metricsPersistenceService = {

    findHistory: jest.fn().mockResolvedValue([]),

  };



  const controller = new SystemMetricsController(

    metricsCollectorService as any,

    metricsPersistenceService as any,

  );



  beforeEach(() => {

    jest.clearAllMocks();

  });



  it('returns live metrics snapshot', async () => {

    await expect(controller.getLiveMetrics()).resolves.toEqual({

      recordedAt: '2026-07-10T12:00:00.000Z',

      process: { cpuPercent: 10 },

      http: { requestsInWindow: 1 },

    });

  });



  it('returns current metrics snapshot', async () => {

    await expect(controller.getCurrentMetrics()).resolves.toEqual({

      recordedAt: '2026-07-10T12:00:00.000Z',

      version: '0.0.1',

    });

  });



  it('returns metrics history', async () => {

    metricsPersistenceService.findHistory.mockResolvedValue([

      { recordedAt: '2026-07-10T12:00:00.000Z' },

    ]);



    await expect(

      controller.getMetricsHistory({ hours: 24, limit: 100 }),

    ).resolves.toEqual({

      hours: 24,

      count: 1,

      items: [{ recordedAt: '2026-07-10T12:00:00.000Z' }],

    });

  });

});


