import { GoogleGenAI } from "@google/genai";
import { AppState, GeneratedResult } from "../types";
import { v4 as uuidv4 } from "uuid";

// ─── ENV KEYS (Vercel Dashboard) ─────────────────────────────────────────────
// VITE_GEMINI_API_KEY      AIza...   (Gemini - ưu tiên 1, free)
// VITE_GEMINI_API_KEY_2    AIza...   (Gemini key 2 - free dự phòng)
// VITE_DEEPSEEK_API_KEY    sk-...    (DeepSeek - dự phòng text)
// VITE_OPENAI_API_KEY      sk-...    (OpenAI gpt-4o-mini - dự phòng cuối)
// @ts-ignore
const E = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

const GEMINI_KEYS = [
  E.VITE_GEMINI_API_KEY,
  E.VITE_GEMINI_API_KEY_2,
  E.VITE_GEMINI_API_KEY_3,
  E.VITE_GEMINI_API_KEY_4,
  E.VITE_GEMINI_API_KEY_5,
].filter((k): k is string => typeof k === "string" && k.startsWith("AIza"));
const DEEPSEEK_KEY = E.VITE_DEEPSEEK_API_KEY as string | undefined;
const OPENAI_KEY = E.VITE_OPENAI_API_KEY as string | undefined;

// ─── UTILS ───────────────────────────────────────────────────────────────────
const isQuotaError = (err: any): boolean =>
  err?.status === 429 ||
  String(err?.message).includes("429") ||
  String(err?.message).includes("quota") ||
  String(err?.message).includes("rate_limit");

// ─── GEMINI CALLER ───────────────────────────────────────────────────────────
async function callGeminiText(model: string, prompt: string): Promise<string> {
  let lastErr: any;
  for (const key of GEMINI_KEYS) {
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
      if (isQuotaError(err)) {
        console.warn("[AI] Gemini key hết quota → thử key tiếp");
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
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

// ─── AI TEXT: Gemini (free) → DeepSeek → OpenAI (trả phí) ───────────────────
async function callAIText(model: string, prompt: string): Promise<string> {
  // 1. Gemini (free keys)
  if (GEMINI_KEYS.length > 0) {
    try {
      return await callGeminiText(model, prompt);
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn("[AI] Gemini hết quota → DeepSeek");
      } else throw err;
    }
  }
  // 2. DeepSeek
  if (DEEPSEEK_KEY) {
    try {
      return await callOpenAICompat(
        "https://api.deepseek.com/chat/completions",
        DEEPSEEK_KEY,
        "deepseek-v4-flash",
        [{ role: "user", content: prompt }]
      );
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn("[AI] DeepSeek hết quota → OpenAI");
      } else throw err;
    }
  }
  // 3. OpenAI (trả phí)
  if (OPENAI_KEY) {
    return await callOpenAICompat(
      "https://api.openai.com/v1/chat/completions",
      OPENAI_KEY,
      "gpt-4o-mini",
      [{ role: "user", content: prompt }]
    );
  }
  throw new Error(
    "Tất cả API đều hết quota hoặc chưa cấu hình trên Vercel."
  );
}

// ─── GỢI Ý TIÊU ĐỀ NHANH ─────────────────────────────────────────────────────
export async function suggestScripts(
  contentSnippet: string
): Promise<string[]> {
  if (!contentSnippet || contentSnippet.trim().split(/\s+/).length < 4)
    return [];

  const prompt = `Dựa trên nội dung sau, đề xuất 3 tiêu đề viral ngắn gọn cho video TikTok/Reels xây dựng thương hiệu cá nhân.
Yêu cầu: Mỗi tiêu đề tối đa 20 từ, tiếng Việt, kích thích tò mò.
Nội dung: "${contentSnippet}"
Trả về JSON: {"suggestions": ["tiêu đề 1", "tiêu đề 2", "tiêu đề 3"]}`;

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

// ─── ĐOẠN MẶC ĐỊNH GIỮ NGUYÊN NHÂN VẬT & BỐI CẢNH (IDENTITY LOCK) ─────────
const IDENTITY_LOCK_PREFIX =
  "Based on the reference image. Same person, same identity, same face, same hairstyle, same outfit, same background, same environment. Maintain 100% character consistency and scene consistency. No morphing, no identity change, no outfit change, no background change.";

// ─── KỸ THUẬT VIDEO THEO MODEL ───────────────────────────────────────────────
const VIDEO_TECHNIQUE: Record<string, string> = {
  "Veo 3":
    "Static camera, locked shot, no zoom, no pan unless specified. Natural lip sync with speech, subtle facial micro-expressions, natural eye blinking every 3-4 seconds, gentle realistic head movements. Cinematic shallow depth of field, film grain. No text overlay, no watermark, no scene transition within single clip. Photorealistic rendering.",
  Gork:
    "Static camera, locked shot, no zoom, no pan unless specified. The person is speaking naturally to camera, natural lip sync, realistic mouth movements matching speech rhythm, subtle head tilts, natural eye blinking, relaxed authentic facial expressions, gentle hand gestures when emphasizing points. No text overlay, no watermark, no scene transition within single clip. Photorealistic, consistent natural lighting throughout.",
};

// ─── SINH KỊCH BẢN CHÍNH ─────────────────────────────────────────────────────
export async function generateContent(
  state: AppState
): Promise<GeneratedResult> {
  const modelTimeLimit = state.videoModel === "Veo 3" ? 8 : 10;
  const hasRefImage =
    state.selectedImageIndex !== null &&
    state.images[state.selectedImageIndex] !== undefined;

  // ── Giọng nói — phân tích kỹ ──
  const voiceProfile: Record<string, { guidance: string; wps: number; style: string }> = {
    Bắc: {
      guidance: "Giọng Bắc: rõ ràng, chuẩn mực, nhịp nhanh, năng động, dứt khoát",
      wps: 4,
      style: "Câu ngắn, dứt khoát, tiết tấu nhanh. Dùng từ ngữ miền Bắc tự nhiên. Ví dụ: 'ấy', 'nhỉ', 'cơ', 'đấy', 'thế nào'. Không dùng từ miền Nam.",
    },
    Nam: {
      guidance: "Giọng Nam: ấm áp, gần gũi, nhẹ nhàng, chậm rãi, thân thiện",
      wps: 3,
      style: "Câu dài hơn, nhẹ nhàng, thân thiện. Dùng từ ngữ miền Nam tự nhiên. Ví dụ: 'nha', 'hen', 'nghen', 'á', 'nè', 'đó', 'vậy đó'. Không dùng từ miền Bắc.",
    },
    Trung: {
      guidance: "Giọng Trung: truyền cảm, đặc sắc, nhấn nhá rõ ràng",
      wps: 3.5,
      style: "Câu có nhấn nhá, truyền cảm. Dùng từ ngữ miền Trung tự nhiên. Ví dụ: 'ni', 'nớ', 'rứa', 'mô', 'chi', 'răng'. Giữ sự chân thành, mộc mạc.",
    },
  };

  const voice = voiceProfile[state.voice] || voiceProfile["Bắc"];
  const minWords = Math.round(modelTimeLimit * voice.wps * 0.75);
  const maxWords = Math.round(modelTimeLimit * voice.wps * 0.95);
  const technique = VIDEO_TECHNIQUE[state.videoModel] || VIDEO_TECHNIQUE["Gork"];

  // ── Prompt chính ──
  const prompt = `Bạn là chuyên gia viết kịch bản video ngắn viral cho TikTok/Reels/Shorts, chuyên xây dựng thương hiệu cá nhân.

=== NHIỆM VỤ ===
Phân tích KỸ tất cả dữ liệu đầu vào, sau đó sinh kịch bản video chất lượng cao nhất.

=== DỮ LIỆU ĐẦU VÀO ===
📝 Nội dung chính: "${state.content}"
🎛️ Điều khiển AI: "${state.notes || "Không có — tự do sáng tạo phù hợp nội dung"}"
🎬 Số cảnh: ${state.sceneCount}
🎙️ Giọng: ${state.voice} → ${voice.guidance}
📹 Model: ${state.videoModel} — ${modelTimeLimit}s/cảnh
🖼️ Ảnh tham chiếu: ${hasRefImage ? "CÓ (người dùng đính kèm ảnh khi tạo video trên ${state.videoModel})" : "KHÔNG CÓ"}
=========================

=== BƯỚC 1: PHÂN TÍCH (thực hiện trong đầu trước khi viết) ===
A. NỘI DUNG: Thông điệp cốt lõi? Ai là đối tượng xem? Cảm xúc muốn truyền tải?
B. ĐIỀU KHIỂN AI: Có yêu cầu đặc biệt về style/cảm xúc/hành động không? → Nếu CÓ: tuân thủ tuyệt đối. Nếu KHÔNG: sáng tạo phù hợp nội dung.
C. GIỌNG NÓI (QUAN TRỌNG NHẤT cho voiceScript):
   ${voice.style}
   Tốc độ: ~${voice.wps} từ/giây → ${modelTimeLimit}s = ${minWords}-${maxWords} từ/cảnh
D. PHÂN CẢNH: Chia ${state.sceneCount} cảnh logic: Hook → Phát triển → Kết
E. MODEL VIDEO: ${state.videoModel === "Veo 3" ? "Veo 3 (8s): lip-sync tốt, ưu tiên close-up biểu cảm khuôn mặt" : "Grok (10s): video dài hơn, ưu tiên hành động tự nhiên + biểu cảm rõ ràng"}
===============================================================

=== BƯỚC 2: QUY TẮC VIDEO PROMPT (tiếng Anh) ===
${hasRefImage ? `🔒 CÓ ẢNH THAM CHIẾU — IDENTITY LOCK:
Mỗi videoPrompt BẮT BUỘC mở đầu bằng đoạn sau (COPY NGUYÊN VĂN, không sửa đổi):
"${IDENTITY_LOCK_PREFIX}"

Sau đoạn identity lock, MỚI mô tả hành động cụ thể cho cảnh đó.
→ Người dùng sẽ đính kèm ảnh tham chiếu khi paste prompt vào ${state.videoModel}, nên KHÔNG cần mô tả ngoại hình nhân vật.
→ Chỉ mô tả: HÀNH ĐỘNG + BIỂU CẢM + GÓC MÁY + ÁNH SÁNG` : `❌ KHÔNG CÓ ẢNH THAM CHIẾU:
Không mô tả nhân vật cụ thể. Mô tả chung: hành động, bối cảnh, ánh sáng, góc máy.`}

Kỹ thuật bắt buộc (${state.videoModel}):
${technique}

Chi tiết hóa:
- Hành động CỤ THỂ: "slightly leans forward, makes eye contact, nods gently while speaking" ✓ | "talks to camera" ✗
- Ánh sáng CỤ THỂ: "soft warm golden-hour light from the left, gentle fill light" ✓ | "good lighting" ✗  
- Góc máy CỤ THỂ: "medium close-up, eye-level, shallow depth of field, bokeh background" ✓ | "normal shot" ✗
- Cảnh 1 nên là close-up/medium close-up để HOOK người xem
- Nếu nhiều cảnh: biến tấu nhẹ góc máy (close-up → medium → close-up) nhưng KHÔNG đổi bối cảnh/trang phục
====================================================

=== BƯỚC 3: QUY TẮC VOICESCRIPT (tiếng Việt) ===
1. ${voice.guidance}
2. ${voice.style}
3. GIỐNG NGƯỜI THẬT đang nói chuyện trước camera — KHÔNG giọng MC, KHÔNG giọng đọc sách, KHÔNG giọng robot
4. Số từ: ${minWords}-${maxWords} từ/cảnh. ĐẾM TỪNG TỪ trước khi output.
5. Cảnh 1 = HOOK: mở đầu gây tò mò, câu đầu tiên phải giữ chân người xem
6. Cảnh cuối = KẾT: CTA hoặc kết luận mạnh, để lại ấn tượng
7. Các cảnh giữa: phát triển nội dung logic, mỗi cảnh 1 ý chính duy nhất
8. Nếu điều khiển AI yêu cầu → áp dụng vào giọng văn và phong cách nói
=====================================================

=== BƯỚC 4: HOOK & HASHTAG ===
- Hook: 1 câu tiếng Việt ≤15 từ, gây tò mò ngay lập tức, phù hợp 3s đầu
- Hashtag: 5 cái, mix trending + niche, bắt đầu bằng #
===============================

=== BƯỚC 5: THUMBNAIL ===
- 3 biến thể tiêu đề thumbnail tiếng Việt
- Tối đa 50 ký tự (ngắn = đọc nhanh trên mobile)
- Gây tò mò, có con số hoặc từ kích thích nếu phù hợp
==========================

OUTPUT — CHỈ JSON, KHÔNG TEXT KHÁC:
{
  "hook": "câu hook tiếng Việt ≤15 từ",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "scenes": [
    {
      "videoPrompt": "${hasRefImage ? IDENTITY_LOCK_PREFIX + " " : ""}[chi tiết hành động, biểu cảm, góc máy, ánh sáng cho cảnh này]",
      "voiceScript": "Lời thoại tiếng Việt ${minWords}-${maxWords} từ, giọng ${state.voice}"
    }
  ],
  "thumbnailTexts": ["Tiêu đề 1", "Tiêu đề 2", "Tiêu đề 3"]
}

⚠️ KIỂM TRA CUỐI:
□ Đúng ${state.sceneCount} scenes?
□ Mỗi videoPrompt ${hasRefImage ? 'bắt đầu bằng "Based on the reference image..."?' : 'không mô tả nhân vật cụ thể?'}
□ Mỗi voiceScript có ${minWords}-${maxWords} từ?
□ voiceScript đúng giọng ${state.voice} với từ ngữ đặc trưng vùng miền?
□ Không có text/watermark trong videoPrompt?
□ Chỉ JSON, không text thừa?`;

  // ── Gọi AI ──
  console.log(
    `[AI] Generating: ${state.sceneCount} scenes, ${state.videoModel}, voice=${state.voice}, hasRef=${hasRefImage}`
  );
  const text = await callAIText("gemini-2.5-flash", prompt);
  if (!text) throw new Error("AI không trả về kết quả. Vui lòng thử lại.");

  const data = JSON.parse(text);

  // ── Safety: đảm bảo identity lock luôn có nếu có ảnh tham chiếu ──
  if (hasRefImage && Array.isArray(data.scenes)) {
    data.scenes = data.scenes.map((scene: any) => {
      const vp = (scene.videoPrompt || "").trim();
      if (!vp.startsWith("Based on the reference image")) {
        scene.videoPrompt = `${IDENTITY_LOCK_PREFIX} ${vp}`;
      }
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
