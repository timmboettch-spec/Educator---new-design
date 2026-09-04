import { JsonDataService } from "@/data/json-data.service";
import { Test, TestingModule } from "@nestjs/testing";

describe("Concurrent File Access Fix", () => {
  let service: JsonDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JsonDataService],
    }).compile();

    service = module.get<JsonDataService>(JsonDataService);
  });

  describe("generateId", () => {
    it("should generate IDs in format: timestamp-randomstring", () => {
      const id = service.generateId();
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it("should generate unique IDs", () => {
      const id1 = service.generateId();
      const id2 = service.generateId();
      expect(id1).not.toBe(id2);
    });

    it("should generate 100 unique IDs without collisions", () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(service.generateId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("Concurrent Transcript Operations", () => {
    it("should create transcripts with unique IDs", async () => {
      const userIds = ["user1", "user2", "user3"];

      const promises = userIds.map(async (userId, index) => ({
        id: service.generateId(),
        userId,
        scenarioId: `scenario-${index}`,
        messages: [
          {
            id: service.generateId(),
            timestamp: new Date().toISOString(),
            text: `Test message from ${userId}`,
            speaker: "student" as const,
          },
        ],
        startedAt: new Date().toISOString(),
      }));

      const transcripts = await Promise.all(promises);
      const transcriptIds = transcripts.map((t) => t.id);
      const messageIds = transcripts.flatMap((t) =>
        t.messages.map((m) => m.id),
      );

      expect(new Set(transcriptIds).size).toBe(3);
      expect(new Set(messageIds).size).toBe(3);
      transcriptIds.forEach((id) => expect(id).toMatch(/^\d+-[a-z0-9]+$/));
    });
  });

  describe("Concurrent Report Operations", () => {
    it("should create reports with unique IDs", async () => {
      const userIds = ["user1", "user2", "user3"];

      const promises = userIds.map(async (userId, index) => ({
        id: service.generateId(),
        userId,
        scenarioId: `scenario-${index}`,
        transcriptId: service.generateId(),
        score: 85 + index,
        scoreJson: {
          communication: 4,
          clinicalJudgment: 4,
          technicalAccuracy: 4,
          ethicalCompetence: 5,
          reflection: 4,
          overallScore: 85 + index,
        },
        feedback: `Feedback for ${userId}`,
        createdAt: new Date().toISOString(),
      }));

      const reports = await Promise.all(promises);
      const reportIds = reports.map((r) => r.id);
      const transcriptIds = reports.map((r) => r.transcriptId);

      expect(new Set(reportIds).size).toBe(3);
      expect(new Set(transcriptIds).size).toBe(3);
      reportIds.forEach((id) => expect(id).toMatch(/^\d+-[a-z0-9]+$/));
    });
  });

  describe("Multi-User Isolation", () => {
    it("should generate unique IDs for multiple users", () => {
      const users = ["user1", "user2", "user3", "user4", "user5"];
      const allIds = new Set();

      users.forEach(() => {
        allIds.add(service.generateId());
        allIds.add(service.generateId());
      });

      expect(allIds.size).toBe(users.length * 2);
    });

    it("should maintain unique IDs across sessions", () => {
      const session1Ids = [service.generateId(), service.generateId()];
      const session2Ids = [service.generateId(), service.generateId()];

      const allIds = [...session1Ids, ...session2Ids];
      expect(new Set(allIds).size).toBe(4);
      allIds.forEach((id) => expect(id).toMatch(/^\d+-[a-z0-9]+$/));
    });
  });

  describe("High Concurrency", () => {
    it("should handle 50 concurrent operations without ID collisions", async () => {
      const promises = Array.from({ length: 50 }, async () => ({
        transcriptId: service.generateId(),
        reportId: service.generateId(),
      }));

      const results = await Promise.all(promises);
      const allIds = results.flatMap((r) => [r.transcriptId, r.reportId]);

      expect(new Set(allIds).size).toBe(100);
      allIds.forEach((id) => expect(id).toMatch(/^\d+-[a-z0-9]+$/));
    });
  });
});
