import type { JobOfferPayload } from '@ship/shared';
import { WsEvent } from '@ship/shared';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { startTracking, stopTracking } from './location';
import { useSession } from './session';

interface DriverState {
  me: any | null;
  offer: JobOfferPayload | null;
  activeOrderId: string | null;
  reload: () => Promise<void>;
  dismissOffer: () => void;
  setOnline: (online: boolean, location?: { lat: number; lng: number }) => Promise<void>;
}

const Ctx = createContext<DriverState | null>(null);

/** Driver profile, presence, incoming offers and the active job, kept in sync over the socket. */
export function DriverProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [me, setMe] = useState<any>(null);
  const [offer, setOffer] = useState<JobOfferPayload | null>(null);
  const [activeOrderId, setActive] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!api.session) return;
    const [m, active, offers] = await Promise.all([
      api.get('/driver/me'),
      api.get('/driver/orders/active').catch(() => null),
      api.get<JobOfferPayload[]>('/driver/offers').catch(() => []),
    ]);
    setMe(m);
    setActive(active?.id ?? null);
    setOffer((cur) => cur ?? offers[0] ?? null);
    // keep GPS cadence aligned with server state
    if (m.presence === 'OFFLINE') await stopTracking();
    else await startTracking(active ? 'active' : 'idle').catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!session) {
      setMe(null);
      setOffer(null);
      setActive(null);
      return;
    }
    void reload();
    const s = api.realtime();
    const onOffer = (o: JobOfferPayload) => setOffer(o);
    const onRevoked = (r: { offerId: string }) => setOffer((cur) => (cur?.offerId === r.offerId ? null : cur));
    const onOrder = () => void reload();
    s.on(WsEvent.OFFER_NEW, onOffer);
    s.on(WsEvent.OFFER_REVOKED, onRevoked);
    s.on(WsEvent.ORDER_UPDATED, onOrder);
    s.on('connect', onOrder);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void reload());
    return () => {
      s.off(WsEvent.OFFER_NEW, onOffer);
      s.off(WsEvent.OFFER_REVOKED, onRevoked);
      s.off(WsEvent.ORDER_UPDATED, onOrder);
      s.off('connect', onOrder);
      sub.remove();
    };
  }, [session, reload]);

  const setOnline = useCallback(
    async (online: boolean, location?: { lat: number; lng: number }) => {
      await api.post('/driver/presence', { online, location });
      if (!online) await stopTracking();
      await reload();
    },
    [reload],
  );

  return (
    <Ctx.Provider value={{ me, offer, activeOrderId, reload, dismissOffer: () => setOffer(null), setOnline }}>{children}</Ctx.Provider>
  );
}

export function useDriver() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDriver outside DriverProvider');
  return c;
}
