import { describe, expect, it } from "vitest";
import { computeVehicleStats } from "./stats";
import type { AppData, FuelEntry } from "./types";
const fill = (id: string, odometer: number, litres: number, fullTank = true): FuelEntry => ({
 id, vehicleId: "v1", date: "2026-11-01", odometer, litres, totalCost: litres * 2, fullTank, notes: "",
});
const stats = (...fuelEntries: FuelEntry[]) => computeVehicleStats("v1", { schemaVersion: 1, vehicles: [], fuelEntries, expenseEntries: [] } as AppData);
describe("fuel consumption", () => {
 it("weights valid intervals by distance", () => {
   const result = stats(fill("a",1000,40),fill("b",1500,35),fill("c",2500,90));
   expect(result.consumption[0].l100km).toBeCloseTo(7, 8);
   expect(result.consumption[1].l100km).toBeCloseTo(9, 8);
   expect(result.avgL100km).toBeCloseTo(125 / 1500 * 100, 8);
 });
 it("does not invent consumption across partial fills or zero distance", () => {
   expect(stats(fill("a",1000,40),fill("b",1000,10)).avgL100km).toBeNull();
   expect(stats(fill("a",1000,40),fill("b",1200,10,false),fill("c",1500,30)).avgL100km).toBeNull();
 });
 it("ignores other vehicles and keeps a single valid interval correct", () => {
   const other = {...fill("other",4000,100), vehicleId:"v2"};
   expect(stats(fill("a",1000,40),fill("b",1500,35),other).avgL100km).toBeCloseTo(7, 8);
 });
});
