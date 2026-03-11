const env = require('../../config/env');
const logger = require('../../config/logger');

const tryParseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch (_error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('AI response was not valid JSON');
  }
};

const requestPolicyRecommendation = async (prompt) => {
  if (!env.openAiApiKey) {
    return null;
  }

  const endpoint = `${env.openAiBaseUrl.replace(/\/$/, '')}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.openAiApiKey}`
    },
    body: JSON.stringify({
      model: env.openAiModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a secure access policy assistant. Return strict JSON only and avoid markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error('OpenAI API request failed', { status: response.status, body: text.slice(0, 500) });
    throw new Error('AI provider returned a non-success response');
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('AI provider returned an empty recommendation');
  }

  return tryParseJson(content);
};

module.exports = { requestPolicyRecommendation };
