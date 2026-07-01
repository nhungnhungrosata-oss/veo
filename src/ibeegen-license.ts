const DEFAULT_LICENSE_SERVER = "https://kichhoat.vinatool.online";

export function makeDeviceKey(): string {
  const part = () => Math.random().toString(16).slice(2, 6).toUpperCase();
  return `IBEGEN-${part()}-${part()}-${part()}`;
}
