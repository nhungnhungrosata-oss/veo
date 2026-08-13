import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
storage.setItem("ibeegen_device_key_veo", "IBEGEN-OLD1-OLD2-OLD3");
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });

const license = await import("../src/ibeegen-license");

test("giữ nguyên mã cũ khi nâng cấp cơ chế license", () => {
  assert.equal(license.getLicenseKey(), "IBEGEN-OLD1-OLD2-OLD3");
  assert.equal(storage.getItem("ibeegen_license_key_v2_veo"), "IBEGEN-OLD1-OLD2-OLD3");
});

test("installation_id ổn định và không phụ thuộc user-agent", () => {
  const first = license.getInstallationId();
  const second = license.getInstallationId();
  assert.equal(first, second);
  assert.match(first, /^WEB-/);
});

test("dùng thử 3 ngày lấy mốc thời gian từ server", async () => {
  license.setLicenseKey("IBEGEN-TRIAL-0001-0002");
  const startedAt = Date.now();
  const expiresAt = startedAt + 3 * 24 * 60 * 60 * 1000;

  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    status: "TRIAL",
    trial_active: true,
    installations_used: 1,
    max_installations: 3,
    data: {
      status: "TRIAL",
      plan: "trial",
      trial_started_at: new Date(startedAt).toISOString(),
      trial_expires_at: new Date(expiresAt).toISOString(),
      installations_used: 1,
      max_installations: 3,
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const result = await license.checkLicense();
  assert.equal(result.licensed, false);
  assert.equal(result.trial_active, true);
  assert.equal(result.trial?.source, "server");
  assert.equal(result.trial?.remaining_days, 3);
  assert.equal(result.installations_used, 1);
  assert.equal(result.max_installations, 3);
});

test("TRIAL_EXPIRED khóa ứng dụng và không tự cấp lại dùng thử local", async () => {
  license.setLicenseKey("IBEGEN-EXPIRED-0001-0002");
  const expiredAt = Date.now() - 1_000;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    status: "TRIAL_EXPIRED",
    data: {
      status: "TRIAL_EXPIRED",
      plan: "trial",
      trial_started_at: new Date(expiredAt - 3 * 24 * 60 * 60 * 1000).toISOString(),
      trial_expires_at: new Date(expiredAt).toISOString(),
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const result = await license.checkLicense();
  assert.equal(result.licensed, false);
  assert.equal(result.status, "TRIAL_EXPIRED");
  assert.equal(result.trial_active, false);
  assert.equal(result.trial?.active, false);
  assert.equal(result.trial?.source, "server");
});

test("ACTIVE được dùng làm dự phòng 48 giờ khi server mất kết nối", async () => {
  license.setLicenseKey("IBEGEN-PAID-0001-0002");
  let sentPayload: Record<string, string> = {};
  globalThis.fetch = async (_input, init) => {
    sentPayload = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({
      ok: true,
      status: "ACTIVE",
      installations_used: 1,
      max_installations: 3,
      data: { status: "ACTIVE", plan: "forever", installations_used: 1, max_installations: 3 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const active = await license.checkLicense();
  assert.equal(active.licensed, true);
  assert.equal(active.status, "ACTIVE");
  assert.equal(sentPayload.app_id, "veo");
  assert.match(sentPayload.installation_id, /^WEB-/);
  assert.match(sentPayload.device_id, /^[A-F0-9]{8}$/);
  assert.notEqual(sentPayload.installation_id, sentPayload.device_id);

  globalThis.fetch = async () => { throw new Error("network down"); };
  const grace = await license.checkLicense();
  assert.equal(grace.licensed, true);
  assert.equal(grace.status, "GRACE");
  assert.ok(grace.grace_expires_at && grace.grace_expires_at > Date.now());
});

test("DEVICE_LIMIT luôn khóa dù dữ liệu cũ ghi ACTIVE", async () => {
  license.setLicenseKey("IBEGEN-LIMIT-0001-0002");
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    status: "DEVICE_LIMIT",
    device_locked: true,
    installations_used: 3,
    max_installations: 3,
    data: { status: "ACTIVE", installations_used: 3, max_installations: 3 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const result = await license.checkLicense();
  assert.equal(result.licensed, false);
  assert.equal(result.status, "DEVICE_LIMIT");
  assert.equal(result.device_locked, true);
});
