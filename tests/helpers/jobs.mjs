import assert from "node:assert/strict";

// 트랜잭션 격리·롤백과 KV 크기 제한을 갖춘 테스트용 Durable Object 저장소.
export class JobStorage {
  data = new Map(); alarm = null; queue = Promise.resolve();
  transaction(fn) {
    const p = this.queue.then(async () => {
      const data = structuredClone(this.data); let alarm = this.alarm;
      const tx = {
        get: async k => structuredClone(data.get(k)),
        put: async (k, v) => { assert(Buffer.byteLength(JSON.stringify(v)) < 128 * 1024, "KV 값 크기 제한"); data.set(k, structuredClone(v)); },
        delete: async k => data.delete(k),
        getAlarm: async () => alarm, setAlarm: async at => { alarm = at; }, deleteAlarm: async () => { alarm = null; },
      };
      const result = await fn(tx); this.data = data; this.alarm = alarm; return result;
    });
    this.queue = p.catch(() => {}); return p;
  }
}

export async function jobRequest(obj, path = "", body) {
  const response = await obj.fetch(new Request("https://jobs.test/" + path, {
    method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: response.status, json: await response.json() };
}

export async function fireAlarm(obj) { obj.storage.alarm = null; await obj.alarm(); }
