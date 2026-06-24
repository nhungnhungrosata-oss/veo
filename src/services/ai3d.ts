import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';

const E = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

export type ThreeDVoiceType = 'Bắc' | 'Trung' | 'Nam';
export type ThreeDVideoModelType = 'Veo 3' | 'Gork';
export type ThreeDSceneCount = 3 | 4 | 5;
export type ThreeDContentStyle =
  | 'Vui vẻ'
  | 'Giáo dục'
  | 'Truyền cảm hứng'
  | 'Hài hước'
  | 'Gần gũi'
  | 'Kể chuyện'
  | 'Chuyên nghiệp'
  | 'Dễ hiểu';
export type ThreeDAudienceType =
  | 'Trẻ em'
  | 'Người trưởng thành'
  | 'Gia đình'
  | 'Người quan tâm sức khỏe'
  | 'Tùy chỉnh';

export interface ThreeDState {
  topic: string;
  sceneCount: ThreeDSceneCount;
  style: ThreeDContentStyle;
  audience: ThreeDAudienceType;
  customAudience: string;
  voice: ThreeDVoiceType;
  aspectRatio: '9:16';
  requirements: string;
  videoModel: ThreeDVideoModelType;
}

export interface ThreeDCharacterProfile {
  name: string;
  description: string;
  fixedIdentity: string;
}

export interface ThreeDScriptScene {
  title: string;
  background: string;
  action: string;
  expression: string;
  camera: string;
  videoPrompt: string;
  voiceScript: string;
}

export interface ThreeDGeneratedResult {
  id: string;
  timestamp: number;
  summary: string;
  character: ThreeDCharacterProfile;
  scenes: ThreeDScriptScene[];
  inputs: ThreeDState;
}

export const THREE_D_STORAGE_KEY = 'video_3d_scripts_v2';

const VOICE_MIN_WORDS = 16;
const VOICE_MAX_WORDS = 22;

const VOICE_DIRECTION: Record<string, string> = {
  Bắc: 'The character speaks natural Vietnamese with a clear standard Northern Vietnamese accent. Precise Vietnamese lip sync, paced for an 8-second line.',
  Trung: 'The character speaks natural Vietnamese with a clear intelligible Central Vietnamese accent. Precise Vietnamese lip sync, paced for an 8-second line.',
  Nam: 'The character speaks natural Vietnamese with a clear standard Southern Vietnamese accent. Precise Vietnamese lip sync, paced for an 8-second line.',
};

const VIDEO_TECHNIQUE: Record<string, string> = {
  'Veo 3': 'Smooth cinematic 3D animation, stable motion, natural micro-expressions, accurate Vietnamese lip sync, high detail, high quality rendering.',
  Gork: 'Smooth expressive 3D animation, stable character motion, natural facial expressions, accurate Vietnamese lip sync, high detail, high quality rendering.',
};

type ApiKeyItem = { key: string; active?: boolean };

function uniqueKeys(keys: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  return keys
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter(Boolean)
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseStoredApiConfig(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(escape(atob(raw))));
    } catch {
      return null;
    }
  }
}

function readLocalProviderKeys(provider: 'google' | 'deepseek' | 'openai'): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem('api_key_manager_v1');
    if (!raw) return [];
    const config = parseStoredApiConfig(raw);
    const keys = config?.[provider]?.keys;
    if (!Array.isArray(keys)) return [];
    return uniqueKeys(
      keys
        .filter((item: ApiKeyItem) => item && item.active !== false)
        .map((item: ApiKeyItem) => item.key),
    );
  } catch {
    return [];
  }
}

const GEMINI_KEYS = uniqueKeys([
  E.VITE_GEMINI_API_KEY,
  E.VITE_GEMINI_API_KEY_1,
  E.VITE_GEMINI_API_KEY_2,
  E.VITE_GEMINI_API_KEY_3,
  E.VITE_GEMINI_API_KEY_4,
  E.VITE_GEMINI_API_KEY_5,
  // @ts-ignore compatibility with the original Vite define
  typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined,
  ...readLocalProviderKeys('google'),
]).filter((key) => key.startsWith('AIza'));

const DEEPSEEK_KEYS = uniqueKeys([
  E.VITE_DEEPSEEK_API_KEY,
  E.VITE_DEEPSEEK_API_KEY_1,
  E.VITE_DEEPSEEK_API_KEY_2,
  ...readLocalProviderKeys('deepseek'),
]);

const OPENAI_KEYS = uniqueKeys([
  E.VITE_OPENAI_API_KEY,
  E.VITE_OPENAI_API_KEY_1,
  E.VITE_OPENAI_API_KEY_2,
  ...readLocalProviderKeys('openai'),
]);

const errText = (err: any) =>
  String(err?.status ?? '') + ' ' + String(err?.code ?? '') + ' ' + String(err?.message ?? '');

const shouldTryNextKey = (err: any) => {
  const text = errText(err).toLowerCase();
  return (
    err?.status === 429 ||
    err?.status === 400 ||
    err?.status === 401 ||
    err?.status === 403 ||
    text.includes('quota') ||
    text.includes('rate') ||
    text.includes('invalid') ||
    text.includes('api key') ||
    text.includes('billing') ||
    text.includes('permission')
  );
};

function extractJSON(text: string): any {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI không trả về JSON hợp lệ.');
  }
}

function wordCount(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function cleanSentence(text: string): string {
  return String(text || '')
    .replace(/[“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensurePunctuation(text: string): string {
  const cleaned = cleanSentence(text).replace(/[,:;\-–—]+$/g, '').trim();
  if (!cleaned) return '';
  return /[.!?…]$/.test(cleaned) ? cleaned : cleaned + '.';
}

function trimWords(text: string, maxWords: number): string {
  const words = cleanSentence(text).split(' ').filter(Boolean);
  if (words.length <= maxWords) return ensurePunctuation(words.join(' '));
  return ensurePunctuation(words.slice(0, maxWords).join(' '));
}

function firstCompleteSentence(text: string): string {
  const cleaned = ensurePunctuation(text);
  const sentences = cleaned.match(/[^.!?…]+[.!?…]+/g) || [];
  let output = '';
  for (const sentence of sentences) {
    const next = ensurePunctuation((output + ' ' + sentence).trim());
    const count = wordCount(next);
    if (count <= VOICE_MAX_WORDS) output = next;
    else break;
  }
  if (wordCount(output) >= VOICE_MIN_WORDS) return output;
  return '';
}

function fallbackVoice(index: number, sceneCount: number, topic: string): string {
  const safeTopic = topic.trim() || 'chủ đề này';
  if (index === 0) {
    return trimWords('Mọi người ơi, hãy cùng khám phá ' + safeTopic + ' qua một câu chuyện 3D thật dễ hiểu.', VOICE_MAX_WORDS);
  }
  if (index === sceneCount - 1) {
    return trimWords('Cuối cùng, hãy nhớ hiểu đúng thông tin và theo dõi Trang để học thêm kiến thức hữu ích.', VOICE_MAX_WORDS);
  }
  if (index === 1) {
    return trimWords('Điểm quan trọng là ' + safeTopic + ' cần được giải thích rõ, để mọi người hiểu đúng bản chất.', VOICE_MAX_WORDS);
  }
  if (index === 2) {
    return trimWords('Khi hiểu đúng, chúng ta sẽ biết cách áp dụng thông tin này hợp lý hơn trong đời sống.', VOICE_MAX_WORDS);
  }
  return trimWords('Tiếp theo, nhân vật nhấn mạnh ý chính bằng ví dụ đơn giản, giúp nội dung trở nên dễ nhớ.', VOICE_MAX_WORDS);
}

function normalizeVoiceScript(text: string, fallback: string): string {
  let cleaned = cleanSentence(text);
  cleaned = cleaned.replace(/^(Cảnh\s*\d+\s*[:\-.]\s*)/i, '').trim();
  cleaned = cleaned.replace(/^(Lời thoại\s*[:\-.]\s*)/i, '').trim();

  if (!cleaned || wordCount(cleaned) < 10) return fallback;

  const complete = firstCompleteSentence(cleaned);
  if (complete) return complete;

  const count = wordCount(cleaned);
  if (count >= VOICE_MIN_WORDS && count <= VOICE_MAX_WORDS) return ensurePunctuation(cleaned);

  const trimmed = trimWords(cleaned, VOICE_MAX_WORDS);
  if (wordCount(trimmed) < 12) return fallback;
  return trimmed;
}

async function callBackendProxyText(model: string, prompt: string): Promise<string> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ model, prompt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const err: any = new Error(data?.error || 'Proxy HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  if (!data?.text) throw new Error('AI proxy không trả về nội dung.');
  return data.text;
}

async function callGeminiText(model: string, prompt: string): Promise<string> {
  let lastErr: any;
  for (const [index, key] of GEMINI_KEYS.entries()) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.55 },
      });
      if (res.text) return res.text;
      throw new Error('AI trả về rỗng.');
    } catch (err: any) {
      lastErr = err;
      if (shouldTryNextKey(err)) {
        console.warn('[AI 3D] Gemini key #' + (index + 1) + ' lỗi/hết quota, thử key tiếp.');
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Chưa cấu hình Gemini API Key.');
}

async function callOpenAICompat(endpoint: string, apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.55,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body?.error?.message || 'HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callProviderKeys(
  provider: 'DeepSeek' | 'OpenAI',
  keys: string[],
  endpoint: string,
  model: string,
  prompt: string,
): Promise<string> {
  let lastErr: any;
  for (const [index, key] of keys.entries()) {
    try {
      return await callOpenAICompat(endpoint, key, model, prompt);
    } catch (err: any) {
      lastErr = err;
      if (shouldTryNextKey(err)) {
        console.warn('[AI 3D] ' + provider + ' key #' + (index + 1) + ' lỗi/hết quota, thử key tiếp.');
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Chưa cấu hình ' + provider + ' API Key.');
}

async function callSharedAIText(model: string, prompt: string): Promise<string> {
  const useProxy = E.VITE_USE_AI_PROXY !== 'false';
  if (useProxy && typeof window !== 'undefined') {
    try {
      return await callBackendProxyText(model, prompt);
    } catch (err) {
      const hasFallbackKeys = GEMINI_KEYS.length > 0 || DEEPSEEK_KEYS.length > 0 || OPENAI_KEYS.length > 0;
      if (!hasFallbackKeys) throw err;
      console.warn('[AI 3D] Proxy lỗi hoặc chưa có /api/generate, chuyển sang key browser.', err);
    }
  }

  if (GEMINI_KEYS.length > 0) return callGeminiText(model, prompt);
  if (DEEPSEEK_KEYS.length > 0) {
    return callProviderKeys('DeepSeek', DEEPSEEK_KEYS, 'https://api.deepseek.com/chat/completions', E.VITE_DEEPSEEK_MODEL || 'deepseek-chat', prompt);
  }
  if (OPENAI_KEYS.length > 0) {
    return callProviderKeys('OpenAI', OPENAI_KEYS, 'https://api.openai.com/v1/chat/completions', E.VITE_OPENAI_MODEL || 'gpt-4o-mini', prompt);
  }
  throw new Error('Chưa cấu hình API Key. Hãy thêm key server-side cho /api/generate hoặc key trong phần Quản lý API Keys.');
}

function buildFallbackScene(index: number, sceneCount: number, topic: string): ThreeDScriptScene {
  return {
    title: 'Cảnh ' + (index + 1),
    background: 'Không gian hoạt hình 3D sinh động, màu sắc hài hòa.',
    action: 'Nhân vật chính tương tác tự nhiên với bối cảnh.',
    expression: 'Thân thiện, biểu cảm rõ ràng.',
    camera: 'Medium shot, chuyển động máy nhẹ và ổn định.',
    videoPrompt:
      'A consistent cute 3D animated character explains ' +
      topic +
      '. Vertical 9:16, high quality, accurate Vietnamese lip sync, no on-screen text, no subtitles, no logo, no watermark.',
    voiceScript: fallbackVoice(index, sceneCount, topic),
  };
}

export async function generate3DContent(state: ThreeDState): Promise<ThreeDGeneratedResult> {
  const audience =
    state.audience === 'Tùy chỉnh' && state.customAudience.trim()
      ? state.customAudience.trim()
      : state.audience;
  const voiceDirection = VOICE_DIRECTION[state.voice] || VOICE_DIRECTION.Bắc;
  const videoTechnique = VIDEO_TECHNIQUE[state.videoModel] || VIDEO_TECHNIQUE['Veo 3'];

  const prompt = [
    'Bạn là biên kịch hoạt hình 3D, chuyên gia giáo dục đại chúng và chuyên gia viết prompt video AI.',
    '',
    'NHIỆM VỤ:',
    '- Phân tích chính xác chủ đề: "' + state.topic + '".',
    '- Tự xác định một nhân vật hoạt hình 3D trung tâm phù hợp nhất với chủ đề.',
    '- Nếu chủ đề là một vật, cây, quả, bộ phận hoặc hiện tượng, hãy nhân cách hóa thành nhân vật 3D đáng yêu có mắt, miệng, tay chân và biểu cảm tự nhiên.',
    '- Tạo câu chuyện liền mạch gồm đúng ' + state.sceneCount + ' cảnh, mỗi cảnh khoảng 8 giây.',
    '',
    'THÔNG SỐ:',
    '- Phong cách nội dung: ' + state.style,
    '- Đối tượng xem: ' + audience,
    '- Giọng đọc: ' + state.voice,
    '- Tỉ lệ video: ' + state.aspectRatio,
    '- Model video đang dùng: ' + state.videoModel,
    '- Yêu cầu bổ sung: ' + (state.requirements.trim() || 'Không có'),
    '',
    'NHÂN VẬT NHẤT QUÁN:',
    '- Tạo name, description và fixedIdentity thật cụ thể.',
    '- fixedIdentity phải mô tả cố định hình dáng, màu sắc, khuôn mặt, mắt, miệng, tay chân, trang phục, chất liệu và phong cách 3D.',
    '- Tuyệt đối không đổi ngoại hình, màu sắc, trang phục, giọng nói hoặc phong cách hình ảnh giữa các cảnh.',
    '',
    'QUY TẮC PROMPT VIDEO:',
    '- videoPrompt viết bằng tiếng Anh, đầy đủ và dùng trực tiếp để tạo video.',
    '- Mỗi prompt phải lặp lại fixedIdentity của nhân vật.',
    '- Nêu rõ bối cảnh, hành động, biểu cảm, góc máy, ánh sáng và diễn biến của cảnh.',
    '- ' + voiceDirection,
    '- ' + videoTechnique,
    '- Vertical 9:16, high quality, vivid realistic 3D animation.',
    '- No on-screen text, no subtitles, no logo, no watermark.',
    '- No character redesign, no color change, no outfit change, no voice change.',
    '',
    'QUY TẮC LỜI THOẠI 8 GIÂY - BẮT BUỘC:',
    '- Mỗi voiceScript phải là tiếng Việt, viết liền mạch, đủ câu, đủ ý, không cụt ý.',
    '- Mỗi voiceScript chỉ gồm 1 câu hoàn chỉnh hoặc tối đa 2 câu rất ngắn.',
    '- Mỗi voiceScript dài từ ' + VOICE_MIN_WORDS + ' đến ' + VOICE_MAX_WORDS + ' từ để nói vừa trong khoảng 8 giây.',
    '- Mỗi câu phải có chủ thể rõ ràng, hành động hoặc thông tin rõ ràng, và kết thúc bằng dấu chấm.',
    '- Không dùng câu lửng, không kết thúc bằng: và, vì, để, nên, nhưng, hoặc, là.',
    '- Không viết kiểu khẩu hiệu rời rạc như: "Rất tốt cho sức khỏe" hoặc "Hãy cùng tìm hiểu tiếp".',
    '- Không lặp cùng một mở đầu ở nhiều cảnh; chỉ dùng "mọi người ơi" tối đa một lần.',
    '- Mỗi cảnh chỉ truyền tải một ý chính, nhưng ý đó phải trọn vẹn.',
    '- Mạch nội dung phải khoa học: cảnh 1 nêu vấn đề; cảnh 2 giải thích bản chất; cảnh 3 đưa ví dụ hoặc ứng dụng; cảnh 4 nếu có thì mở rộng; cảnh cuối kết luận hoặc CTA mềm.',
    '- Các cảnh phải nối logic bằng từ chuyển ý tự nhiên như: đầu tiên, tiếp theo, vì vậy, cuối cùng, nhưng không lạm dụng.',
    '- Với chủ đề sức khỏe, nói theo hướng kiến thức tham khảo, không bịa công dụng, không chẩn đoán, không hứa hẹn điều trị.',
    '- Cấm dùng: chữa khỏi, trị dứt điểm, cam kết hiệu quả, đảm bảo 100%, thuốc thần kỳ.',
    '',
    'OUTPUT CHỈ JSON HỢP LỆ, KHÔNG MARKDOWN:',
    '{',
    '  "summary": "Tóm tắt câu chuyện",',
    '  "character": {',
    '    "name": "Tên nhân vật",',
    '    "description": "Mô tả nhân vật bằng tiếng Việt",',
    '    "fixedIdentity": "Mô tả nhận diện cố định bằng tiếng Anh"',
    '  },',
    '  "scenes": [',
    '    {',
    '      "title": "Tiêu đề cảnh",',
    '      "background": "Bối cảnh",',
    '      "action": "Hành động",',
    '      "expression": "Biểu cảm",',
    '      "camera": "Góc máy và ánh sáng",',
    '      "videoPrompt": "Prompt video 3D chi tiết bằng tiếng Anh",',
    '      "voiceScript": "Một câu tiếng Việt hoàn chỉnh, logic, ' + VOICE_MIN_WORDS + '-' + VOICE_MAX_WORDS + ' từ, nói vừa trong 8 giây"',
    '    }',
    '  ]',
    '}',
  ].join('\n');

  const raw = await callSharedAIText('gemini-2.5-flash', prompt);
  const data = extractJSON(raw);

  const character: ThreeDCharacterProfile = {
    name: String(data?.character?.name || 'Nhân vật 3D chính').trim(),
    description: String(
      data?.character?.description ||
        'Nhân vật hoạt hình 3D thân thiện, sinh động và phù hợp với chủ đề.',
    ).trim(),
    fixedIdentity: String(
      data?.character?.fixedIdentity ||
        'A cute consistent 3D animated character with a friendly face, expressive eyes, small arms and legs, and a polished colorful surface.',
    ).trim(),
  };

  const rawScenes = Array.isArray(data?.scenes) ? data.scenes.slice(0, state.sceneCount) : [];
  while (rawScenes.length < state.sceneCount) {
    rawScenes.push(buildFallbackScene(rawScenes.length, state.sceneCount, state.topic));
  }

  const scenes: ThreeDScriptScene[] = rawScenes.map((scene: any, index: number) => {
    const fallback = buildFallbackScene(index, state.sceneCount, state.topic);
    const continuity =
      'CHARACTER CONTINUITY LOCK: ' +
      character.fixedIdentity +
      '. Same exact character identity, proportions, colors, face, clothing, material, voice, and 3D art style in every scene. ';
    let videoPrompt = String(scene?.videoPrompt || fallback.videoPrompt).trim();

    if (!videoPrompt.toLowerCase().includes('character continuity lock')) {
      videoPrompt = continuity + videoPrompt;
    }
    if (!videoPrompt.toLowerCase().includes('vertical 9:16')) {
      videoPrompt += ' Vertical 9:16, high quality.';
    }
    if (!videoPrompt.toLowerCase().includes('no on-screen text')) {
      videoPrompt += ' No on-screen text, no subtitles, no logo, no watermark.';
    }
    if (!videoPrompt.toLowerCase().includes('lip sync')) {
      videoPrompt += ' ' + voiceDirection;
    }

    const voiceScript = normalizeVoiceScript(String(scene?.voiceScript || ''), fallback.voiceScript);

    return {
      title: String(scene?.title || fallback.title).trim(),
      background: String(scene?.background || fallback.background).trim(),
      action: String(scene?.action || fallback.action).trim(),
      expression: String(scene?.expression || fallback.expression).trim(),
      camera: String(scene?.camera || fallback.camera).trim(),
      videoPrompt,
      voiceScript,
    };
  });

  return {
    id: uuidv4(),
    timestamp: Date.now(),
    summary: String(data?.summary || 'Câu chuyện hoạt hình 3D về ' + state.topic).trim(),
    character,
    scenes,
    inputs: state,
  };
}
