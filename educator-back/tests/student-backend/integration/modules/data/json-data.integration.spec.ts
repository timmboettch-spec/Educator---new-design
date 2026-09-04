import { Test } from "@nestjs/testing";
import type { TestingModule } from "@nestjs/testing";
import { JsonDataService } from "@/data/json-data.service";
import type { Scenario } from "@/data/json-data.service";

// ── test-only interface for accessing private service properties ──────────────
interface ServiceInternals {
  azureEnabled: boolean;
  cache: Record<string, unknown>;
}

/**
 * Integration tests for JsonDataService — exercise cache-backed persistence
 * with Azure disabled, mirroring how the service operates in test environments.
 */
describe("JsonDataService (integration)", () => {
  let service: JsonDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JsonDataService],
    }).compile();

    service = module.get<JsonDataService>(JsonDataService);
    (service as unknown as Record<string, unknown>).azureEnabled = false;
    ((service as unknown as Record<string, unknown>).cache as Record<string, unknown>)[
      "scenarios.json"
    ] = [];
    ((service as unknown as Record<string, unknown>).cache as Record<string, unknown>)[
      "units.json"
    ] = [];
  });

  it("should persist and retrieve data across reads", async () => {
    const scenario = {
      id: "int-s1",
      unitId: "u1",
      title: "Integration scenario",
    } as unknown as Scenario;

    await service.addScenario(scenario);

    expect(service.getScenarioById("int-s1")).toBeDefined();
    expect(service.getScenarioById("int-s1")?.title).toBe(
      "Integration scenario",
    );

    const all = service.getScenarios();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("int-s1");
  });

  it("should handle concurrent writes without data corruption", async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      service.addScenario({
        id: `concurrent-${i}`,
        unitId: "u1",
        title: `Concurrent ${i}`,
      } as unknown as Scenario),
    );

    await Promise.all(writes);

    const all = service.getScenarios();
    expect(all).toHaveLength(10);

    const ids = all.map((s) => s.id).sort();
    const expected = Array.from(
      { length: 10 },
      (_, i) => `concurrent-${i}`,
    ).sort();
    expect(ids).toEqual(expected);
  });

  it("should recover from a corrupt JSON file gracefully", () => {
    ((service as unknown as Record<string, unknown>).cache as Record<string, unknown>)[
      "scenarios.json"
    ] = "not-an-array-corrupt";

    expect(() => service.getScenarios()).not.toThrow();

    const result = service.getScenarios();
    expect(Array.isArray(result) || result === undefined).toBe(true);
  });
});
