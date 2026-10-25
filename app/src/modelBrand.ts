import { MODEL_ICON_PATHS } from './modelIcons';

export type ModelBrand = keyof typeof MODEL_ICON_PATHS | 'generic';

// Checked in order; the first match wins. Model names are matched first because
// most services expose many vendors' models behind one address.
const BY_MODEL: [RegExp, ModelBrand][] = [
  [/claude/, 'claude'],
  [/(^|[\/:\-_ ])(gpt(?![a-z])|chatgpt|o1|o3|o4|text-davinci)/, 'openai'],
  [/gemini|gemma/, 'gemini'],
  [/deepseek/, 'deepseek'],
  [/qwen|qwq/, 'qwen'],
  [/llama/, 'meta'],
  [/mistral|mixtral|codestral|ministral/, 'mistral'],
  [/grok/, 'grok'],
  [/glm/, 'zhipu'],
  [/kimi/, 'kimi'],
  [/moonshot/, 'moonshot'],
  [/doubao/, 'doubao'],
  [/minimax|abab/, 'minimax'],
  [/command-r|cohere/, 'cohere'],
];

const BY_HOST: [RegExp, ModelBrand][] = [
  [/anthropic\.com$/, 'claude'],
  [/openai\.com$/, 'openai'],
  [/googleapis\.com$/, 'gemini'],
  [/deepseek\.com$/, 'deepseek'],
  [/dashscope/, 'qwen'],
  [/groq\.com$/, 'groq'],
  [/openrouter\.ai$/, 'openrouter'],
  [/mistral\.ai$/, 'mistral'],
  [/(^|\.)x\.ai$/, 'grok'],
  [/moonshot\.(cn|ai)$/, 'moonshot'],
  [/bigmodel\.cn$/, 'zhipu'],
  [/volces\.com$/, 'doubao'],
  [/minimax/, 'minimax'],
  [/cohere/, 'cohere'],
  [/ollama/, 'ollama'],
];

/** Guesses which provider a model comes from; 'generic' when it can't tell. */
export function detectModelBrand(model: string | undefined, baseUrl: string | undefined): ModelBrand {
  const name = (model ?? '').toLowerCase();
  for (const [re, brand] of BY_MODEL) if (re.test(name)) return brand;

  let host = '';
  let port = '';
  try {
    const url = new URL(baseUrl ?? '');
    host = url.hostname.toLowerCase();
    port = url.port;
  } catch {
    // Not a URL.
  }
  if (host) {
    for (const [re, brand] of BY_HOST) if (re.test(host)) return brand;
    // Ollama's default port.
    if (port === '11434') return 'ollama';
  }
  return 'generic';
}
