// Google Gemini (Generative Language API) 공급자
import { buildPrompt, RESPONSE_SCHEMA, normalizeRecommendation } from '../prompt.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function recommend({ apiKey, model, destination, mood }) {
  if (!apiKey) throw new Error('Gemini API 키가 없습니다. ⚙ 설정에서 입력해 주세요.');

  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt({ destination, mood }) }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(describeError(res.status, data));

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  if (!text) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason || '알 수 없음';
    throw new Error(`Gemini가 빈 응답을 보냈습니다 (사유: ${reason}).`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini 응답을 해석하지 못했습니다. 다시 시도해 주세요.');
  }
  return normalizeRecommendation(parsed, { destination });
}

function describeError(status, data) {
  const msg = data?.error?.message || '';
  if (status === 400 && /API key/i.test(msg)) return 'Gemini API 키가 올바르지 않습니다.';
  if (status === 403) return 'Gemini API 접근이 거부되었습니다. 키 권한/제한을 확인해 주세요.';
  if (status === 404) return '모델을 찾을 수 없습니다. ⚙ 설정에서 모델 이름을 확인해 주세요.';
  if (status === 429) return 'Gemini 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
  return `Gemini 오류 (${status}) ${msg}`.trim();
}
