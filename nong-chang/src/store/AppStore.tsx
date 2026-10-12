/**
 * Client state for the customer app.
 *
 * Until the backend is wired, a local simulator plays the technician /
 * dispatch side of the job lifecycle so every screen can be exercised end to
 * end. Replace `useJobSimulator` with a realtime subscription (WebSocket /
 * push) — reducers and screens do not need to change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import { serviceById, type Service } from '@/data/catalog';
import { TECHNICIANS, technicianById, type Technician } from '@/data/technicians';
import { DEFAULT_ADDRESS, type Address } from '@/data/user';
import { rankCandidates } from '@/domain/dispatch';
import { JobStatus, canTransition, isActive } from '@/domain/job';
import { calculatePrice, type Quote } from '@/domain/pricing';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';

export type PaymentMethod = 'promptpay' | 'credit' | 'debit';
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  promptpay: 'พร้อมเพย์',
  credit: 'บัตรเครดิต',
  debit: 'บัตรเดบิต',
};

export interface Schedule {
  mode: 'asap' | 'scheduled';
  /** ISO string when scheduled. */
  at?: string;
}

export interface BookingDraft {
  serviceId?: string;
  quantity: number;
  address: Address;
  schedule: Schedule;
  note?: string;
  photoUris: string[];
  paymentMethod: PaymentMethod;
  promoCode?: string;
}

export interface JobEvent {
  status: JobStatus;
  at: string;
}

export interface Job {
  id: string;
  serviceId: string;
  quantity: number;
  address: Address;
  schedule: Schedule;
  paymentMethod: PaymentMethod;
  status: JobStatus;
  events: JobEvent[];
  technicianId?: string;
  etaMinutes?: number;
  /** Technician position as a 0..1 fraction of the route to the customer. */
  routeProgress: number;
  pin: string;
  quote?: Quote;
  total: number;
  discount: number;
  beforePhotos: string[];
  afterPhotos: string[];
  rating?: number;
  createdAt: string;
  warrantyUntil?: string;
}

export interface AppNotification {
  id: string;
  group: 'job' | 'system' | 'promo';
  title: string;
  body: string;
  at: string;
  read: boolean;
  jobId?: string;
}

interface State {
  booting: boolean;
  draft: BookingDraft;
  jobs: Job[];
  notifications: AppNotification[];
  lastSyncedAt?: string;
}

const PROMO = { code: 'NEWHOME', label: 'ส่วนลดลูกค้าใหม่', amount: 50 };

const initialDraft: BookingDraft = {
  quantity: 1,
  address: DEFAULT_ADDRESS,
  schedule: { mode: 'asap' },
  photoUris: [],
  paymentMethod: 'promptpay',
  promoCode: PROMO.code,
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const seedJobs: Job[] = [
  {
    id: 'NC-240981',
    serviceId: 'aircon-wash',
    quantity: 2,
    address: DEFAULT_ADDRESS,
    schedule: { mode: 'scheduled', at: daysAgo(7) },
    paymentMethod: 'promptpay',
    status: 'reviewed',
    events: [],
    technicianId: 't-somchai',
    routeProgress: 1,
    pin: '0000',
    total: 1180,
    discount: 0,
    beforePhotos: [],
    afterPhotos: [],
    rating: 5,
    createdAt: daysAgo(7),
    warrantyUntil: daysAhead(23),
  },
  {
    id: 'NC-240377',
    serviceId: 'plumbing-faucet',
    quantity: 1,
    address: DEFAULT_ADDRESS,
    schedule: { mode: 'asap' },
    paymentMethod: 'credit',
    status: 'reviewed',
    events: [],
    technicianId: 't-wichai',
    routeProgress: 1,
    pin: '0000',
    total: 551,
    discount: 199,
    beforePhotos: [],
    afterPhotos: [],
    rating: 5,
    createdAt: daysAgo(40),
    warrantyUntil: daysAgo(10),
  },
  {
    id: 'NC-241102',
    serviceId: 'cleaning-3h',
    quantity: 1,
    address: DEFAULT_ADDRESS,
    schedule: { mode: 'scheduled', at: daysAhead(3) },
    paymentMethod: 'promptpay',
    status: 'created',
    events: [],
    technicianId: 't-malee',
    routeProgress: 0,
    pin: '4821',
    total: 640,
    discount: 0,
    beforePhotos: [],
    afterPhotos: [],
    createdAt: daysAgo(1),
  },
];

const seedNotifications: AppNotification[] = [
  {
    id: 'n-warranty',
    group: 'system',
    title: 'Warranty ใกล้หมด',
    body: 'ล้างแอร์ติดผนัง เหลือประกันอีก 23 วัน',
    at: daysAgo(0.2),
    read: false,
    jobId: 'NC-240981',
  },
  {
    id: 'n-promo',
    group: 'promo',
    title: 'ล้างแอร์ 2 เครื่องขึ้นไป ลด 10%',
    body: 'ใช้ได้ถึงสิ้นเดือนนี้',
    at: daysAgo(2),
    read: true,
  },
];

type Action =
  | { type: 'hydrate'; jobs: Job[]; lastSyncedAt?: string }
  | { type: 'draft'; patch: Partial<BookingDraft> }
  | { type: 'resetDraft' }
  | { type: 'createJob'; job: Job }
  | { type: 'patchJob'; id: string; patch: Partial<Job>; status?: JobStatus }
  | { type: 'notify'; notification: AppNotification }
  | { type: 'readNotifications'; group?: AppNotification['group'] }
  | { type: 'synced' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return { ...state, booting: false, jobs: action.jobs, lastSyncedAt: action.lastSyncedAt };
    case 'draft':
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case 'resetDraft':
      return { ...state, draft: { ...initialDraft, address: state.draft.address } };
    case 'createJob':
      return { ...state, jobs: [action.job, ...state.jobs] };
    case 'patchJob':
      return {
        ...state,
        jobs: state.jobs.map((j) => {
          if (j.id !== action.id) return j;
          const next = { ...j, ...action.patch };
          if (action.status && action.status !== j.status) {
            if (!canTransition(j.status, action.status)) return j; // ignore illegal transitions
            next.status = action.status;
            next.events = [...j.events, { status: action.status, at: new Date().toISOString() }];
          }
          return next;
        }),
      };
    case 'notify':
      return { ...state, notifications: [action.notification, ...state.notifications] };
    case 'readNotifications':
      return {
        ...state,
        notifications: state.notifications.map((n) => (!action.group || n.group === action.group ? { ...n, read: true } : n)),
      };
    case 'synced':
      return { ...state, lastSyncedAt: new Date().toISOString() };
  }
}

export function priceForDraft(draft: BookingDraft, service: Service | undefined) {
  if (!service) return calculatePrice({ base: 0 });
  const promoApplies = draft.promoCode === PROMO.code && service.pricing === 'fixed';
  return calculatePrice({
    base: service.price,
    quantity: service.pricing === 'fixed' ? draft.quantity : 1,
    promotion: promoApplies ? { label: PROMO.label, amount: PROMO.amount } : undefined,
  });
}

interface Ctx {
  state: State;
  activeJob?: Job;
  setDraft: (patch: Partial<BookingDraft>) => void;
  resetDraft: () => void;
  createJobFromDraft: () => Job | undefined;
  confirmArrival: (jobId: string) => void;
  approveQuote: (jobId: string) => void;
  rejectQuote: (jobId: string) => void;
  confirmComplete: (jobId: string) => void;
  pay: (jobId: string) => Promise<void>;
  submitReview: (jobId: string, rating: number) => void;
  cancelJob: (jobId: string) => void;
  markNotificationsRead: (group?: AppNotification['group']) => void;
}

const AppContext = createContext<Ctx | null>(null);
const STORAGE_KEY = 'nongchang.cache.v1';

let jobSeq = 241200;
const newId = () => `NC-${++jobSeq}`;
const pin = () => String(Math.floor(1000 + Math.random() * 9000));

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    booting: true,
    draft: initialDraft,
    jobs: [],
    notifications: seedNotifications,
  });

  // Offline cache (spec §61): hydrate the last known jobs, then persist on change.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const cached = raw ? (JSON.parse(raw) as { jobs: Job[]; lastSyncedAt?: string }) : undefined;
        dispatch({ type: 'hydrate', jobs: cached?.jobs?.length ? cached.jobs : seedJobs, lastSyncedAt: cached?.lastSyncedAt });
      })
      .catch(() => dispatch({ type: 'hydrate', jobs: seedJobs }));
  }, []);

  useEffect(() => {
    if (state.booting) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ jobs: state.jobs, lastSyncedAt: state.lastSyncedAt })).catch(() => {});
  }, [state.jobs, state.lastSyncedAt, state.booting]);

  const activeJob = useMemo(() => state.jobs.find((j) => isActive(j.status)), [state.jobs]);

  const notify = useCallback((n: Omit<AppNotification, 'id' | 'at' | 'read'>) => {
    dispatch({ type: 'notify', notification: { ...n, id: `n-${Date.now()}-${Math.random()}`, at: new Date().toISOString(), read: false } });
  }, []);

  const patch = useCallback((id: string, p: Partial<Job>, status?: JobStatus) => dispatch({ type: 'patchJob', id, patch: p, status }), []);
  const markNotificationsRead = useCallback((group?: AppNotification['group']) => dispatch({ type: 'readNotifications', group }), []);

  useJobSimulator(activeJob, patch, notify, () => dispatch({ type: 'synced' }));

  const value = useMemo<Ctx>(() => {
    const find = (id: string) => state.jobs.find((j) => j.id === id);
    return {
      state,
      activeJob,
      setDraft: (p) => dispatch({ type: 'draft', patch: p }),
      resetDraft: () => dispatch({ type: 'resetDraft' }),
      createJobFromDraft: () => {
        const { draft } = state;
        const service = draft.serviceId ? serviceById(draft.serviceId) : undefined;
        if (!service) return undefined;
        const price = priceForDraft(draft, service);
        const now = new Date().toISOString();
        const asap = draft.schedule.mode === 'asap';
        const job: Job = {
          id: newId(),
          serviceId: service.id,
          quantity: draft.quantity,
          address: draft.address,
          schedule: draft.schedule,
          paymentMethod: draft.paymentMethod,
          status: asap ? 'matching' : 'created',
          events: [{ status: 'created', at: now }, ...(asap ? [{ status: 'matching' as const, at: now }] : [])],
          routeProgress: 0,
          pin: pin(),
          total: price.total,
          discount: price.discount,
          beforePhotos: [],
          afterPhotos: [],
          createdAt: now,
        };
        dispatch({ type: 'createJob', job });
        track('order_created', { jobId: job.id, serviceId: service.id, total: job.total, mode: draft.schedule.mode });
        if (asap) track('technician_search_started', { jobId: job.id });
        return job;
      },
      confirmArrival: (id) => patch(id, {}, 'started'),
      approveQuote: (id) => {
        const job = find(id);
        if (!job?.quote) return;
        const total = calculatePrice({ base: job.quote.labor, parts: job.quote.parts, inspectionCredit: job.quote.inspectionCredit });
        track('quote_approved', { jobId: id, total: total.total });
        patch(id, { total: total.total, discount: total.discount }, 'approved');
      },
      rejectQuote: (id) => {
        // Customer pays the inspection fee only.
        patch(id, { quote: undefined }, 'cancelled');
      },
      confirmComplete: (id) => patch(id, {}, 'confirmed'),
      pay: async (id) => {
        await new Promise((r) => setTimeout(r, 1200)); // payment gateway round-trip
        const job = find(id);
        const service = job && serviceById(job.serviceId);
        patch(id, { warrantyUntil: new Date(Date.now() + (service?.warrantyDays ?? 30) * 86_400_000).toISOString() }, 'paid');
        track('payment_success', { jobId: id, amount: job?.total });
        notify({ group: 'job', title: 'ชำระเงินสำเร็จ', body: `ชำระ ${job?.total ?? ''} บาท เรียบร้อยแล้ว`, jobId: id });
      },
      submitReview: (id, rating) => {
        patch(id, { rating }, 'reviewed');
        track('review_submitted', { jobId: id, rating });
      },
      cancelJob: (id) => patch(id, {}, 'cancelled'),
      markNotificationsRead,
    };
  }, [state, activeJob, patch, notify, markNotificationsRead]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppStoreProvider');
  return ctx;
}

export function useJob(id: string | undefined) {
  const { state } = useApp();
  return state.jobs.find((j) => j.id === id);
}

export function useTechnician(id: string | undefined): Technician | undefined {
  return id ? technicianById(id) : undefined;
}

/* -------------------------------------------------------------------------- */
/*                               Mock realtime                                */
/* -------------------------------------------------------------------------- */

/** One simulated "minute" of ETA in real milliseconds — keeps demos short. */
const SIM_MINUTE_MS = 1000;

function useJobSimulator(
  job: Job | undefined,
  patch: (id: string, p: Partial<Job>, s?: JobStatus) => void,
  notify: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void,
  synced: () => void,
) {
  const jobRef = useRef(job);
  useEffect(() => {
    jobRef.current = job;
  });

  const status = job?.status;
  const id = job?.id;

  useEffect(() => {
    if (!id || !status) return;
    const service = serviceById(jobRef.current!.serviceId);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    switch (status) {
      case 'matching':
        later(3500, () => {
          const [best] = rankCandidates(TECHNICIANS, { skill: service?.categoryId ?? 'aircon' });
          const tech = best?.candidate as Technician | undefined;
          if (!tech) return;
          haptic.success();
          track('technician_matched', { jobId: id, technicianId: tech.id, score: best.score });
          patch(id, { technicianId: tech.id, etaMinutes: best.etaMinutes }, 'matched');
          notify({ group: 'job', title: 'ช่างรับงานแล้ว', body: `${tech.name} กำลังเตรียมเดินทาง`, jobId: id });
        });
        break;
      case 'matched':
        later(2500, () => {
          patch(id, {}, 'en_route');
          notify({ group: 'job', title: 'ช่างกำลังมา', body: 'ติดตามตำแหน่งช่างได้แบบเรียลไทม์', jobId: id });
        });
        break;
      case 'en_route': {
        const start = jobRef.current?.etaMinutes ?? 12;
        const interval = setInterval(() => {
          const j = jobRef.current;
          if (!j || j.status !== 'en_route') return;
          const eta = Math.max(0, (j.etaMinutes ?? start) - 1);
          synced();
          if (eta === 10) notify({ group: 'job', title: 'เหลือ 10 นาที', body: 'ช่างใกล้ถึงแล้ว', jobId: id });
          if (eta === 0) {
            haptic.success();
            track('technician_arrived', { jobId: id });
            patch(id, { etaMinutes: 0, routeProgress: 1 }, 'arrived');
            notify({ group: 'job', title: 'ช่างมาถึงแล้ว', body: 'กรุณายืนยันพบช่างด้วยรหัส PIN', jobId: id });
          } else {
            patch(id, { etaMinutes: eta, routeProgress: 1 - eta / start });
          }
        }, SIM_MINUTE_MS);
        return () => clearInterval(interval);
      }
      case 'started':
        later(3000, () => {
          if (service?.pricing === 'inspection') {
            const quote: Quote = {
              labor: 450,
              parts: [
                { label: 'วาล์ว', amount: 220 },
                { label: 'ข้อต่อ', amount: 80 },
              ],
              inspectionCredit: service.price,
            };
            haptic.warning();
            track('quote_created', { jobId: id });
            patch(id, { quote, beforePhotos: ['before-1', 'before-2'] }, 'quoted');
            notify({ group: 'job', title: 'มีใบเสนอราคา', body: 'ตรวจสอบและอนุมัติก่อนช่างเริ่มงาน', jobId: id });
          } else {
            patch(id, { beforePhotos: ['before-1'] }, 'approved');
          }
        });
        break;
      case 'approved':
        later(1500, () => {
          track('work_started', { jobId: id });
          patch(id, {}, 'in_progress');
          notify({ group: 'job', title: 'ช่างเริ่มงานแล้ว', body: service?.name ?? '', jobId: id });
        });
        break;
      case 'in_progress':
        later(8000, () => {
          haptic.success();
          track('work_completed', { jobId: id });
          patch(id, { afterPhotos: ['after-1', 'after-2'] }, 'completed');
          notify({ group: 'job', title: 'งานเสร็จเรียบร้อย', body: 'ตรวจสอบงานและยืนยันเพื่อชำระเงิน', jobId: id });
        });
        break;
    }
    return () => timers.forEach(clearTimeout);
  }, [id, status, patch, notify, synced]);
}
