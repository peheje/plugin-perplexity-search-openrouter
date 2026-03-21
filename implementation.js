function search_via_perplexity_openrouter(params, userSettings) {
  const keyword = params.keyword;
  const model = userSettings.model || 'perplexity/sonar';
  const systemMessage = userSettings.systemMessage || 'Be precise and concise.';
  const key = userSettings.apiKey;

  function contentToString(content) {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }

          if (part && typeof part.text === 'string') {
            return part.text;
          }

          return '';
        })
        .filter(Boolean)
        .join(' ');
    }

    return '';
  }

  if (!key) {
    throw new Error(
      'Please set the OpenRouter API Key in the plugin settings.'
    );
  }

  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: 'Bearer ' + key,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: systemMessage,
        },
        {
          role: 'user',
          content: keyword,
        },
      ],
    }),
  })
    .then(async (r) => {
      const raw = await r.text();
      let response = {};

      if (raw) {
        try {
          response = JSON.parse(raw);
        } catch (error) {
          throw new Error(
            'OpenRouter returned an unreadable response (HTTP ' + r.status + ').'
          );
        }
      }

      if (!r.ok || response.error) {
        const message =
          (response.error && response.error.message) ||
          'Request failed with HTTP ' + r.status + '.';

        throw new Error('OpenRouter error: ' + message);
      }

      return response;
    })
    .then((response) => {
      const choices = Array.isArray(response.choices) ? response.choices : [];

      if (!choices.length) {
        throw new Error('OpenRouter returned no answer choices.');
      }

      const content = choices
        .map((c) => contentToString(c && c.message && c.message.content))
        .filter(Boolean)
        .join(' ');
      const citations = response.citations;

      return (
        content +
        (citations
          ? '\n\n Citations:\n' +
            citations.map((c, index) => `[${index + 1}] ${c}`).join('\n')
          : '')
      );
    });
}
