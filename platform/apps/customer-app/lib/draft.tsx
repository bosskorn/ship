import type { LatLng, ParcelInput, QuoteOption, VehicleType } from '@ship/shared';
import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export interface DraftStop {
  location: LatLng | null;
  address: string;
  building?: string;
  floor?: string;
  room?: string;
  contactName: string;
  contactPhone: string;
  note?: string;
  locked?: boolean;
}

export type ServiceKind = 'INSTANT' | 'MULTI_STOP' | 'SCHEDULED' | 'BUSINESS';

export interface Draft {
  service: ServiceKind;
  pickup: DraftStop;
  dropoffs: DraftStop[];
  parcel: ParcelInput;
  scheduledAt: string | null;
  optimizeRoute: boolean;
  options: QuoteOption[];
  zoneName: string | null;
  vehicleType: VehicleType | null;
  promoCode: string;
}

export const emptyStop = (): DraftStop => ({ location: null, address: '', contactName: '', contactPhone: '' });

const initial = (service: ServiceKind = 'INSTANT'): Draft => ({
  service,
  pickup: emptyStop(),
  dropoffs: [emptyStop()],
  parcel: { category: 'SMALL_BOX', weightKg: 1, quantity: 1, fragile: false, temperatureSensitive: false, highValue: false },
  scheduledAt: null,
  optimizeRoute: service === 'MULTI_STOP',
  options: [],
  zoneName: null,
  vehicleType: null,
  promoCode: '',
});

interface DraftCtx {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  setStop: (target: string, stop: DraftStop) => void;
  getStop: (target: string) => DraftStop;
  reset: (service?: ServiceKind, pickup?: Partial<DraftStop>) => void;
}

const Ctx = createContext<DraftCtx | null>(null);

/** Order-in-progress state for the create flow: Pickup → Destination → Parcel → Vehicle → Quote → Payment → Confirm. */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(initial());
  const value = useMemo<DraftCtx>(
    () => ({
      draft,
      update: (patch) => setDraft((d) => ({ ...d, ...patch, ...(patch.pickup || patch.dropoffs || patch.parcel || patch.scheduledAt !== undefined ? { options: [] } : {}) })),
      setStop: (target, stop) =>
        setDraft((d) => {
          if (target === 'pickup') return { ...d, pickup: stop, options: [] };
          const i = Number(target.replace('drop-', ''));
          const dropoffs = d.dropoffs.slice();
          dropoffs[i] = stop;
          return { ...d, dropoffs, options: [] };
        }),
      getStop: (target) => (target === 'pickup' ? draft.pickup : draft.dropoffs[Number(target.replace('drop-', ''))] ?? emptyStop()),
      reset: (service, pickup) => setDraft({ ...initial(service), pickup: { ...emptyStop(), ...pickup } }),
    }),
    [draft],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDraft() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDraft outside DraftProvider');
  return c;
}

export const stopReady = (s: DraftStop) => !!(s.location && s.address.trim() && s.contactName.trim() && /^(\+66|0)\d{8,9}$/.test(s.contactPhone.trim()));

/** Map the draft to the API quote request. Prices always come back from the server. */
export function quoteRequest(d: Draft, vehicleType?: VehicleType, promoCode?: string) {
  const s = (x: DraftStop) => ({
    location: x.location!,
    address: x.address.trim(),
    building: x.building || undefined,
    floor: x.floor || undefined,
    room: x.room || undefined,
    contactName: x.contactName.trim(),
    contactPhone: x.contactPhone.trim(),
    note: x.note || undefined,
    locked: x.locked || undefined,
  });
  return {
    pickup: s(d.pickup),
    dropoffs: d.dropoffs.map(s),
    parcel: d.parcel,
    vehicleType,
    scheduledAt: d.scheduledAt ?? undefined,
    optimizeRoute: d.dropoffs.length > 1 ? d.optimizeRoute : undefined,
    promoCode: promoCode || undefined,
  };
}
