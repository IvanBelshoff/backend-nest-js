// Evita carregar os pacotes ESM dos provedores por causa da injeção do AiService.
jest.mock('./ai.service', () => ({ AiService: jest.fn() }));

jest.mock('ai', () => ({
  generateText: jest.fn(),
  stepCountIs: jest.fn(() => 'stop-condition'),
  tool: jest.fn((definition: unknown) => definition),
}));

jest.mock('src/shared/env.schema', () => ({
  env: { AI_ANALYSIS_MAX_STEPS: 10, AI_ANALYSIS_QUEUE_NAME: 'ai.analysis' },
}));

import { generateText } from 'ai';
import { AiAnalysisService } from './ai-analysis.service';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('AiAnalysisService', () => {
  const payload = {
    userId: 7,
    threadId: '3f0b8f1e-6c3a-4d5b-9f2e-8a1b2c3d4e5f',
    pergunta: 'Como evoluíram as vendas nos últimos 12 meses?',
    relatorioIds: [11, 11, 12],
  };

  function createService(overrides: { pgBossEnabled?: boolean } = {}) {
    const userRepository = { findOne: jest.fn() };
    const pgBossService = {
      isEnabled: overrides.pgBossEnabled ?? true,
      send: jest.fn(),
    };
    const aiService = {
      getChatModel: jest.fn(() => 'model'),
      supportsReasoning: jest.fn(() => false),
      getReasoningProviderOptions: jest.fn(() => undefined),
    };
    const aiAccessService = {
      assertCanUseAi: jest.fn(),
      isAdmin: jest.fn(() => Promise.resolve(false)),
    };
    const aiChatPersistenceService = {
      saveAssistantMessage: jest.fn(),
      buildSystemPrompt: jest.fn(() => 'system'),
      hasAnalysisOutcome: jest.fn(() => Promise.resolve(false)),
    };
    const aiReportToolsService = {
      assertAiKnowledgeAccess: jest.fn(),
      getReportCatalogForPrompt: jest.fn(() => Promise.resolve([])),
    };
    const aiAnalyticsToolsService = {};
    const aiExplorationToolsService = {};
    const aiPlanService = { markPlanOutcome: jest.fn() };
    const userNotificationService = { createFromAiAnalysis: jest.fn() };

    const service = new AiAnalysisService(
      userRepository as never,
      pgBossService as never,
      aiService as never,
      aiAccessService as never,
      aiChatPersistenceService as never,
      aiReportToolsService as never,
      aiAnalyticsToolsService as never,
      aiExplorationToolsService as never,
      aiPlanService as never,
      userNotificationService as never,
    );

    return {
      service,
      userRepository: userRepository as Mocked<typeof userRepository>,
      pgBossService,
      aiChatPersistenceService,
      aiReportToolsService,
      userNotificationService,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues deduplicated report ids after checking access', async () => {
    const { service, pgBossService, aiReportToolsService } = createService();
    pgBossService.send.mockResolvedValue('job-1');

    const result = await service.enqueue(payload);

    expect(aiReportToolsService.assertAiKnowledgeAccess).toHaveBeenCalledTimes(
      2,
    );
    expect(pgBossService.send).toHaveBeenCalledWith(
      'ai.analysis',
      expect.objectContaining({ relatorioIds: [11, 12] }),
    );
    expect(result).toEqual(
      expect.objectContaining({ status: 'enfileirada', jobId: 'job-1' }),
    );
  });

  it('returns an explanation instead of throwing when access is denied', async () => {
    const { service, aiReportToolsService, pgBossService } = createService();
    aiReportToolsService.assertAiKnowledgeAccess.mockRejectedValue(
      new Error('Sem conhecimento IA para o relatório 11'),
    );

    const result = await service.enqueue(payload);

    expect(result).toEqual({ erro: 'Sem conhecimento IA para o relatório 11' });
    expect(pgBossService.send).not.toHaveBeenCalled();
  });

  it('does not enqueue when the queue is disabled', async () => {
    const { service, pgBossService } = createService({ pgBossEnabled: false });

    const result = await service.enqueue(payload);

    expect(result).toHaveProperty('erro');
    expect(pgBossService.send).not.toHaveBeenCalled();
  });

  it('saves the result as an assistant message and notifies the user', async () => {
    const {
      service,
      userRepository,
      aiChatPersistenceService,
      userNotificationService,
    } = createService();
    userRepository.findOne.mockResolvedValue({
      id: 7,
      nome: 'Ana',
      sobrenome: 'Souza',
    });
    (generateText as jest.Mock).mockResolvedValue({ text: 'Vendas em alta.' });

    await service.runQueuedAnalysis('job-1', payload);

    expect(aiChatPersistenceService.saveAssistantMessage).toHaveBeenCalledWith(
      payload.threadId,
      expect.objectContaining({
        parts: [{ type: 'text', text: 'Vendas em alta.' }],
      }),
      {
        analysis: {
          status: 'done',
          jobId: 'job-1',
          pergunta: payload.pergunta,
        },
      },
    );
    expect(userNotificationService.createFromAiAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', threadId: payload.threadId }),
    );
  });

  it('skips a job whose result is already recorded in the thread', async () => {
    const { service, aiChatPersistenceService, userNotificationService } =
      createService();
    aiChatPersistenceService.hasAnalysisOutcome.mockResolvedValue(true);

    await service.runQueuedAnalysis('job-1', payload);

    expect(generateText).not.toHaveBeenCalled();
    expect(aiChatPersistenceService.saveAssistantMessage).not.toHaveBeenCalled();
    expect(userNotificationService.createFromAiAnalysis).not.toHaveBeenCalled();
  });

  it('marks the analysis as failed and notifies when generation breaks', async () => {
    const {
      service,
      userRepository,
      aiChatPersistenceService,
      userNotificationService,
    } = createService();
    userRepository.findOne.mockResolvedValue({
      id: 7,
      nome: 'Ana',
      sobrenome: 'Souza',
    });
    (generateText as jest.Mock).mockRejectedValue(new Error('provider down'));

    await expect(service.runQueuedAnalysis('job-1', payload)).rejects.toThrow(
      'provider down',
    );

    expect(aiChatPersistenceService.saveAssistantMessage).toHaveBeenCalledWith(
      payload.threadId,
      expect.anything(),
      {
        analysis: {
          status: 'failed',
          jobId: 'job-1',
          pergunta: payload.pergunta,
        },
      },
    );
    expect(userNotificationService.createFromAiAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: 'provider down' }),
    );
  });
});
