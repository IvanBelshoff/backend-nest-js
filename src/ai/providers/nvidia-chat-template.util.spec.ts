import {
  createNvidiaExtraBodyFetch,
  isNvidiaNimBaseUrl,
  resolveNvidiaChatTemplateKwargs,
  runWithNvidiaChatTemplateContext,
} from './nvidia-chat-template.util';

describe('nvidia-chat-template.util', () => {
  describe('isNvidiaNimBaseUrl', () => {
    it('detects NVIDIA integrate endpoint', () => {
      expect(
        isNvidiaNimBaseUrl('https://integrate.api.nvidia.com/v1'),
      ).toBe(true);
    });

    it('returns false for other providers', () => {
      expect(isNvidiaNimBaseUrl('https://api.groq.com/openai/v1')).toBe(
        false,
      );
    });
  });

  describe('resolveNvidiaChatTemplateKwargs', () => {
    it('maps thinking off without tools', () => {
      expect(
        resolveNvidiaChatTemplateKwargs({
          enableThinking: false,
          forceNonemptyContent: false,
        }),
      ).toEqual({ enable_thinking: false });
    });

    it('maps thinking on with force_nonempty_content for tools', () => {
      expect(
        resolveNvidiaChatTemplateKwargs({
          enableThinking: true,
          forceNonemptyContent: true,
        }),
      ).toEqual({
        enable_thinking: true,
        force_nonempty_content: true,
      });
    });
  });

  describe('createNvidiaExtraBodyFetch', () => {
    it('injects chat_template_kwargs into chat completion POST bodies', async () => {
      const baseFetch = jest.fn().mockResolvedValue(new Response('ok'));
      const fetch = createNvidiaExtraBodyFetch(baseFetch);

      await runWithNvidiaChatTemplateContext(
        {
          enableThinking: true,
          forceNonemptyContent: true,
        },
        async () =>
          fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
              messages: [{ role: 'user', content: 'Olá' }],
            }),
          }),
      );

      expect(baseFetch).toHaveBeenCalledTimes(1);
      const [, init] = baseFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(String(init.body)) as {
        chat_template_kwargs: {
          enable_thinking: boolean;
          force_nonempty_content: boolean;
        };
      };

      expect(body.chat_template_kwargs).toEqual({
        enable_thinking: true,
        force_nonempty_content: true,
      });
    });

    it('does not modify requests without active NVIDIA context', async () => {
      const baseFetch = jest.fn().mockResolvedValue(new Response('ok'));
      const fetch = createNvidiaExtraBodyFetch(baseFetch);
      const originalBody = JSON.stringify({
        model: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
        messages: [{ role: 'user', content: 'Olá' }],
      });

      await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        body: originalBody,
      });

      const [, init] = baseFetch.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBe(originalBody);
    });

    it('ignores non chat completion requests', async () => {
      const baseFetch = jest.fn().mockResolvedValue(new Response('ok'));
      const fetch = createNvidiaExtraBodyFetch(baseFetch);

      await runWithNvidiaChatTemplateContext(
        {
          enableThinking: true,
          forceNonemptyContent: true,
        },
        async () =>
          fetch('https://integrate.api.nvidia.com/v1/models', {
            method: 'GET',
          }),
      );

      expect(baseFetch).toHaveBeenCalledTimes(1);
      const [, init] = baseFetch.mock.calls[0] as [string, RequestInit | undefined];
      expect(init?.body).toBeUndefined();
    });
  });
});
