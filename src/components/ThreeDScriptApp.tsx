import React, { useEffect, useState } from 'react';
import localforage from 'localforage';
import { toast } from 'sonner';
import { Bot, Check, Copy, Loader2, Play, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import {
  generate3DContent,
  THREE_D_STORAGE_KEY,
  ThreeDAudienceType,
  ThreeDContentStyle,
  ThreeDGeneratedResult,
  ThreeDSceneCount,
  ThreeDState,
  ThreeDVideoModelType,
  ThreeDVoiceType,
} from '../services/ai3d';

const STYLE_OPTIONS: ThreeDContentStyle[] = ['Vui vẻ', 'Giáo dục', 'Truyền cảm hứng', 'Hài hước', 'Gần gũi', 'Kể chuyện', 'Chuyên nghiệp', 'Dễ hiểu'];
const AUDIENCE_OPTIONS: ThreeDAudienceType[] = ['Trẻ em', 'Người trưởng thành', 'Gia đình', 'Người quan tâm sức khỏe', 'Tùy chỉnh'];

const INITIAL_3D_STATE: ThreeDState = {
  topic: '',
  sceneCount: 3,
  style: 'Giáo dục',
  audience: 'Gia đình',
  customAudience: '',
  voice: 'Bắc',
  aspectRatio: '9:16',
  requirements: '',
  videoModel: 'Veo 3',
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none', className)} {...props}>{children}</button>;
}

function FieldTitle({ number, title, description }: { number: number; title: string; description?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-blue text-xs font-black text-white">{number}</span>
        <h2 className="font-bold text-brand-text-title">{title}</h2>
      </div>
      {description && <p className="mt-1 pl-9 text-xs text-brand-text-muted">{description}</p>}
    </div>
  );
}

async function get3DHistory(): Promise<ThreeDGeneratedResult[]> {
  const data = await localforage.getItem<ThreeDGeneratedResult[]>(THREE_D_STORAGE_KEY);
  const list = Array.isArray(data) ? data : [];
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return list.filter((item) => item.timestamp > dayAgo).slice(0, 10);
}

async function save3DResult(result: ThreeDGeneratedResult): Promise<void> {
  const old = await get3DHistory();
  await localforage.setItem(THREE_D_STORAGE_KEY, [result, ...old].slice(0, 10));
}

export default function ThreeDScriptApp() {
  const [state, setState] = useState<ThreeDState>(INITIAL_3D_STATE);
  const [history, setHistory] = useState<ThreeDGeneratedResult[]>([]);
  const [currentResult, setCurrentResult] = useState<ThreeDGeneratedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  const resetApp = () => {
    setState(INITIAL_3D_STATE);
    setCurrentResult(null);
    setCopiedKey('');
  };

  useEffect(() => {
    void (async () => {
      const hist = await get3DHistory();
      setHistory(hist);
      if (hist[0]) setCurrentResult(hist[0]);
    })();
  }, []);

  useEffect(() => {
    const handleReset = () => resetApp();
    window.addEventListener('three-d-script-reset', handleReset);
    return () => window.removeEventListener('three-d-script-reset', handleReset);
  }, []);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success('Đã sao chép');
      window.setTimeout(() => setCopiedKey(''), 1500);
    } catch {
      toast.error('Không thể sao chép. Vui lòng thử lại.');
    }
  };

  const handleGenerate = async () => {
    if (!state.topic.trim()) return toast.error('Vui lòng nhập chủ đề video');
    if (state.audience === 'Tùy chỉnh' && !state.customAudience.trim()) return toast.error('Vui lòng nhập đối tượng xem tùy chỉnh');
    setLoading(true);
    try {
      const result = await generate3DContent({ ...state, topic: state.topic.trim() });
      await save3DResult(result);
      const hist = await get3DHistory();
      setHistory(hist);
      setCurrentResult(result);
      toast.success('Đã tạo kịch bản hoạt hình 3D');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Không thể tạo kịch bản. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto grid max-w-7xl grid-cols-1 gap-7 px-4 py-6 lg:grid-cols-12">
      <section className="space-y-5 lg:col-span-5">
        <div className="card bg-gradient-to-br from-white to-brand-bg-sub">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-yellow-light"><Bot className="h-6 w-6 text-brand-text-title" /></div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-brand-text-title">Tạo Video Hoạt Hình 3D</h2>
                <p className="mt-1 text-xs leading-5 text-brand-text-muted">Chủ đề bất kỳ → nhân vật 3D → câu chuyện liền mạch.</p>
              </div>
            </div>
            <Button onClick={resetApp} className="shrink-0 border border-brand-blue bg-white px-3 py-2 text-xs text-brand-blue hover:bg-brand-blue hover:text-white"><RefreshCw className="h-4 w-4" />Tạo mới</Button>
          </div>
        </div>

        <div className="card">
          <FieldTitle number={1} title="Chủ đề video" description="AI tự xác định nhân vật hoạt hình 3D phù hợp nhất." />
          <textarea className="input min-h-[140px]" placeholder="Ví dụ: Tác dụng của củ tỏi, lợi ích của quả chanh, hành trình của giọt nước..." value={state.topic} onChange={(event) => setState((old) => ({ ...old, topic: event.target.value.slice(0, 2000) }))} />
          <div className="mt-2 text-right text-xs text-brand-text-muted">{state.topic.length}/2000 ký tự</div>
        </div>

        <div className="card">
          <FieldTitle number={2} title="Số cảnh" description="Mỗi cảnh dài khoảng 8 giây." />
          <div className="grid grid-cols-3 gap-2">{([3, 4, 5] as ThreeDSceneCount[]).map((count) => <button key={count} type="button" onClick={() => setState((old) => ({ ...old, sceneCount: count }))} className={cx('rounded-xl border px-3 py-3 font-black', state.sceneCount === count ? 'border-brand-blue bg-brand-blue text-white' : 'border-brand-border bg-white hover:border-brand-blue')}>{count} cảnh</button>)}</div>
        </div>

        <div className="card">
          <FieldTitle number={3} title="Phong cách nội dung" />
          <div className="grid grid-cols-2 gap-2">{STYLE_OPTIONS.map((style) => <button key={style} type="button" onClick={() => setState((old) => ({ ...old, style }))} className={cx('min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-bold', state.style === style ? 'border-brand-blue bg-brand-blue text-white' : 'border-brand-border bg-white hover:border-brand-blue')}>{style}</button>)}</div>
        </div>

        <div className="card">
          <FieldTitle number={4} title="Đối tượng xem" />
          <select className="input h-12" value={state.audience} onChange={(event) => setState((old) => ({ ...old, audience: event.target.value as ThreeDAudienceType }))}>{AUDIENCE_OPTIONS.map((audience) => <option key={audience}>{audience}</option>)}</select>
          {state.audience === 'Tùy chỉnh' && <input className="input mt-3 h-12" placeholder="Nhập đối tượng xem mong muốn..." value={state.customAudience} onChange={(event) => setState((old) => ({ ...old, customAudience: event.target.value }))} />}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card"><h3 className="mb-2 font-bold text-brand-text-title">Giọng đọc</h3><select className="input h-12" value={state.voice} onChange={(event) => setState((old) => ({ ...old, voice: event.target.value as ThreeDVoiceType }))}><option>Bắc</option><option>Trung</option><option>Nam</option></select></div>
          <div className="card"><h3 className="mb-2 font-bold text-brand-text-title">Tỉ lệ video</h3><select className="input h-12" value={state.aspectRatio} disabled><option>9:16</option></select></div>
        </div>

        <div className="card">
          <FieldTitle number={5} title="Yêu cầu bổ sung" description="Tùy chỉnh bối cảnh, màu sắc, cảm xúc hoặc thông điệp." />
          <textarea className="input min-h-[100px]" placeholder="Ví dụ: Bối cảnh khu vườn, màu sắc tươi sáng, cảm xúc vui vẻ..." value={state.requirements} onChange={(event) => setState((old) => ({ ...old, requirements: event.target.value }))} />
        </div>

        <div className="card"><h3 className="mb-3 font-bold text-brand-text-title">Model video gốc</h3><div className="grid grid-cols-2 gap-2">{(['Veo 3', 'Gork'] as ThreeDVideoModelType[]).map((model) => <button key={model} type="button" onClick={() => setState((old) => ({ ...old, videoModel: model }))} className={cx('rounded-xl border p-3 font-bold', state.videoModel === model ? 'border-brand-blue bg-brand-blue text-white' : 'border-brand-border bg-white')}>{model}<span className="block text-xs font-medium">Video {model === 'Veo 3' ? 8 : 10} giây</span></button>)}</div></div>

        <Button onClick={handleGenerate} disabled={loading} className="h-14 w-full bg-brand-yellow text-base text-brand-text-title shadow-lg hover:bg-brand-yellow-light">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}{loading ? 'AI đang xây dựng câu chuyện...' : 'Tạo kịch bản hoạt hình 3D'}</Button>
      </section>

      <section className="space-y-5 lg:col-span-7">
        {!currentResult ? (
          <div className="grid min-h-[440px] place-items-center rounded-2xl border border-dashed border-brand-border bg-white p-7 text-center"><div className="max-w-md"><div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-brand-blue-light"><Sparkles className="h-10 w-10 text-brand-blue-dark" /></div><h2 className="mb-2 text-xl font-black text-brand-text-title">Câu chuyện 3D bắt đầu từ một chủ đề</h2><p className="text-sm leading-6 text-brand-text-muted">AI sẽ tạo nhân vật trung tâm, nhận diện cố định, prompt video và lời thoại liền mạch cho từng cảnh.</p></div></div>
        ) : (
          <>
            <div className="card"><div className="mb-3 flex items-start justify-between gap-3"><div><div className="mb-1 text-xs font-black uppercase tracking-wider text-brand-blue">Nhân vật trung tâm</div><h2 className="text-xl font-black text-brand-text-title">{currentResult.character.name}</h2></div><div className="rounded-full bg-brand-yellow-light px-3 py-1 text-xs font-bold text-[#92400E]">{currentResult.inputs.sceneCount} cảnh · {currentResult.inputs.aspectRatio}</div></div><p className="mb-4 text-sm leading-6">{currentResult.character.description}</p><div className="rounded-xl border border-brand-border bg-brand-bg-sub p-4"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-black uppercase text-brand-text-title">Nhận diện cố định</span><Button onClick={() => copyToClipboard(currentResult.character.fixedIdentity, 'character')} className="h-9 border border-brand-blue bg-white px-3 text-xs text-brand-blue">{copiedKey === 'character' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copy</Button></div><p className="max-h-32 overflow-y-auto pr-2 font-mono text-xs leading-5 text-brand-text-muted">{currentResult.character.fixedIdentity}</p></div></div>

            <div className="card"><div className="mb-3 flex items-center gap-2"><Play className="h-5 w-5 text-brand-blue" /><h3 className="text-lg font-black text-brand-text-title">Kịch bản chi tiết ({currentResult.scenes.length} cảnh)</h3></div><p className="mb-4 rounded-xl bg-brand-bg-sub p-3 text-sm leading-6 text-brand-text-muted">{currentResult.summary}</p><div className="space-y-4">{currentResult.scenes.map((scene, index) => { const promptKey = 'prompt-' + index; const voiceKey = 'voice-' + index; const fullKey = 'full-' + index; const fullText = ['Tiêu đề cảnh: ' + scene.title, '', 'Bối cảnh: ' + scene.background, 'Hành động: ' + scene.action, 'Biểu cảm: ' + scene.expression, 'Góc máy: ' + scene.camera, '', 'Prompt Video:', scene.videoPrompt, '', 'Lời thoại:', scene.voiceScript].join('\n'); return <div key={index} className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-brand-border bg-brand-bg-sub p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-1 text-xs font-black uppercase text-brand-blue">Scene {index + 1}</div><h4 className="font-black text-brand-text-title">{scene.title}</h4></div><Button onClick={() => copyToClipboard(fullText, fullKey)} className="bg-brand-yellow px-4 py-2 text-xs text-brand-text-title hover:bg-brand-yellow-light">{copiedKey === fullKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copy tất cả</Button></div><div className="grid grid-cols-1 gap-3 border-b border-brand-border p-4 text-sm sm:grid-cols-2"><div><b>Bối cảnh:</b> {scene.background}</div><div><b>Hành động:</b> {scene.action}</div><div><b>Biểu cảm:</b> {scene.expression}</div><div><b>Góc máy:</b> {scene.camera}</div></div><div className="space-y-4 p-4"><div className="rounded-xl border border-brand-border bg-[#08111f] p-3 text-white"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-black uppercase text-brand-blue-light">Prompt video 3D tiếng Anh</span><Button onClick={() => copyToClipboard(scene.videoPrompt, promptKey)} className="h-9 bg-white/10 px-3 text-xs text-white hover:bg-white/20">{copiedKey === promptKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copy</Button></div><p className="max-h-48 overflow-y-auto pr-2 font-mono text-xs leading-5 text-white/85">{scene.videoPrompt}</p></div><div className="rounded-xl border-l-4 border-brand-yellow bg-brand-yellow-light/45 p-4"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-black uppercase text-brand-text-title">Lời thoại tiếng Việt</span><Button onClick={() => copyToClipboard(scene.voiceScript, voiceKey)} className="h-9 border border-brand-blue bg-white px-3 text-xs text-brand-blue">{copiedKey === voiceKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copy</Button></div><p className="text-sm font-medium leading-6 text-brand-text-body">“{scene.voiceScript}”</p></div></div></div>; })}</div></div>
          </>
        )}

        {history.length > 0 && <div className="card"><h3 className="mb-3 font-bold text-brand-text-title">Lịch sử 3D gần đây</h3><div className="space-y-2">{history.slice(0, 5).map((item) => <button key={item.id} className="w-full rounded-xl border border-brand-border p-3 text-left hover:border-brand-blue" onClick={() => setCurrentResult(item)}><span className="block font-bold text-brand-text-title line-clamp-1">{item.summary}</span><span className="mt-1 block text-xs text-brand-text-muted">{new Date(item.timestamp).toLocaleString('vi-VN')} · {item.scenes.length} cảnh</span></button>)}</div></div>}
      </section>
    </main>
  );
}
