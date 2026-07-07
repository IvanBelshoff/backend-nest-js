import { DashboardService } from './dashboard.service';
import { Privacidade } from 'src/database/entities/Dashboards';

describe('DashboardService', () => {
  function buildListQueryMocks() {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        dashboards_favoritos: [10, 20],
      }),
    };
    const dashboardRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new DashboardService(
      dashboardRepository as any,
      userRepository as any,
    );

    return { service, queryBuilder, userRepository };
  }

  describe('findAllPrivate', () => {
    it('applies my dashboards access rules including public and private assigned', async () => {
      const { service, queryBuilder } = buildListQueryMocks();

      await service.findAllPrivate(1, { page: 1, limit: 50 });

      expect(queryBuilder.distinct).toHaveBeenCalledWith(true);
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'dashboard.visivel = :visivel',
        { visivel: true },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('dashboard.privacidade = :publico'),
        expect.objectContaining({
          publico: Privacidade.PUBLIC,
          privado: Privacidade.PRIVAT,
          userId: 1,
        }),
      );
    });

    it('applies favorites filter when requested', async () => {
      const { service, queryBuilder } = buildListQueryMocks();

      await service.findAllPrivate(1, {
        page: 1,
        limit: 50,
        favoritos: true,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'dashboard.id IN (:...favoriteIds)',
        { favoriteIds: [10, 20] },
      );
    });

    it('applies privacidade filter when requested', async () => {
      const { service, queryBuilder } = buildListQueryMocks();

      await service.findAllPrivate(1, {
        page: 1,
        limit: 50,
        privacidade: 'publico',
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'dashboard.privacidade = :privacidade',
        { privacidade: Privacidade.PUBLIC },
      );
    });

    it('applies temporario filter when requested', async () => {
      const { service, queryBuilder } = buildListQueryMocks();

      await service.findAllPrivate(1, {
        page: 1,
        limit: 50,
        temporario: true,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'dashboard.temporario = :temporario',
        { temporario: true },
      );
    });

    it('returns favorite ids from user profile', async () => {
      const { service } = buildListQueryMocks();

      const result = await service.findAllPrivate(1, { page: 1, limit: 50 });

      expect(result.favoritos).toEqual([10, 20]);
    });
  });
});
