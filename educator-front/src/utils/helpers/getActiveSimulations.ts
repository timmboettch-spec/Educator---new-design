export const isActiveSimulation = (item: { status?: string } | null | undefined): boolean => {
  if (!item?.status) return false;
  return item.status === "published";
};

export const getActiveSimulations = <T extends { status?: string }>(items: T[]): T[] =>
  items.filter(isActiveSimulation);
