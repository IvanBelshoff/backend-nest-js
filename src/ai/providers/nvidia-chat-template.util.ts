import { AsyncLocalStorage } from 'node:async_hooks';

export type NvidiaChatTemplateContext = {
  enableThinking: boolean;
  forceNonemptyContent: boolean;
};

export type NvidiaChatTemplateKwargs = {
  enable_thinking: boolean;
  force_nonempty_content?: boolean;
};

const nvidiaRequestContext = new AsyncLocalStorage<NvidiaChatTemplateContext>();

export function isNvidiaNimBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) {
    return false;
  }

  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === 'integrate.api.nvidia.com';
  } catch {
    return baseUrl.toLowerCase().includes('integrate.api.nvidia.com');
  }
}

export function resolveNvidiaChatTemplateKwargs(
  context: NvidiaChatTemplateContext,
): NvidiaChatTemplateKwargs {
  const kwargs: NvidiaChatTemplateKwargs = {
    enable_thinking: context.enableThinking,
  };

  if (context.forceNonemptyContent) {
    kwargs.force_nonempty_content = true;
  }

  return kwargs;
}

export function runWithNvidiaChatTemplateContext<T>(
  context: NvidiaChatTemplateContext,
  fn: () => T,
): T {
  return nvidiaRequestContext.run(context, fn);
}

function isChatCompletionsRequest(url: string, method?: string): boolean {
  if (method?.toUpperCase() !== 'POST') {
    return false;
  }

  try {
    const pathname = new URL(url).pathname.replace(/\/$/, '');
    return pathname.endsWith('/chat/completions');
  } catch {
    return url.includes('/chat/completions');
  }
}

function mergeChatTemplateKwargs(
  body: Record<string, unknown>,
  context: NvidiaChatTemplateContext,
): Record<string, unknown> {
  const existingKwargs =
    body.chat_template_kwargs &&
    typeof body.chat_template_kwargs === 'object' &&
    !Array.isArray(body.chat_template_kwargs)
      ? (body.chat_template_kwargs as Record<string, unknown>)
      : {};

  return {
    ...body,
    chat_template_kwargs: {
      ...existingKwargs,
      ...resolveNvidiaChatTemplateKwargs(context),
    },
  };
}

export function createNvidiaExtraBodyFetch(
  baseFetch: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return async (input, init) => {
    const context = nvidiaRequestContext.getStore();
    if (!context) {
      return baseFetch(input, init);
    }

    const request =
      input instanceof Request ? input : new Request(input, init);
    const method = init?.method ?? request.method;
    const url = request.url;

    if (!isChatCompletionsRequest(url, method) || !request.body) {
      return baseFetch(input, init);
    }

    try {
      const rawBody = await request.clone().text();
      if (!rawBody.trim()) {
        return baseFetch(input, init);
      }

      const parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
      const nextBody = JSON.stringify(mergeChatTemplateKwargs(parsedBody, context));
      const headers = new Headers(init?.headers ?? request.headers);

      return baseFetch(request.url, {
        ...init,
        method,
        headers,
        body: nextBody,
      });
    } catch {
      return baseFetch(input, init);
    }
  };
}
