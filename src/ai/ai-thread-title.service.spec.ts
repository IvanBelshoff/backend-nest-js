jest.mock('./ai.service', () => ({
  AiService: jest.fn().mockImplementation(() => ({
    getChatModel: jest.fn().mockReturnValue('mock-model'),
  })),
}));

import { generateText } from 'ai';
import { AiThreadTitleService } from './ai-thread-title.service';
import { AiService } from './ai.service';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

describe('AiThreadTitleService', () => {
  const aiService = new AiService();
  const service = new AiThreadTitleService(aiService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns sanitized title from llm', async () => {
    (generateText as jest.Mock).mockResolvedValue({
      text: '"Usuários no relatório."',
    });

    const title = await service.generateTitle('Quantos usuários possui?');

    expect(title).toBe('Usuários no relatório');
    expect(generateText).toHaveBeenCalled();
  });

  it('falls back to truncated title when llm fails', async () => {
    (generateText as jest.Mock).mockRejectedValue(new Error('ollama down'));

    const title = await service.generateTitle('Quantos usuários possui?');

    expect(title).toBe('Quantos usuários possui?');
  });
});
