/**
 * Compute per-vehicle statistics from raw data.
 * L/100km is only shown when two consecutive full-tank readings exist.
 */
import type { AppData, VehicleStats, ConsumptionInterval } from "./types";

export function computeVehicleStats(vehicleId: string, data: AppData): VehicleStats {
  const fuel = data.fuelEntries
    .filter(e => e.vehicleId === vehicleId)
    .sort((a, b) => {
      // Sort by odometer ascending; date as tiebreak
      if (a.odometer !== b.odometer) return a.odometer - b.odometer;
      return a.date.localeCompare(b.date);
    });

  const expenses = data.expenseEntries.filter(e => e.vehicleId === vehicleId);

  const totalFuelCost = fuel.reduce((s, e) => s + e.totalCost, 0);
  const totalExpenseCost = expenses.reduce((s, e) => s + e.amount, 0);
  const totalLitres = fuel.reduce((s, e) => s + e.litres, 0);

  // Compute L/100km only between consecutive full-tank entries
  const consumption: ConsumptionInterval[] = [];
  for (let i = 1; i < fuel.length; i++) {
    const prev = fuel[i - 1];
    const curr = fuel[i];
    // Both must be full-tank fills; distance must be positive
    if (!prev.fullTank || !curr.fullTank) continue;
    const dist = curr.odometer - prev.odometer;
    if (dist <= 0) continue;
    // curr.litres is the fuel used to travel `dist` km since the last full fill
    const l100km = (curr.litres / dist) * 100;
    consumption.push({
      fromOdometer: prev.odometer,
      toOdometer: curr.odometer,
      distanceKm: dist,
      litres: curr.litres,
      l100km,
      date: curr.date,
    });
  }

  const avgL100km =
    consumption.length > 0
      ? (consumption.reduce((s, c) => s + c.litres, 0) /
          consumption.reduce((s, c) => s + c.distanceKm, 0)) * 100
      : null;

  const lastOdometer =
    fuel.length > 0 ? fuel[fuel.length - 1].odometer : null;

  return {
    vehicleId,
    totalFuelCost,
    totalExpenseCost,
    totalCost: totalFuelCost + totalExpenseCost,
    totalLitres,
    totalFuelEntries: fuel.length,
    totalExpenseEntries: expenses.length,
    consumption,
    avgL100km,
    lastOdometer,
  };
}

export function fmt(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtCurrency(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
