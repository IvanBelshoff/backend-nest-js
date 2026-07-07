import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  it('returns dashboards by user from the service', async () => {
    const lists = {
      dashboards: [{ id: 1, nome: 'BI Senac' }],
      dashboardsDisponiveis: [{ id: 2, nome: 'Dashboard Seed 02' }],
    };
    const dashboardService = {
      getDashboardsByUser: jest.fn().mockResolvedValue(lists),
    };
    const controller = new DashboardController(dashboardService as any);

    await expect(controller.getDashboardsByUser(7)).resolves.toEqual(lists);
    expect(dashboardService.getDashboardsByUser).toHaveBeenCalledWith(7);
  });
});
