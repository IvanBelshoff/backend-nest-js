import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AI_ROLE_NAME, AiAccessService } from './ai-access.service';

describe('AiAccessService', () => {
  const userRepository = {
    findOne: jest.fn(),
  };

  const usuarioRelatorioRepository = {
    count: jest.fn(),
  };

  const service = new AiAccessService(
    userRepository as any,
    usuarioRelatorioRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ineligible for blocked users', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 1,
      bloqueado: true,
      regra: [{ nome: AI_ROLE_NAME }],
    });

    const status = await service.getAccessStatus(1);

    expect(status).toEqual({
      eligible: false,
      reason: 'Usuário bloqueado não pode usar a IA.',
      relatoriosDisponiveis: 0,
      isAdmin: false,
    });
  });

  it('returns ineligible when role is missing', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 2,
      bloqueado: false,
      regra: [],
    });

    const status = await service.getAccessStatus(2);

    expect(status.eligible).toBe(false);
    expect(status.reason).toContain('REGRA_IA');
  });

  it('allows admin without report grants', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 3,
      bloqueado: false,
      regra: [{ nome: 'REGRA_ADMIN' }],
    });

    const status = await service.getAccessStatus(3);

    expect(status).toEqual({
      eligible: true,
      relatoriosDisponiveis: Number.MAX_SAFE_INTEGER,
      isAdmin: true,
    });
    expect(usuarioRelatorioRepository.count).not.toHaveBeenCalled();
  });

  it('requires at least one report with IA flag for non-admin users', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 4,
      bloqueado: false,
      regra: [{ nome: AI_ROLE_NAME }],
    });
    usuarioRelatorioRepository.count.mockResolvedValue(0);

    const status = await service.getAccessStatus(4);

    expect(status.eligible).toBe(false);
    expect(status.reason).toContain('Nenhum relatório com conhecimento da IA');
  });

  it('allows non-admin users with IA-enabled report grants', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 5,
      bloqueado: false,
      regra: [{ nome: AI_ROLE_NAME }],
    });
    usuarioRelatorioRepository.count.mockResolvedValue(2);

    const status = await service.getAccessStatus(5);

    expect(status).toEqual({
      eligible: true,
      relatoriosDisponiveis: 2,
      isAdmin: false,
    });
  });

  it('assertCanUseAi throws ForbiddenException when ineligible', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 6,
      bloqueado: false,
      regra: [],
    });

    await expect(service.assertCanUseAi(6)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws NotFoundException when user does not exist', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(service.getAccessStatus(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
