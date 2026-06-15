export type MonthAnalyticsInput = {
  shipmentLots: Array<{
    opening_stock_kg?: number | string | null;
    certified_weight_kg?: number | string | null;
    shipment_date?: string | null;
  }>;
  consumptions: Array<{
    consumed_weight_kg?: number | string | null;
    consumption_date?: string | null;
  }>;
};

export type MonthlyPoint = {
  month: number;
  label: string;
  openingKg: number;
  receivedKg: number;
  consumedKg: number;
  closingKg: number;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateKey = (value?: string | null) => (value || "").slice(0, 10);

export const getAvailableYears = (input: MonthAnalyticsInput) => {
  const years = new Set<number>();
  input.shipmentLots.forEach((lot) => {
    const date = toDateKey(lot.shipment_date);
    if (date) years.add(Number(date.slice(0, 4)));
  });
  input.consumptions.forEach((entry) => {
    const date = toDateKey(entry.consumption_date);
    if (date) years.add(Number(date.slice(0, 4)));
  });
  if (!years.size) years.add(new Date().getFullYear());
  return Array.from(years).filter(Number.isFinite).sort((a, b) => a - b);
};

export const buildMonthlyAnalytics = (input: MonthAnalyticsInput, year: number): MonthlyPoint[] => {
  const shipmentLots = input.shipmentLots
    .map((lot) => ({
      date: toDateKey(lot.shipment_date),
      receivedKg: toNumber(lot.opening_stock_kg ?? lot.certified_weight_kg),
    }))
    .filter((lot) => lot.date);

  const consumptions = input.consumptions
    .map((entry) => ({
      date: toDateKey(entry.consumption_date),
      consumedKg: toNumber(entry.consumed_weight_kg),
    }))
    .filter((entry) => entry.date);

  const monthReceived = new Map<number, number>();
  const monthConsumed = new Map<number, number>();

  let openingCarry = 0;

  shipmentLots.forEach((lot) => {
    const lotYear = Number(lot.date.slice(0, 4));
    const lotMonth = Number(lot.date.slice(5, 7));
    if (lotYear < year) {
      openingCarry += lot.receivedKg;
    } else if (lotYear === year) {
      monthReceived.set(lotMonth, (monthReceived.get(lotMonth) || 0) + lot.receivedKg);
    }
  });

  consumptions.forEach((entry) => {
    const entryYear = Number(entry.date.slice(0, 4));
    const entryMonth = Number(entry.date.slice(5, 7));
    if (entryYear < year) {
      openingCarry -= entry.consumedKg;
    } else if (entryYear === year) {
      monthConsumed.set(entryMonth, (monthConsumed.get(entryMonth) || 0) + entry.consumedKg);
    }
  });

  let runningOpening = openingCarry;

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const receivedKg = Number((monthReceived.get(month) || 0).toFixed(3));
    const consumedKg = Number((monthConsumed.get(month) || 0).toFixed(3));
    const openingKg = Number(runningOpening.toFixed(3));
    const closingKg = Number((openingKg + receivedKg - consumedKg).toFixed(3));
    runningOpening = closingKg;

    return {
      month,
      label: MONTH_LABELS[index],
      openingKg,
      receivedKg,
      consumedKg,
      closingKg,
    };
  });
};
