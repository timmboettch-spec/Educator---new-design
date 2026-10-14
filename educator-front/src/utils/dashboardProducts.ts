/**
 * Products and usage for the educator dashboard's "My Products & Usage".
 *
 * TODO(api): there is no products endpoint yet, so the product list and the
 * per-product / hours figures are placeholders (the design's sample data). Seat
 * totals are real (from /api/auth/me). Replace `getDashboardProducts` with the
 * API result when it ships; the section reads everything through this module.
 */

export type ProductKind = 'avatar' | 'workstation';
export type ProductEdition = 'secondary' | 'postSecondary';

export interface DashboardProduct {
  key: string;
  name: string;
  kind: ProductKind;
  edition: ProductEdition;
  /** Licensed through, as YYYY-MM-DD. */
  expiresOn: string;
  /** Avatar only: seats still available of those allocated. */
  remainingSeats?: number;
  /** Workstation only: the hardware product it runs on. */
  hardware?: string;
  /** Workstation only: hardware hours used and allowed. */
  hoursUsed?: number;
  hoursLimit?: number;
}

const AVATAR_SECONDARY =
  'RealPatient™ Online Avatar Simulation - Secondary Education Edition';
const AVATAR_POST_SECONDARY =
  'RealPatient™ Online Avatar Simulation - Post-Secondary Education Edition';
const WORKSTATION_SECONDARY =
  'RealPatient™ Workstation - Secondary Education Edition';
const WORKSTATION_POST_SECONDARY =
  'RealPatient™ Workstation - Post-Secondary Education Edition';

const PLACEHOLDER_PRODUCTS: DashboardProduct[] = [
  {
    key: 'AVT-SEC-1042',
    name: AVATAR_SECONDARY,
    kind: 'avatar',
    edition: 'secondary',
    expiresOn: '2028-06-30',
    remainingSeats: 32,
  },
  {
    key: 'AVT-PS-0198',
    name: AVATAR_POST_SECONDARY,
    kind: 'avatar',
    edition: 'postSecondary',
    expiresOn: '2028-12-31',
    remainingSeats: 145,
  },
  {
    key: 'AVT-PS-0233',
    name: AVATAR_POST_SECONDARY,
    kind: 'avatar',
    edition: 'postSecondary',
    expiresOn: '2028-06-30',
    remainingSeats: 12,
  },
  {
    key: 'WS-SEC-0071',
    name: WORKSTATION_SECONDARY,
    kind: 'workstation',
    edition: 'secondary',
    expiresOn: '2028-06-30',
    hardware: 'Adult Nursing Manikin',
    hoursUsed: 412,
    hoursLimit: 1500,
  },
  {
    key: 'WS-SEC-0072',
    name: WORKSTATION_SECONDARY,
    kind: 'workstation',
    edition: 'secondary',
    expiresOn: '2028-06-30',
    hardware: 'Adult Nursing Manikin',
    hoursUsed: 233,
    hoursLimit: 1500,
  },
  {
    key: 'WS-SEC-0090',
    name: WORKSTATION_SECONDARY,
    kind: 'workstation',
    edition: 'secondary',
    expiresOn: '2028-12-31',
    hardware: 'Bariatric Nursing Manikin',
    hoursUsed: 88,
    hoursLimit: 1500,
  },
  {
    key: 'WS-PS-0044',
    name: WORKSTATION_POST_SECONDARY,
    kind: 'workstation',
    edition: 'postSecondary',
    expiresOn: '2029-12-31',
    hardware: 'Knee & Ankle Injury Simulator',
    hoursUsed: 168,
    hoursLimit: 1500,
  },
  {
    key: 'WS-PS-0051',
    name: WORKSTATION_POST_SECONDARY,
    kind: 'workstation',
    edition: 'postSecondary',
    expiresOn: '2026-06-30',
    hardware: 'PAT Manikin™',
    hoursUsed: 1500,
    hoursLimit: 1500,
  },
];

const parseDay = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
};

/** Still licensed on `today` (through the end of its expiry day). */
export const isProductActive = (product: DashboardProduct, today: Date) => {
  const end = parseDay(product.expiresOn);
  end.setHours(23, 59, 59, 999);
  return !Number.isNaN(end.getTime()) && end >= today;
};

/** The educator's active products (placeholder data until the API exists). */
export const getDashboardProducts = (
  today: Date = new Date()
): DashboardProduct[] =>
  PLACEHOLDER_PRODUCTS.filter((product) => isProductActive(product, today));

export const formatProductDate = (value: string, locale: string) => {
  const date = parseDay(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
};

export type ProductGroups = Record<
  ProductEdition,
  Record<ProductKind, DashboardProduct[]>
>;

export const groupProducts = (products: DashboardProduct[]): ProductGroups => {
  const pick = (edition: ProductEdition, kind: ProductKind) =>
    products.filter((p) => p.edition === edition && p.kind === kind);
  return {
    secondary: {
      avatar: pick('secondary', 'avatar'),
      workstation: pick('secondary', 'workstation'),
    },
    postSecondary: {
      avatar: pick('postSecondary', 'avatar'),
      workstation: pick('postSecondary', 'workstation'),
    },
  };
};

/** Avatar hours are capped at 40 per allocated seat (placeholder until tracked). */
const AVATAR_HOURS_PER_SEAT = 40;
const PLACEHOLDER_AVATAR_HOURS_SHARE = 0.55;

interface UsedOfTotal {
  used: number;
  total: number;
}

export interface AvatarUsage {
  /** Real, from the educator's seats. */
  seats: UsedOfTotal;
  remainingSeats: number;
  /** Placeholder split by how many avatar products each edition has. */
  secondarySeats: UsedOfTotal;
  postSecondarySeats: UsedOfTotal;
  secondaryHours: number;
  postSecondaryHours: number;
}

/**
 * Avatar usage: the seat totals are real; the secondary/post-secondary split and the
 * hours are placeholders, apportioned by each edition's share of avatar products.
 */
export const buildAvatarUsage = (
  seats: { total: number; consumed: number; available: number },
  groups: ProductGroups
): AvatarUsage => {
  const secondaryCount = groups.secondary.avatar.length;
  const postCount = groups.postSecondary.avatar.length;
  const weight = secondaryCount + postCount || 1;
  const secondaryShare = (n: number) =>
    Math.round((n * secondaryCount) / weight);

  const hoursTotal = seats.total * AVATAR_HOURS_PER_SEAT;
  const hoursUsed = Math.round(hoursTotal * PLACEHOLDER_AVATAR_HOURS_SHARE);
  const secondaryUsed = secondaryShare(seats.consumed);
  const secondaryTotal = secondaryShare(seats.total);
  const secondaryHours = secondaryShare(hoursUsed);

  return {
    seats: { used: seats.consumed, total: seats.total },
    remainingSeats: seats.available,
    secondarySeats: { used: secondaryUsed, total: secondaryTotal },
    postSecondarySeats: {
      used: seats.consumed - secondaryUsed,
      total: seats.total - secondaryTotal,
    },
    secondaryHours,
    postSecondaryHours: hoursUsed - secondaryHours,
  };
};

export interface HardwareHours extends UsedOfTotal {
  key: string;
  name: string;
}

export const hardwareHours = (products: DashboardProduct[]): HardwareHours[] =>
  products.map((p) => ({
    key: p.key,
    name: p.hardware ?? p.name,
    used: p.hoursUsed ?? 0,
    total: p.hoursLimit ?? 0,
  }));

export const sumHours = (rows: UsedOfTotal[]): UsedOfTotal =>
  rows.reduce(
    (sum, row) => ({ used: sum.used + row.used, total: sum.total + row.total }),
    { used: 0, total: 0 }
  );

export interface SeatRequestOption {
  value: string;
  label: string;
  availableSeats?: number;
}

/** The avatar products an educator can request more seats on. */
export const toSeatRequestOptions = (
  products: DashboardProduct[]
): SeatRequestOption[] =>
  products
    .filter((p) => p.kind === 'avatar')
    .map((p) => ({
      value: p.key,
      label: p.name,
      availableSeats: p.remainingSeats,
    }));
