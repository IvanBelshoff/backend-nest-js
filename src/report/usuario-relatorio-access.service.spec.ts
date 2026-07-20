import { BadRequestException } from '@nestjs/common';
import { Privacidade } from 'src/database/entities/privacidade.enum';
import { UsuarioRelatorioAccessService } from './usuario-relatorio-access.service';

describe('UsuarioRelatorioAccessService', () => {
  const userRepository = {
    findOne: jest.fn(),
  };
  const relatorioRepository = {
    findOne: jest.fn(),
  };
  const usuarioRelatorioRepository = {
    createQueryBuilder: jest.fn(),
  };

  const service = new UsuarioRelatorioAccessService(
    userRepository as any,
    relatorioRepository as any,
    usuarioRelatorioRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects IA toggle for public visible reports', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 1,
      bloqueado: false,
      usuarioRelatorios: [],
    });
    relatorioRepository.findOne.mockResolvedValue({
      id: 5,
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      usuarioRelatorios: [],
    });

    await expect(
      service.updatePermitirConhecimentoIa(1, 5, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts IA flag for private report owner', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const orUpdate = jest.fn().mockReturnValue({ execute });
    const values = jest.fn().mockReturnValue({ orUpdate });
    const into = jest.fn().mockReturnValue({ values });
    const insert = jest.fn().mockReturnValue({ into });
    const createQueryBuilder = jest.fn().mockReturnValue({ insert });

    usuarioRelatorioRepository.createQueryBuilder = createQueryBuilder;

    userRepository.findOne.mockResolvedValue({
      id: 1,
      bloqueado: false,
      usuarioRelatorios: [],
    });
    relatorioRepository.findOne.mockResolvedValue({
      id: 5,
      privacidade: Privacidade.PRIVAT,
      visivel: true,
      id_proprietario: 1,
      usuarioRelatorios: [],
    });

    await service.updatePermitirConhecimentoIa(1, 5, true);

    expect(values).toHaveBeenCalledWith({
      usuarioId: 1,
      relatorioId: 5,
      permitirConhecimentoIa: true,
    });
    expect(orUpdate).toHaveBeenCalledWith(
      ['permitir_conhecimento_ia'],
      ['usuario_id', 'relatorio_id'],
    );
    expect(execute).toHaveBeenCalled();
  });
});
