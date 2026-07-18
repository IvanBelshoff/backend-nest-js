import { ForbiddenException } from '@nestjs/common';
import { AiMentionService } from './ai-mention.service';
import { aiMentionSchema, aiChatSchema } from './dto/ai-chat.dto';

describe('aiMentionSchema', () => {
  it('accepts relatorio with id', () => {
    const parsed = aiMentionSchema.parse({
      type: 'relatorio',
      id: 12,
      label: 'Agendamentos',
    });

    expect(parsed.id).toBe(12);
  });

  it('rejects relatorio without id', () => {
    expect(() =>
      aiMentionSchema.parse({
        type: 'relatorio',
        label: 'Agendamentos',
      }),
    ).toThrow();
  });

  it('rejects dominio with id', () => {
    expect(() =>
      aiMentionSchema.parse({
        type: 'dominio_relatorios',
        id: 1,
        label: 'Relatórios',
      }),
    ).toThrow();
  });

  it('accepts mentions in chat body', () => {
    const parsed = aiChatSchema.parse({
      messages: [{ role: 'user', parts: [] }],
      mentions: [
        { type: 'relatorio', id: 3, label: 'X' },
        { type: 'dominio_usuarios', label: 'Usuários' },
      ],
    });

    expect(parsed.mentions).toHaveLength(2);
  });
});

describe('AiMentionService', () => {
  const aiAccessService = {
    canMentionUsers: jest.fn(),
    hasRole: jest.fn(),
  };

  const aiReportToolsService = {
    getReportCatalogForPrompt: jest.fn(),
    assertAiKnowledgeAccess: jest.fn(),
  };

  const dashboardService = {
    findById: jest.fn(),
    findAllPrivate: jest.fn(),
  };

  const userRepository = {
    findOne: jest.fn(),
    count: jest.fn(),
  };

  const service = new AiMentionService(
    aiAccessService as never,
    aiReportToolsService as never,
    dashboardService as never,
    userRepository as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only catalog reports from AI tools', async () => {
    aiReportToolsService.getReportCatalogForPrompt.mockResolvedValue([
      { id: 2, nome: 'Com IA', estado: 'online' },
    ]);

    await expect(service.listMentionRelatorios(7)).resolves.toEqual([
      { id: 2, nome: 'Com IA' },
    ]);
  });

  it('rejects relatorio mention without AI knowledge flag', async () => {
    aiReportToolsService.assertAiKnowledgeAccess.mockRejectedValue(
      new ForbiddenException(
        'Conhecimento da IA não habilitado para este relatório.',
      ),
    );

    await expect(
      service.validateMentions(1, [
        { type: 'relatorio', id: 9, label: 'Sem flag' },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts relatorio mention with AI knowledge', async () => {
    aiReportToolsService.assertAiKnowledgeAccess.mockResolvedValue(undefined);

    await expect(
      service.validateMentions(1, [
        { type: 'relatorio', id: 2, label: 'Com IA' },
      ]),
    ).resolves.toHaveLength(1);
  });

  it('builds mentions prompt section with dashboard metadata', async () => {
    dashboardService.findById.mockResolvedValue({
      id: 1,
      nome: 'BI Senac',
      data_criacao: new Date('2024-01-15T12:00:00.000Z'),
      data_atualizacao: new Date('2024-02-01T12:00:00.000Z'),
      privacidade: 'privado',
      usuario_cadastrador: 'admin',
    });

    const section = await service.buildMentionsPromptSection(1, [
      { type: 'dashboard', id: 1, label: 'BI Senac' },
    ]);

    expect(section).toContain('Contexto explícito');
    expect(section).toContain('BI Senac');
    expect(section).toContain('data_criacao=2024-01-15');
    expect(section).toContain('NÃO confunda com usuários');
  });

  it('builds dominio_usuarios section with real counts', async () => {
    userRepository.count
      .mockResolvedValueOnce(19)
      .mockResolvedValueOnce(3);

    const section = await service.buildMentionsPromptSection(1, [
      { type: 'dominio_usuarios', label: 'Usuários' },
    ]);

    expect(section).toContain('total=19');
    expect(section).toContain('ativos=16');
    expect(section).toContain('bloqueados=3');
  });

  it('builds dominio_relatorios section with catalog total', async () => {
    aiReportToolsService.getReportCatalogForPrompt.mockResolvedValue([
      { id: 1, nome: 'A', estado: 'online' },
      { id: 2, nome: 'B', estado: 'offline' },
    ]);

    const section = await service.buildMentionsPromptSection(1, [
      { type: 'dominio_relatorios', label: 'Relatórios' },
    ]);

    expect(section).toContain('total=2');
    expect(section).toContain('Domínio: Relatórios');
  });
});
