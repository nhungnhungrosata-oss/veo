import { GoogleGenAI } from "@google/genai";
import { AppState, GeneratedResult, StyleType } from "../types";
import { v4 as uuidv4 } from "uuid";

// ─── ENV KEYS (Vite/Railway/Vercel) ─────────────────────────────────────────
// Lưu ý: App chạy frontend nên biến môi trường muốn dùng trong browser phải có tiền tố VITE_.
// @ts-ignore
const E = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

type ApiKeyItem = { key: string; label?: string; tier?: string; active?: boolean };

function uniqueKeys(keys: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  return keys
    .map((k) => (typeof k === "string" ? k.trim() : ""))
    .filter(Boolean)
    .filter((k) => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function readLocalProviderKeys(provider: "google" | "deepseek" | "openai"): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem("api_key_manager_v1");
    if (!raw) return [];
    const config = JSON.parse(raw);
    const keys = config?.[provider]?.keys;
    if (!Array.isArray(keys)) return [];
    return uniqueKeys(
      keys
        .filter((item: ApiKeyItem) => item && item.active !== false)
        .map((item: ApiKeyItem) => item.key)
    );
  } catch (err) {
    console.warn("[AI] Không đọc được api_key_manager_v1", err);
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
  E.VITE_GEMINI_API_KEY_PAID,
  ...readLocalProviderKeys("google"),
]).filter((k) => k.startsWith("AIza"));

const DEEPSEEK_KEYS = uniqueKeys([
  E.VITE_DEEPSEEK_API_KEY,
  E.VITE_DEEPSEEK_API_KEY_1,
  E.VITE_DEEPSEEK_API_KEY_2,
  E.VITE_DEEPSEEK_API_KEY_3,
  E.VITE_DEEPSEEK_API_KEY_4,
  E.VITE_DEEPSEEK_API_KEY_5,
  ...readLocalProviderKeys("deepseek"),
]);

const OPENAI_KEYS = uniqueKeys([
  E.VITE_OPENAI_API_KEY,
  E.VITE_OPENAI_API_KEY_1,
  E.VITE_OPENAI_API_KEY_2,
  E.VITE_OPENAI_API_KEY_3,
  E.VITE_OPENAI_API_KEY_4,
  E.VITE_OPENAI_API_KEY_5,
  ...readLocalProviderKeys("openai"),
]);

// ─── UTILS ───────────────────────────────────────────────────────────────────
const errText = (err: any): string =>
  `${err?.status ?? ""} ${err?.code ?? ""} ${err?.message ?? ""}`.toLowerCase();

const isQuotaError = (err: any): boolean => {
  const text = errText(err);
  return (
    err?.status === 429 ||
    text.includes("429") ||
    text.includes("quota") ||
    text.includes("rate_limit") ||
    text.includes("rate limit") ||
    text.includes("resource_exhausted") ||
    text.includes("insufficient_quota") ||
    text.includes("insufficient balance") ||
    text.includes("balance")
  );
};

const isKeyError = (err: any): boolean => {
  const text = errText(err);
  return (
    err?.status === 400 ||
    err?.status === 401 ||
    err?.status === 403 ||
    text.includes("api key") ||
    text.includes("invalid") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("permission") ||
    text.includes("billing")
  );
};

const shouldTryNextKey = (err: any): boolean => isQuotaError(err) || isKeyError(err);

// ─── GEMINI CALLER ───────────────────────────────────────────────────────────
async function callGeminiText(model: string, prompt: string): Promise<string> {
  let lastErr: any;
  for (const [index, key] of GEMINI_KEYS.entries()) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });
      if (res.text) return res.text;
      throw new Error("Empty response");
    } catch (err: any) {
      lastErr = err;
      if (shouldTryNextKey(err)) {
        console.warn(`[AI] Gemini key #${index + 1} lỗi/hết quota → thử key tiếp`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error("Chưa cấu hình Gemini API Key.");
}

// ─── OPENAI / DEEPSEEK CALLER ────────────────────────────────────────────────
async function callOpenAICompat(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: any[]
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callProviderKeys(
  providerName: "DeepSeek" | "OpenAI",
  keys: string[],
  endpoint: string,
  model: string,
  prompt: string
): Promise<string> {
  let lastErr: any;
  for (const [index, key] of keys.entries()) {
    try {
      return await callOpenAICompat(endpoint, key, model, [{ role: "user", content: prompt }]);
    } catch (err: any) {
      lastErr = err;
      if (shouldTryNextKey(err)) {
        console.warn(`[AI] ${providerName} key #${index + 1} lỗi/hết quota → thử key tiếp`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error(`Chưa cấu hình ${providerName} API Key.`);
}

// ─── AI TEXT: Gemini free/paid → DeepSeek → OpenAI ──────────────────────────
async function callAIText(model: string, prompt: string): Promise<string> {
  let lastFallbackErr: any;

  if (GEMINI_KEYS.length > 0) {
    try {
      return await callGeminiText(model, prompt);
    } catch (err) {
      lastFallbackErr = err;
      if (shouldTryNextKey(err)) {
        console.warn("[AI] Tất cả Gemini key lỗi/hết quota → chuyển sang DeepSeek");
      } else {
        throw err;
      }
    }
  }

  if (DEEPSEEK_KEYS.length > 0) {
    try {
      return await callProviderKeys(
        "DeepSeek",
        DEEPSEEK_KEYS,
        "https://api.deepseek.com/chat/completions",
        E.VITE_DEEPSEEK_MODEL || "deepseek-v4-flash",
        prompt
      );
    } catch (err) {
      lastFallbackErr = err;
      if (shouldTryNextKey(err)) {
        console.warn("[AI] Tất cả DeepSeek key lỗi/hết quota → chuyển sang OpenAI");
      } else {
        throw err;
      }
    }
  }

  if (OPENAI_KEYS.length > 0) {
    try {
      return await callProviderKeys(
        "OpenAI",
        OPENAI_KEYS,
        "https://api.openai.com/v1/chat/completions",
        E.VITE_OPENAI_MODEL || "gpt-4o-mini",
        prompt
      );
    } catch (err) {
      lastFallbackErr = err;
      throw err;
    }
  }

  throw lastFallbackErr || new Error("Tất cả API đều hết quota hoặc chưa cấu hình Environment Variables.");
}

// ─── GỢI Ý TIÊU ĐỀ NHANH ─────────────────────────────────────────────────────
export async function suggestScripts(
  contentSnippet: string
): Promise<string[]> {
  if (!contentSnippet || contentSnippet.trim().split(/\s+/).length < 4)
    return [];

  const prompt = `Dựa trên nội dung sau, đề xuất 2 tiêu đề viral ngắn gọn cho video TikTok/Reels xây dựng thương hiệu cá nhân.
Yêu cầu: Mỗi tiêu đề tối đa 20 từ, tiếng Việt, kích thích tò mò.
Nội dung: "${contentSnippet}"
Trả về JSON: {"suggestions": ["tiêu đề 1", "tiêu đề 2"]}`;

  try {
    const text = await callAIText("gemini-2.5-flash", prompt);
    const data = JSON.parse(text);
    const arr = data.suggestions ?? data;
    if (Array.isArray(arr)) return arr.slice(0, 3);
  } catch (e) {
    console.error("[suggestScripts]", e);
  }
  return [];
}

// ─── IDENTITY LOCK — giữ nguyên nhân vật & bối cảnh ─────────────────────────
const IDENTITY_LOCK =
  "Based on the reference image. Same person, same identity, same face, same hairstyle, same outfit, same background, same environment. Maintain 100% character consistency and scene consistency. No morphing, no identity change, no outfit change, no background change.";

// ─── VOICE DIRECTION — mô tả giọng nói trong videoPrompt (tiếng Anh) ────────
const VOICE_DIRECTION: Record<string, string> = {
  Bắc: "The person is speaking Vietnamese with a clear, standard Northern Vietnamese accent (giọng Bắc Hà Nội). Speech is articulate and natural. Natural lip movements perfectly synchronized with the speech rhythm.",
  Nam: "The person is speaking Vietnamese with a clear, standard Southern Vietnamese accent (giọng Nam). Speech is fluid and natural. Natural lip movements perfectly synchronized with the speech rhythm.",
  Trung: "The person is speaking Vietnamese with a clear, intelligible Central Vietnamese accent (giọng Trung phổ thông). Speech is authentic and natural. Natural lip movements perfectly synchronized with the speech rhythm.",
};

// ─── STYLE DIRECTION — mô tả phong cách/năng lượng (tiếng Anh) ──────────────
const STYLE_DIRECTION: Record<StyleType, string> = {
  energy:
    "The overall tone is high-energy, fast-paced, enthusiastic, and vibrant with a persuasive and dynamic delivery.",
  professional:
    "The overall tone is professional, confident, authoritative, well-modulated, clear, calm, and trustworthy.",
  gentle:
    "The overall tone is soft, warm, emotional, slow-paced, soothing, intimate, and deeply reflective.",
  natural:
    "The overall tone is casual, friendly, approachable, relaxed, and perfectly mimics an everyday conversational pattern (non-robotic).",
};

// ─── Helper: ghép Voice + Style thành chuỗi prompt hoàn chỉnh ───────────────
function buildVoiceStylePrompt(voice: string, style: StyleType): string {
  const voicePrompt = VOICE_DIRECTION[voice] ?? VOICE_DIRECTION["Bắc"];
  const stylePrompt = STYLE_DIRECTION[style] ?? STYLE_DIRECTION["professional"];
  return `${voicePrompt} ${stylePrompt}`;
}

// ─── KỸ THUẬT VIDEO — chỉ dùng nội bộ, không hiện tên model cho AI ──────────
const VIDEO_TECHNIQUE: Record<string, string> = {
  "Veo 3":
    "Static camera, locked shot, no zoom, no pan unless specified. Natural lip sync with speech, subtle facial micro-expressions, natural eye blinking every 3-4 seconds, gentle realistic head movements. Cinematic shallow depth of field, film grain. No text overlay, no watermark, no scene transition within single clip. Photorealistic rendering.",
  Gork:
    "Static camera, locked shot, no zoom, no pan unless specified. Natural lip sync, realistic mouth movements matching speech rhythm, subtle head tilts, natural eye blinking, relaxed authentic facial expressions, gentle hand gestures when emphasizing points. No text overlay, no watermark, no scene transition within single clip. Photorealistic, consistent natural lighting throughout.",
};

// ─── SINH KỊCH BẢN CHÍNH ─────────────────────────────────────────────────────
export async function generateContent(
  state: AppState
): Promise<GeneratedResult> {
  const modelTimeLimit = state.videoModel === "Veo 3" ? 8 : 10;
  const hasRefImage =
    state.selectedImageIndex !== null &&
    state.images[state.selectedImageIndex] !== undefined;

  // ── Giọng nói + Phong cách ──
  const voiceProfile: Record<string, { guidance: string; wps: number; style: string }> = {
    Bắc: {
      guidance: "Giọng Bắc: rõ ràng, chuẩn mực, nhịp nhanh, năng động, dứt khoát",
      wps: 4,
      style: "Câu ngắn, dứt khoát, tiết tấu nhanh. Dùng từ ngữ miền Bắc tự nhiên. Ví dụ: 'ấy', 'nhỉ', 'cơ', 'đấy', 'thế nào'. KHÔNG dùng từ miền Nam.",
    },
    Nam: {
      guidance: "Giọng Nam: ấm áp, gần gũi, nhẹ nhàng, chậm rãi, thân thiện",
      wps: 3,
      style: "Câu dài hơn, nhẹ nhàng, thân thiện. Dùng từ ngữ miền Nam tự nhiên. Ví dụ: 'nha', 'hen', 'nghen', 'á', 'nè', 'đó', 'vậy đó'. KHÔNG dùng từ miền Bắc.",
    },
    Trung: {
      guidance: "Giọng Trung: truyền cảm, đặc sắc, nhấn nhá rõ ràng",
      wps: 3.5,
      style: "Câu có nhấn nhá, truyền cảm. Dùng từ ngữ miền Trung tự nhiên. Ví dụ: 'ni', 'nớ', 'rứa', 'mô', 'chi', 'răng'. Giữ sự chân thành, mộc mạc.",
    },
  };

  const voice = voiceProfile[state.voice] || voiceProfile["Bắc"];
  // ── Final Voice+Style prompt — ghép theo công thức: [Accent] + " " + [Style] ──
  const voiceDir = buildVoiceStylePrompt(state.voice, state.style ?? "professional");
  const minWords = Math.round(modelTimeLimit * voice.wps * 0.75);
  const maxWords = Math.round(modelTimeLimit * voice.wps * 0.95);
  const technique = VIDEO_TECHNIQUE[state.videoModel] || VIDEO_TECHNIQUE["Gork"];

  // ── Prefix bắt buộc cho mỗi videoPrompt ──
  const promptPrefix = hasRefImage
    ? `${IDENTITY_LOCK} ${voiceDir}`
    : voiceDir;

  // ── Prompt chính — KHÔNG đề cập tên model (Gork/Veo 3) trong nội dung ──
  const prompt = `Bạn là chuyên gia viết kịch bản video ngắn viral cho TikTok/Reels/Shorts, chuyên xây dựng thương hiệu cá nhân.

=== CẢNH BÁO QUAN TRỌNG ===
⛔ TUYỆT ĐỐI KHÔNG được nhắc đến tên bất kỳ công cụ, phần mềm, nền tảng tạo video, hoặc AI nào trong lời thoại (voiceScript), hook, hashtag, thumbnailTexts.
⛔ KHÔNG viết những câu kiểu "Follow [tên gì đó]", "Theo dõi [tên gì đó]" trừ khi người dùng YÊU CẦU RÕ RÀNG trong phần điều khiển AI.
⛔ Nội dung lời thoại CHỈ tập trung vào chủ đề/thông điệp mà người dùng cung cấp, không quảng cáo bất kỳ thứ gì khác.
============================

=== DỮ LIỆU ĐẦU VÀO ===
📝 Nội dung chính: "${state.content}"
🎛️ Điều khiển AI: "${state.notes || "Không có — tự do sáng tạo phù hợp nội dung"}"
🎬 Số cảnh: ${state.sceneCount}
🎙️ Giọng: ${state.voice} → ${voice.guidance}
⏱️ Thời lượng mỗi cảnh: ${modelTimeLimit} giây
🖼️ Có ảnh tham chiếu: ${hasRefImage ? "CÓ (người dùng sẽ đính kèm ảnh gốc khi tạo video)" : "KHÔNG CÓ"}
=========================

=== PHÂN TÍCH TRƯỚC KHI VIẾT ===
A. NỘI DUNG: Thông điệp cốt lõi? Đối tượng xem? Cảm xúc muốn truyền tải?
B. ĐIỀU KHIỂN AI: Có yêu cầu đặc biệt? → CÓ: tuân thủ tuyệt đối. KHÔNG: sáng tạo phù hợp.
C. GIỌNG NÓI (QUAN TRỌNG NHẤT):
   ${voice.style}
   Tốc độ nói: ~${voice.wps} từ/giây → ${modelTimeLimit}s = phải từ ${minWords}-${maxWords} từ/cảnh
D. PHÂN CẢNH: ${state.sceneCount} cảnh logic — Cảnh 1: Hook → Cảnh giữa: Phát triển → Cảnh cuối: Kết luận/CTA
E. THỜI LƯỢNG: ${modelTimeLimit} giây mỗi cảnh — ${modelTimeLimit === 8 ? "ngắn, cần câu từ súc tích, đi thẳng vào vấn đề" : "dài hơn, có thể mở rộng ý, thêm ví dụ ngắn"}
=================================

=== QUY TẮC VIDEO PROMPT (viết bằng tiếng Anh) ===

🔊 GIỌNG NÓI (BẮT BUỘC trong mỗi videoPrompt):
Mỗi videoPrompt PHẢI chứa đoạn mô tả giọng nói sau (COPY NGUYÊN VĂN, không sửa):
"${voiceDir}"

${hasRefImage ? `🔒 GIỮ NGUYÊN NHÂN VẬT (BẮT BUỘC vì có ảnh tham chiếu):
Mỗi videoPrompt PHẢI mở đầu bằng đoạn sau (COPY NGUYÊN VĂN, không sửa):
"${IDENTITY_LOCK}"

→ Thứ tự bắt buộc: IDENTITY LOCK → VOICE DIRECTION → hành động cụ thể cho cảnh
→ Người dùng sẽ đính kèm ảnh gốc khi tạo video, nên KHÔNG cần mô tả ngoại hình nhân vật
→ Chỉ mô tả: HÀNH ĐỘNG + BIỂU CẢM + GÓC MÁY + ÁNH SÁNG` : `❌ KHÔNG CÓ ẢNH THAM CHIẾU:
→ Thứ tự: VOICE DIRECTION → hành động + bối cảnh + ánh sáng + góc máy
→ Không mô tả nhân vật cụ thể`}

Kỹ thuật video bắt buộc:
${technique}

Chi tiết hóa:
- Hành động CỤ THỂ: "slightly leans forward, makes direct eye contact, nods gently while speaking" ✓ | "talks to camera" ✗
- Ánh sáng CỤ THỂ: "soft warm golden-hour light from the left, gentle fill light" ✓ | "good lighting" ✗  
- Góc máy CỤ THỂ: "medium close-up, eye-level, shallow depth of field, bokeh background" ✓ | "normal shot" ✗
- Cảnh 1: close-up/medium close-up để HOOK
- Nhiều cảnh: biến tấu nhẹ góc máy nhưng KHÔNG đổi bối cảnh/trang phục
====================================================

=== QUY TẮC VOICESCRIPT (viết bằng tiếng Việt) ===
1. 🎙️ ${voice.guidance}
2. ${voice.style}
3. GIỐNG NGƯỜI THẬT nói chuyện trước camera — KHÔNG giọng MC, KHÔNG giọng robot, KHÔNG giọng đọc sách
4. Số từ BẮT BUỘC: ${minWords}-${maxWords} từ/cảnh (${modelTimeLimit}s × ~${voice.wps} từ/s). ĐẾM TỪNG TỪ trước khi output.
5. Cảnh 1 = HOOK: câu mở đầu phải gây tò mò, giữ chân người xem ngay lập tức
6. Cảnh cuối = KẾT: kết luận mạnh mẽ hoặc CTA (kêu gọi hành động liên quan đến NỘI DUNG, KHÔNG kêu gọi follow bất kỳ kênh/app/tool nào trừ khi người dùng yêu cầu trong điều khiển AI)
7. Các cảnh giữa: phát triển logic, mỗi cảnh 1 ý chính duy nhất
8. Nếu điều khiển AI có yêu cầu đặc biệt → áp dụng vào giọng văn và phong cách nói
⛔ NHẮC LẠI: KHÔNG nhắc tên bất kỳ công cụ/phần mềm/nền tảng nào trong lời thoại. Chỉ nói về NỘI DUNG.
====================================================

=== HOOK & HASHTAG ===
- Hook: 1 câu tiếng Việt ≤15 từ, gây tò mò ngay lập tức, liên quan trực tiếp đến nội dung
- Hashtag: 5 cái, mix trending + niche, liên quan đến CHỦ ĐỀ nội dung
=======================

=== THUMBNAIL ===
- 3 biến thể tiêu đề thumbnail tiếng Việt
- Tối đa 50 ký tự, gây tò mò, liên quan đến nội dung
=================

OUTPUT — CHỈ JSON, KHÔNG TEXT KHÁC:
{
  "hook": "câu hook tiếng Việt ≤15 từ",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "scenes": [
    {
      "videoPrompt": "${promptPrefix} [tiếp tục mô tả hành động, biểu cảm, góc máy, ánh sáng cụ thể cho cảnh này]",
      "voiceScript": "Lời thoại tiếng Việt ${minWords}-${maxWords} từ, giọng ${state.voice}, tự nhiên như người thật"
    }
  ],
  "thumbnailTexts": ["Tiêu đề 1", "Tiêu đề 2", "Tiêu đề 3"]
}

⚠️ KIỂM TRA CUỐI (bắt buộc trước khi output):
□ Đúng ${state.sceneCount} scenes?
□ Mỗi videoPrompt có đoạn voice "${voiceDir.substring(0, 40)}..."?
${hasRefImage ? '□ Mỗi videoPrompt bắt đầu bằng "Based on the reference image..."?' : '□ Mỗi videoPrompt không mô tả nhân vật cụ thể?'}
□ Mỗi voiceScript có ${minWords}-${maxWords} từ?
□ voiceScript đúng giọng ${state.voice} với từ ngữ đặc trưng vùng miền?
□ KHÔNG có tên công cụ/phần mềm/nền tảng nào trong voiceScript, hook, hashtag, thumbnail?
□ Không có text/watermark trong videoPrompt?
□ Chỉ JSON, không text thừa?`;

  // ── Gọi AI ──
  console.log(
    `[AI] Generating: ${state.sceneCount} scenes, model=${state.videoModel}, voice=${state.voice}, time=${modelTimeLimit}s, hasRef=${hasRefImage}`
  );
  const text = await callAIText("gemini-2.5-flash", prompt);
  if (!text) throw new Error("AI không trả về kết quả. Vui lòng thử lại.");

  const data = JSON.parse(text);

  // ── Safety: đảm bảo mỗi videoPrompt luôn có identity lock + voice direction ──
  if (Array.isArray(data.scenes)) {
    data.scenes = data.scenes.map((scene: any) => {
      let vp = (scene.videoPrompt || "").trim();

      // Đảm bảo có voice direction
      if (!vp.includes("Vietnamese accent") && !vp.includes("giọng")) {
        vp = `${voiceDir} ${vp}`;
      }

      // Đảm bảo có identity lock nếu có ảnh tham chiếu
      if (hasRefImage && !vp.startsWith("Based on the reference image")) {
        vp = `${IDENTITY_LOCK} ${vp}`;
      }

      scene.videoPrompt = vp;
      return scene;
    });
  }

  const thumbnailStyles = [
    "bg-black/70 backdrop-blur-md text-white rounded-[16px] px-5 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.5)] border border-white/20 font-title font-bold uppercase tracking-tight",
    "bg-white/25 backdrop-blur-xl border border-white/50 text-white shadow-[0_8px_32px_0_rgba(0,0,0,0.6)] rounded-[20px] px-5 py-3 font-title font-extrabold uppercase drop-shadow-md tracking-tight",
    "bg-gradient-to-r from-[#9333EA] to-[#C026D3] text-white shadow-[0_10px_30px_rgba(192,38,211,0.5)] rounded-[14px] px-5 py-3 border border-white/20 font-title font-extrabold uppercase tracking-tight",
    "bg-gradient-to-r from-[#F5A623] to-[#EA580C] text-white shadow-[0_10px_30px_rgba(245,166,35,0.4)] rounded-[16px] px-5 py-3 border border-white/30 font-title font-extrabold uppercase tracking-tight",
    "bg-[#FDE68A] text-[#92400E] shadow-[0_8px_30px_rgba(245,166,35,0.4)] px-6 py-3 rounded-[12px] border-2 border-[#F5A623] font-title font-extrabold uppercase tracking-tight",
    "bg-[#0EA5E9] text-white shadow-[0_8px_30px_rgba(14,165,233,0.5)] px-5 py-3 rounded-[16px] border border-white/20 font-title font-extrabold uppercase tracking-tight",
  ];
  const shuffledStyles = [...thumbnailStyles].sort(() => 0.5 - Math.random());

  return {
    id: uuidv4(),
    timestamp: Date.now(),
    hook: data.hook,
    hashtags: data.hashtags,
    scenes: data.scenes,
    thumbnailVariations: data.thumbnailTexts.map((t: string, i: number) => ({
      text: t,
      styleClass: shuffledStyles[i % shuffledStyles.length],
    })),
    inputs: state,
  };
}
