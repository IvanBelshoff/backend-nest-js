import { ForbiddenException } from '@nestjs/common';
import {
  AiChatPersistenceService,
  DEFAULT_THREAD_TITLE,
} from './ai-chat-persistence.service';

describe('AiChatPersistenceService', () => {
  const threadRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
  };

  const messageRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };

  const service = new AiChatPersistenceService(
    threadRepository as any,
    messageRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns messages only for threads owned by the user', async () => {
    threadRepository.findOne.mockResolvedValue({
      id: 'thread-1',
      userId: 7,
    });
    messageRepository.find.mockResolvedValue([
      { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Oi' }] },
    ]);

    const messages = await service.getThreadMessages(7, 'thread-1');

    expect(messages).toHaveLength(1);
    expect(threadRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'thread-1', userId: 7 },
    });
  });

  it('rejects access to threads from another user', async () => {
    threadRepository.findOne.mockResolvedValue(null);

    await expect(service.getThreadMessages(8, 'thread-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('deletes only threads owned by the user', async () => {
    threadRepository.findOne.mockResolvedValue({
      id: 'thread-3',
      userId: 9,
    });

    await service.deleteThread(9, 'thread-3');

    expect(threadRepository.delete).toHaveBeenCalledWith({
      id: 'thread-3',
      userId: 9,
    });
  });

  it('creates a new thread for the authenticated user', async () => {
    const created = { id: 'thread-4', userId: 10, titulo: 'Nova conversa' };
    threadRepository.create.mockReturnValue(created);
    threadRepository.save.mockResolvedValue(created);

    const thread = await service.createThread(10);

    expect(threadRepository.create).toHaveBeenCalledWith({
      userId: 10,
      titulo: DEFAULT_THREAD_TITLE,
    });
    expect(thread).toEqual(created);
  });

  it('sets truncated title on first user message', async () => {
    threadRepository.findOne.mockResolvedValue({
      id: 'thread-5',
      titulo: DEFAULT_THREAD_TITLE,
    });

    const title = await service.maybeSetTruncatedTitle('thread-5', {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Quantos usuários possui?' }],
    });

    expect(title).toBe('Quantos usuários possui?');
    expect(threadRepository.update).toHaveBeenCalledWith(
      'thread-5',
      expect.objectContaining({ titulo: 'Quantos usuários possui?' }),
    );
  });

  it('does not overwrite custom titles when truncating', async () => {
    threadRepository.findOne.mockResolvedValue({
      id: 'thread-6',
      titulo: 'Título manual',
    });

    const title = await service.maybeSetTruncatedTitle('thread-6', {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Outra pergunta' }],
    });

    expect(title).toBeNull();
    expect(threadRepository.update).not.toHaveBeenCalled();
  });

  it('allows refine only when there is a single user message', async () => {
    messageRepository.count.mockResolvedValue(1);

    await expect(service.canRefineTitle('thread-7')).resolves.toBe(true);

    messageRepository.count.mockResolvedValue(2);

    await expect(service.canRefineTitle('thread-7')).resolves.toBe(false);
  });

  it('refines auto generated titles only', async () => {
    threadRepository.findOne.mockResolvedValue({
      id: 'thread-8',
      titulo: 'Quantos usuários possui?',
    });

    const refined = await service.maybeRefineTitle(
      'thread-8',
      'Quantos usuários possui?',
      'Usuários no relatório',
    );

    expect(refined).toBe(true);
    expect(threadRepository.update).toHaveBeenCalledWith(
      'thread-8',
      expect.objectContaining({ titulo: 'Usuários no relatório' }),
    );
  });

  it('does not refine custom titles', async () => {
    threadRepository.findOne.mockResolvedValue({
      id: 'thread-9',
      titulo: 'Título manual',
    });

    const refined = await service.maybeRefineTitle(
      'thread-9',
      'Quantos usuários possui?',
      'Usuários no relatório',
    );

    expect(refined).toBe(false);
    expect(threadRepository.update).not.toHaveBeenCalled();
  });

  it('builds system prompt with user name and public catalog only', () => {
    const prompt = service.buildSystemPrompt(
      {
        id: 1,
        nome: 'Admin',
        sobrenome: 'Admin',
      } as any,
      [{ id: 5, nome: 'Dashboards por Usuário', estado: 'online' }],
      { isAdmin: false },
    );

    expect(prompt).toContain('Admin Admin');
    expect(prompt).toContain('Catálogo de relatórios (ao usuário, liste apenas os nomes):');
    expect(prompt).toContain('- Dashboards por Usuário');
    expect(prompt).not.toContain('ID 5');
    expect(prompt).toContain('Referência interna para ferramentas');
    expect(prompt).toContain('5: Dashboards por Usuário [online]');
    expect(prompt).toContain('Online: a consulta de relatório executa query real');
    expect(prompt).toContain('Offline: a consulta de relatório lê snapshot');
    expect(prompt).toContain('Nunca cite nomes técnicos de ferramentas');
    expect(prompt).not.toContain('Permissões de administrador');
    expect(prompt).toContain('PROIBIDO mencionar capacidades administrativas');
  });

  it('includes admin block only for administrators', () => {
    const adminPrompt = service.buildSystemPrompt(
      { id: 1, nome: 'Admin', sobrenome: 'Admin' } as any,
      [],
      { isAdmin: true },
    );
    const userPrompt = service.buildSystemPrompt(
      { id: 2, nome: 'Maria', sobrenome: 'Silva' } as any,
      [],
      { isAdmin: false },
    );

    expect(adminPrompt).toContain('Permissões de administrador');
    expect(adminPrompt).toContain('preferências de UI');
    expect(adminPrompt).toContain('listar usuários, dashboards, métricas, jobs');
    expect(userPrompt).not.toContain('Permissões de administrador');
    expect(userPrompt).not.toContain('listar usuários, dashboards, métricas, jobs');
    expect(userPrompt).toContain('não tem permissão');
    expect(userPrompt).toContain('PROIBIDO mencionar capacidades administrativas');
  });

  it('allows user listing for REGRA_USUARIO without admin metrics/jobs', () => {
    const prompt = service.buildSystemPrompt(
      { id: 21, nome: 'Ivan', sobrenome: 'Belshoff' } as any,
      [],
      { isAdmin: false, canManageUsers: true },
    );

    expect(prompt).toContain('gestão de usuários');
    expect(prompt).toContain('listagem/consulta de usuários');
    expect(prompt).not.toContain('Permissões de administrador');
    expect(prompt).toContain('métricas globais, jobs');
    expect(prompt).not.toContain('PROIBIDO mencionar capacidades administrativas');
  });
});
