export type DatePreset = "all" | "last7" | "thisMonth" | "lastMonth" | "custom";

export type DateRange = {
  from?: string;
  to?: string;
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getDateRange = (preset: DatePreset, customFrom = "", customTo = ""): DateRange => {
  const today = new Date();
  const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  switch (preset) {
    case "last7":
      return { from: toDateInputValue(sevenDaysAgo), to: toDateInputValue(today) };
    case "thisMonth":
      return { from: toDateInputValue(startOfThisMonth), to: toDateInputValue(today) };
    case "lastMonth":
      return { from: toDateInputValue(startOfLastMonth), to: toDateInputValue(endOfLastMonth) };
    case "custom":
      return { from: customFrom || undefined, to: customTo || undefined };
    default:
      return {};
  }
};

export const matchesDateRange = (value: string | null | undefined, range: DateRange) => {
  if (!range.from && !range.to) return true;
  if (!value) return false;
  const date = value.slice(0, 10);
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
};
