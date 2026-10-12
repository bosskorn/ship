import { Session } from '@ship/mobile-ui';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from './api';

const Ctx = createContext<{ session: Session | null; ready: boolean }>({ session: null, ready: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void api.restore().then((s) => {
      setSession(s);
      setReady(true);
    });
    return api.onSession(setSession);
  }, []);
  return <Ctx.Provider value={{ session, ready }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
