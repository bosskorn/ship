import { useCallback, useEffect, useRef, useState } from 'react';
import { MessagePlugin } from 'tdesign-react';

/** Load data, expose reload, surface errors as toasts. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    try {
      setData(await fnRef.current());
    } catch (e) {
      MessagePlugin.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload();
    if (!intervalMs) return;
    const t = setInterval(() => void reload(), intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, reload, setData };
}

export async function run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (success) MessagePlugin.success(success);
    return r;
  } catch (e) {
    MessagePlugin.error((e as Error).message);
    return undefined;
  }
}
