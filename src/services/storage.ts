import localforage from "localforage";
import { GeneratedResult, STORAGE_KEY } from "../types";

const ONE_DAY = 24 * 60 * 60 * 1000;

function normalizeHistory(data: unknown): GeneratedResult[] {
  if (!Array.isArray(data)) return [];
  const now = Date.now();
  return data
    .filter((item): item is GeneratedResult => {
      return !!item && typeof item === 'object' && typeof (item as any).timestamp === 'number';
    })
    .filter((item) => now - item.timestamp < ONE_DAY);
}

export async function saveResult(result: GeneratedResult): Promise<void> {
  try {
    const current = await getHistory();
    const validHistory = [result, ...current].slice(0, 20);
    await localforage.setItem(STORAGE_KEY, validHistory);
  } catch (err) {
    console.warn('[storage] Không lưu được lịch sử:', err);
  }
}

export async function getHistory(): Promise<GeneratedResult[]> {
  try {
    const data = await localforage.getItem<GeneratedResult[]>(STORAGE_KEY);
    const validHistory = normalizeHistory(data);
    if (Array.isArray(data) && validHistory.length !== data.length) {
      await localforage.setItem(STORAGE_KEY, validHistory);
    }
    return validHistory;
  } catch (err) {
    console.warn('[storage] Lịch sử bị lỗi, đang reset:', err);
    try {
      await localforage.removeItem(STORAGE_KEY);
    } catch {}
    return [];
  }
}
