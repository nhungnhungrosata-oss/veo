import { AppState, GeneratedResult } from '../types';
import { v4 as uuidv4 } from 'uuid';

const IDENTITY_LOCK = 'Based on the reference image. Same person, same identity, same face, same hairstyle, same outfit, same background, same environment. Maintain 100% character consistency and scene consistency. No morphing, no identity change, no outfit change, no background change.';

const VOICE: Record<string, string> = {
  'Bắc': 'The person is speaking Vietnamese with a clear, standard Northern Vietnamese accent (giọng Bắc Hà Nội). Speech is articulate and natural. Natural lip movements perfectly synchronized with the speech rhythm.',
  'Nam': 'The person is speaking Vietnamese with a clear, standard Southern Vietnamese accent (giọng Nam). Speech is fluid and natural. Natural lip movements perfectly synchronized with the speech rhythm.',
  'Trung': 'The person is speaking Vietnamese with a clear, intelligible Central Vietnamese accent (giọng Trung phổ thông). Speech is authentic and natural. Natural lip movements perfectly synchronized with the speech rhythm.',
};

const STYLE: Record<string, string> = {
  energy: 'The overall tone is high-energy, fast-paced, enthusiastic, and vibrant.',
  professional: 'The overall tone is professional, confident, authoritative, clear, calm, and trustworthy.',
  gentle: 'The overall tone is soft, warm, emotional, slow-paced, soothing, intimate, and reflective.',
  natural: 'The overall tone is casual, friendly, approachable, relaxed, and conversational.',
};

export async function suggestScripts(contentSnippet: string): Promise<string[]> {
  const text = contentSnippet.trim();
  if (text.split(/\s+/).length < 4) return [];
  return [
    `${text.slice(0, 42)}... điều nhiều mẹ hay bỏ qua`,
    `3 điều đơn giản giúp con khỏe hơn mỗi ngày`,
  ];
}

function splitContent(content: string, sceneCount: number): string[] {
  const clean = content.replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').filter(Boolean);
  if (words.length === 0) return Array(sceneCount).fill('Hãy bắt đầu bằng một thông điệp rõ ràng và gần gũi.');
  const chunk = Math.max(5, Math.ceil(words.length / sceneCount));
  return Array.from({ length: sceneCount }, (_, i) => words.slice(i * chunk, (i + 1) * chunk).join(' ') || clean);
}

export async function generateContent(state: AppState): Promise<GeneratedResult> {
  const hasImage = state.selectedImageIndex !== null && !!state.images[state.selectedImageIndex];
  const voiceStyle = `${VOICE[state.voice] || VOICE['Bắc']} ${STYLE[state.style] || STYLE.professional}`;
  const parts = splitContent(state.content, state.sceneCount);
  const scenes = parts.map((part, index) => ({
    videoPrompt: `${hasImage ? IDENTITY_LOCK + ' ' : ''}${voiceStyle} Medium close-up shot, natural eye contact, gentle hand gestures, warm clean lighting, shallow depth of field, blurred background, photorealistic, no text, no watermark. Scene ${index + 1}: the person speaks with a friendly and trustworthy expression about: ${part}`,
    voiceScript: index === 0
      ? `Các mẹ ơi, hôm nay Ngoan muốn nhắc một chuyện rất đơn giản nhưng nhiều gia đình hay bỏ qua: ${part}`
      : index === state.sceneCount - 1
        ? `${part}. Mình cứ làm đều mỗi ngày nhé, rồi cơ thể con sẽ được chăm sóc tốt hơn từng chút một.`
        : `${part}. Điều này nghe nhỏ thôi, nhưng nếu mình duy trì đều thì lợi ích sẽ rõ ràng hơn nhiều đó.`,
  }));

  return {
    id: uuidv4(),
    timestamp: Date.now(),
    hook: state.content.trim().slice(0, 58) || 'Điều nhỏ này nhiều mẹ đang bỏ qua!',
    hashtags: ['#mevabe', '#chamsoccon', '#dinhduong', '#suckhoegiadinh', '#videoAI'],
    scenes,
    thumbnailVariations: [
      { text: 'Vận động cho bé: mẹ đừng bỏ qua!' },
      { text: 'Bí quyết giúp con ăn ngon, ngủ sâu' },
      { text: '15 phút mỗi ngày thay đổi con bạn' },
    ],
    inputs: state,
  };
}
