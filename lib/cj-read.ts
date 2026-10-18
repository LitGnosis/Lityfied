// Only use for idempotent supplier reads (and token acquisition), never order writes.
let tail: Promise<unknown> = Promise.resolve();
let nextStart = 0;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function cjRead(url: string | URL, init?: RequestInit): Promise<any> {
  const run = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await wait(Math.max(0, nextStart - Date.now()));
      nextStart = Date.now() + 1100;
      const response = await fetch(url, init);
      const body = await response.json();
      const limited = response.status === 429 || /QPS limit|Too Many Requests/i.test(String(body?.message || ''));
      if (limited && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await wait(Math.min(5000, Math.max(1100 * (attempt + 1), Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)));
        continue;
      }
      if (!response.ok || body?.result === false) throw new Error(body?.message || 'Supplier temporarily unavailable');
      return body;
    }
  };
  const pending = tail.then(run, run);
  tail = pending.catch(() => {});
  return pending;
}
