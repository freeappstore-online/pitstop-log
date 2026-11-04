/**
 * Explicit sample data — only inserted when the user clicks "Load sample data".
 * Never silently created.
 */
import type { AppData } from "./types";

export function buildSampleData(): AppData {
  const vehicleId = "sample-v1";
  const now = new Date();
  const d = (daysAgo: number) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - daysAgo);
    return dt.toISOString().slice(0, 10);
  };

  return {
    schemaVersion: 1,
    vehicles: [
      {
        id: vehicleId,
        name: "Sample Hatchback",
        make: "Toyota",
        model: "Corolla",
        year: 2019,
        colour: "Silver",
        createdAt: new Date(now.getTime() - 90 * 86400000).toISOString(),
      },
    ],
    fuelEntries: [
      {
        id: "sample-f1",
        vehicleId,
        date: d(84),
        odometer: 45000,
        litres: 42.5,
        totalCost: 72.25,
        fullTank: true,
        notes: "First sample fill",
      },
      {
        id: "sample-f2",
        vehicleId,
        date: d(63),
        odometer: 45780,
        litres: 44.1,
        totalCost: 75.0,
        fullTank: true,
        notes: "",
      },
      {
        id: "sample-f3",
        vehicleId,
        date: d(42),
        odometer: 46510,
        litres: 38.9,
        totalCost: 66.13,
        fullTank: true,
        notes: "Highway run",
      },
      {
        id: "sample-f4",
        vehicleId,
        date: d(21),
        odometer: 47290,
        litres: 40.2,
        totalCost: 68.34,
        fullTank: false,
        notes: "Partial fill only",
      },
      {
        id: "sample-f5",
        vehicleId,
        date: d(7),
        odometer: 47900,
        litres: 45.0,
        totalCost: 76.50,
        fullTank: true,
        notes: "",
      },
    ],
    expenseEntries: [
      {
        id: "sample-e1",
        vehicleId,
        date: d(80),
        category: "service",
        amount: 185.0,
        description: "Annual service + oil change",
      },
      {
        id: "sample-e2",
        vehicleId,
        date: d(60),
        category: "registration",
        amount: 320.0,
        description: "Annual rego",
      },
      {
        id: "sample-e3",
        vehicleId,
        date: d(30),
        category: "tyres",
        amount: 520.0,
        description: "2× front tyres",
      },
      {
        id: "sample-e4",
        vehicleId,
        date: d(10),
        category: "parking",
        amount: 18.0,
        description: "City parking",
      },
    ],
  };
}
