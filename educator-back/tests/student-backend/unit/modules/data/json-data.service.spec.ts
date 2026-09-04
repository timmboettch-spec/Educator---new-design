import { JsonDataService } from '@/data/json-data.service';
import type { Unit, Scenario, Transcript, Report } from '@/data/json-data.service';
import * as fs from 'fs';

jest.mock('fs');

interface ServiceInternals {
  cache: Record<string, unknown[]>;
  persistChain: Record<string, Promise<unknown> | undefined>;
  azureEnabled: boolean;
  containerClient: unknown;
  containerReady: Promise<void> | undefined;
  blobContainerName: string;
  blobPrefix: string;
  writeJsonFile: (...args: unknown[]) => unknown;
  writeJsonFileAndFlush: (...args: unknown[]) => unknown;
  writeJsonObjectFile: (...args: unknown[]) => unknown;
  scheduleUploadJson: (...args: unknown[]) => unknown;
  downloadJsonObject: (...args: unknown[]) => unknown;
  downloadJsonArray: (...args: unknown[]) => unknown;
  getBlobName: (...args: unknown[]) => unknown;
  flushJson: (...args: unknown[]) => unknown;
  readJsonFile: (...args: unknown[]) => unknown;
  readJsonObjectFile: (...args: unknown[]) => unknown;
}

/* =======================
   FACTORY FUNCTIONS
======================= */
const createMockUsers = () => [
  { id: 'u1', email: 'test1@test.com' },
  { id: 'u2', email: 'test2@test.com' },
];

const createMockUnits = () => [
  { id: 'unit1', name: 'Unit 1' },
  { id: 'unit2', name: 'Unit 2' },
];

const createMockScenarios = () => [
  { id: 's1', unitId: 'unit1', title: 'Scenario 1', sequences: [] },
  { id: 's2', unitId: 'unit1', title: 'Scenario 2', sequences: [] },
  { id: 's3', unitId: 'unit2', title: 'Scenario 3', sequences: [] },
];

const createMockTranscripts = () => [
  { id: 't1', userId: 'u1', scenarioId: 's1', messages: [] },
  { id: 't2', userId: 'u2', scenarioId: 's2', messages: [] },
];

const createMockReports = () => [
  { id: 'r1', userId: 'u1', transcriptId: 't1' },
  { id: 'r2', userId: 'u2', transcriptId: 't2' },
];

/* =======================
   MAIN DESCRIBE
======================= */
describe('JsonDataService', () => {
  let service: JsonDataService;

  beforeEach(() => {
    service = new JsonDataService();

    const mockUsers = createMockUsers();
    const mockUnits = createMockUnits();
    const mockScenarios = createMockScenarios();

    jest
      .spyOn(service as unknown as ServiceInternals, 'readJsonFile')
      .mockImplementation((fileName: string) => {
        if (fileName === 'users.json') return mockUsers;
        if (fileName === 'units.json') return mockUnits;
        if (fileName === 'scenarios.json') return mockScenarios;
        if (fileName === 'default-scenarios.json') return [];
        return [];
      });

    jest
      .spyOn(service as unknown as ServiceInternals, 'writeJsonFile')
      .mockImplementation(() => {});

    jest
      .spyOn(service as unknown as ServiceInternals, 'writeJsonFileAndFlush')
      .mockImplementation(async () => {});

    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.clear();
    mockScenarios.forEach((s) =>
      (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
        s.id,
        s as unknown as Scenario,
      ),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===== USERS =====
  it('should return all users', () => {
    expect(service.getUsers()).toEqual(createMockUsers());
  });

  it('should return user by id', () => {
    expect(service.getUserById('u1')).toEqual(createMockUsers()[0]);
  });

  it('should return undefined if user not found by id', () => {
    expect(service.getUserById('missing')).toBeUndefined();
  });

  it('should return user by email', () => {
    expect(service.getUserByEmail('test2@test.com')).toEqual(createMockUsers()[1]);
  });

  // ===== UNITS =====
  it('should return all units', () => {
    expect(service.getUnits()).toEqual(createMockUnits());
  });

  it('should return unit by id', () => {
    expect(service.getUnitById('unit1')).toEqual(createMockUnits()[0]);
  });

  it('should add a unit', () => {
    const newUnit = { id: 'unit3', name: 'Unit 3' };
    service.addUnit(newUnit as unknown as Unit);

    expect((service as unknown as ServiceInternals).writeJsonFile).toHaveBeenCalledWith(
      'units.json',
      [{ id: 'unit1', name: 'Unit 1' }, { id: 'unit2', name: 'Unit 2' }, newUnit],
    );
  });

  it('should update a unit', () => {
    service.updateUnit('unit1', { name: 'Updated Unit' });

    expect((service as unknown as ServiceInternals).writeJsonFile).toHaveBeenCalledWith(
      'units.json',
      [
        { id: 'unit1', name: 'Updated Unit' },
        { id: 'unit2', name: 'Unit 2' },
      ],
    );
  });

  it('should throw error when updating non-existing unit', () => {
    expect(() => service.updateUnit('missing', { name: 'X' })).toThrow(
      'Unit with id missing not found',
    );
  });

  it('should delete a unit', () => {
    service.deleteUnit('unit2');

    expect((service as unknown as ServiceInternals).writeJsonFile).toHaveBeenCalledWith(
      'units.json',
      [{ id: 'unit1', name: 'Unit 1' }],
    );
  });

  it('should throw error when deleting non-existing unit', () => {
    expect(() => service.deleteUnit('missing')).toThrow('Unit with id missing not found');
  });

  // ===== SCENARIOS =====
  it('should return all scenarios', () => {
    expect(service.getScenarios()).toEqual(createMockScenarios());
  });

  it('should return scenario by id', () => {
    expect(service.getScenarioById('s1')).toEqual(createMockScenarios()[0]);
  });

  it('should return scenarios by unit id', () => {
    const result = service.getScenariosByUnitId('unit1');
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('should verify isDistractor persistence in scenario actions', () => {
    const scenarioWithDistractor = {
      id: 's_distractor',
      unitId: 'unit1',
      title: 'Scenario with Distractor',
      actions: [
        {
          id: 'a1',
          title: 'Normal Action',
          type: 'single',
          isDistractor: false,
        },
        {
          id: 'a2',
          title: 'Distractor Action',
          type: 'single',
          isDistractor: true,
        },
      ],
    };

    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
      's_distractor',
      scenarioWithDistractor as unknown as Scenario,
    );

    const result = service.getScenarioById('s_distractor');
    expect(result).toBeDefined();
    if (result && result.actions) {
      expect(result.actions).toHaveLength(2);
      expect((result.actions[0] as { isDistractor?: boolean }).isDistractor).toBe(false);
      expect((result.actions[1] as { isDistractor?: boolean }).isDistractor).toBe(true);
    } else {
      fail('Scenario or actions not found');
    }
  });

  it('should add scenario and save default scenario', async () => {
    const newScenario = { id: 's4', title: 'Scenario 4', unitId: 'unit2' };
    await service.addScenario(newScenario as unknown as Scenario);

    const scenariosMap = (service as unknown as { scenariosMap: Map<string, Scenario> })
      .scenariosMap;
    expect(scenariosMap.get('s4')).toBeDefined();
    expect(scenariosMap.get('s4')!.title).toBe('Scenario 4');
    expect(scenariosMap.get('s4')!.unitId).toBe('unit2');
  });

  it('should update scenario', async () => {
    await service.updateScenario('s1', { title: 'Updated Scenario' });

    expect(service.getScenarioById('s1')!.title).toBe('Updated Scenario');
  });

  it('should throw error when updating non-existing scenario', async () => {
    await expect(service.updateScenario('missing', { title: 'X' })).rejects.toThrow(
      'Scenario with id missing not found',
    );
  });

  it('should delete scenario', async () => {
    await service.deleteScenario('s3');

    expect(service.getScenarioById('s3')).toBeUndefined();
  });

  it('should throw error when deleting non-existing scenario', async () => {
    await expect(service.deleteScenario('missing')).rejects.toThrow(
      'Scenario with id missing not found',
    );
  });

  // ===== DEFAULT SCENARIOS =====
  it('should return default scenarios', () => {
    expect(service.getDefaultScenarios()).toEqual([]);
  });

  it('should return default scenario by original id', () => {
    jest
      .spyOn(service, 'getDefaultScenarios')
      .mockReturnValue([
        { originalId: 's1', title: 'Default Scenario' } as unknown as Omit<
          Scenario,
          'id' | 'unitId'
        >,
      ]);

    expect(service.getDefaultScenarioById('s1')).toEqual({
      originalId: 's1',
      title: 'Default Scenario',
    });
  });

  it('should return undefined if default scenario not found', () => {
    jest.spyOn(service, 'getDefaultScenarios').mockReturnValue([]);
    expect(service.getDefaultScenarioById('missing')).toBeUndefined();
  });
});

/* =======================
   SECOND DESCRIBE
======================= */
describe('JsonDataService – Transcripts, Reports, Permissions, Utils', () => {
  let service: JsonDataService;

  beforeEach(() => {
    service = new JsonDataService();

    const mockTranscripts = createMockTranscripts();
    const mockReports = createMockReports();

    jest
      .spyOn(service as unknown as ServiceInternals, 'readJsonFile')
      .mockImplementation((fileName: string) => {
        if (fileName === 'transcripts.json') return mockTranscripts;
        if (fileName === 'reports.json') return mockReports;
        if (fileName === 'default-scenarios.json') return [{ id: 'd1' }, { id: 'd2' }];
        return [];
      });

    jest
      .spyOn(service as unknown as ServiceInternals, 'writeJsonFile')
      .mockImplementation(() => {});

    jest
      .spyOn(service as unknown as ServiceInternals, 'flushJson')
      .mockImplementation(async () => {});

    jest
      .spyOn(service, 'getReportsFresh')
      .mockImplementation(async () => createMockReports() as unknown as Report[]);

    jest
      .spyOn(service as unknown as ServiceInternals, 'readJsonObjectFile')
      .mockImplementation((fileName: string) => {
        if (fileName === 'username-units.json') {
          return {
            permissions: [
              { key: 'USER1', units: ['unit1'] },
              { key: 'user2', units: ['unit2'] },
            ],
          };
        }

        return { permissions: [] };
      });

    jest
      .spyOn(service as unknown as ServiceInternals, 'writeJsonObjectFile')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===== TRANSCRIPTS =====
  it('should return all transcripts', () => {
    expect(service.getTranscripts()).toEqual(createMockTranscripts());
  });

  it('should add transcript', () => {
    const newTranscript = {
      id: 't3',
      userId: 'u3',
      scenarioId: 's3',
      messages: [],
    };

    service.addTranscript(newTranscript as unknown as Transcript);

    expect((service as unknown as ServiceInternals).writeJsonFile).toHaveBeenCalledWith(
      'transcripts.json',
      [
        { id: 't1', userId: 'u1', scenarioId: 's1', messages: [] },
        { id: 't2', userId: 'u2', scenarioId: 's2', messages: [] },
        newTranscript,
      ],
    );
  });

  it('should update transcript', () => {
    service.updateTranscript('t1', { scenarioId: 'updated' });

    expect((service as unknown as ServiceInternals).writeJsonFile).toHaveBeenCalledWith(
      'transcripts.json',
      [
        { id: 't1', userId: 'u1', scenarioId: 'updated', messages: [] },
        { id: 't2', userId: 'u2', scenarioId: 's2', messages: [] },
      ],
    );
  });

  it('should return transcript by id', () => {
    expect(service.getTranscriptById('t1')).toEqual(createMockTranscripts()[0]);
  });

  it('should return transcripts by user id', () => {
    expect(service.getTranscriptsByUserId('u1')).toEqual([createMockTranscripts()[0]]);
  });

  it('should add messages to transcript', () => {
    service.addMessagesToTranscript('t1', [{ text: 'hello' }] as unknown as Transcript['messages']);
    expect((service as unknown as ServiceInternals).writeJsonFile).toHaveBeenCalled();
  });

  // ===== REPORTS =====
  it('should return all reports', () => {
    expect(service.getReports()).toEqual(createMockReports());
  });

  it('should add report', () => {
    const newReport = { id: 'r3', userId: 'u3', transcriptId: 't3' };

    service.addReport(newReport as unknown as Report);

    expect((service as unknown as ServiceInternals).writeJsonFile).toHaveBeenCalledWith(
      'reports.json',
      [
        { id: 'r1', userId: 'u1', transcriptId: 't1' },
        { id: 'r2', userId: 'u2', transcriptId: 't2' },
        newReport,
      ],
    );
  });

  it('should return report by id', () => {
    expect(service.getReportById('r1')).toEqual(createMockReports()[0]);
  });

  it('should return reports by user id', () => {
    expect(service.getReportsByUserId('u2')).toEqual([createMockReports()[1]]);
  });

  it('should return report by transcript id', () => {
    expect(service.getReportByTranscriptId('t1')).toEqual(createMockReports()[0]);
  });

  // ===== PERMISSIONS =====
  it('should return permissions data', () => {
    expect(service.getPermissionsData()).toEqual({
      permissions: [
        { key: 'USER1', units: ['unit1'] },
        { key: 'user2', units: ['unit2'] },
      ],
    });
  });

  it('should return permission by key (case insensitive)', () => {
    expect(service.getPermissionByKey('user1')).toEqual({
      key: 'USER1',
      units: ['unit1'],
    });
  });

  it('should return unit id by key', () => {
    expect(service.getUnitIdByKey('user2')).toBe('unit2');
  });

  it('should return units by key', () => {
    expect(service.getUnitsByKey('user1')).toEqual(['unit1']);
  });

  it('should update permissions', () => {
    service.updatePermissions([{ key: 'x', units: ['y'] }]);
    expect((service as unknown as ServiceInternals).writeJsonObjectFile).toHaveBeenCalledWith(
      'username-units.json',
      { permissions: [{ key: 'x', units: ['y'] }] },
    );
  });

  it('should update permission by key', () => {
    service.updatePermissionByKey('user1', { units: ['updated'] });
    expect((service as unknown as ServiceInternals).writeJsonObjectFile).toHaveBeenCalledWith(
      'username-units.json',
      {
        permissions: [
          { key: 'USER1', units: ['updated'] },
          { key: 'user2', units: ['unit2'] },
        ],
      },
    );
  });

  it('should throw error when updating non-existing permission key', () => {
    expect(() => service.updatePermissionByKey('missing', { units: ['x'] })).toThrow(
      'Permission with key missing not found',
    );
  });

  it('should return username-units mapping', () => {
    expect(service.getUsernameUnitsMapping()).toEqual({
      USER1: 'unit1',
      user2: 'unit2',
    });
  });

  // ===== DEFAULT SCENARIO =====
  it('should return latest default scenario', () => {
    expect(service.getDefaultScenario()).toEqual({ id: 'd2' });
  });

  // ===== UTILITY =====
  it('should generate unique id', () => {
    const id = service.generateId();
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Azure SDK mock – shared by both suites
// BlobServiceClient.fromConnectionString is mocked so NO real Azure call is made.
// ---------------------------------------------------------------------------
const uploadDataMock = jest.fn();
const downloadToBufferMock = jest.fn();
const getPropertiesMock = jest.fn().mockResolvedValue({ etag: 'v1', lastModified: new Date() });
const getBlockBlobClientMock = jest.fn((_name: string) => ({
  uploadData: uploadDataMock,
  downloadToBuffer: downloadToBufferMock,
  getProperties: getPropertiesMock,
}));
const createIfNotExistsMock = jest.fn().mockResolvedValue({});
const containerClientMock: { createIfNotExists: jest.Mock; getBlockBlobClient: jest.Mock } = {
  createIfNotExists: createIfNotExistsMock,
  getBlockBlobClient: getBlockBlobClientMock,
};

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(() => ({
      getContainerClient: jest.fn(() => containerClientMock),
    })),
  },
}));

/* =======================
   AZURE BLOB - UNIT TESTS
   Fully isolated: Azure SDK is mocked, no real credentials used.
======================= */
describe('JsonDataService - Azure Blob Unit Tests', () => {
  function buildSvc(prefix = '') {
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      'DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net';
    process.env.AZURE_BLOB_CONTAINER_NAME = 'json-data';
    process.env.AZURE_BLOB_PREFIX = prefix;
    const svc = new JsonDataService();
    // Inject mock container so no real network call is made
    (svc as unknown as ServiceInternals).containerClient = containerClientMock;
    (svc as unknown as ServiceInternals).containerReady = undefined;
    return svc;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    createIfNotExistsMock.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_BLOB_CONTAINER_NAME;
    delete process.env.AZURE_BLOB_PREFIX;
  });

  it('Upload JSON to Azure Blob successfully', async () => {
    uploadDataMock.mockResolvedValue({});
    const svc = buildSvc();
    (svc as unknown as ServiceInternals).azureEnabled = true;

    (svc as unknown as ServiceInternals).scheduleUploadJson('units.json', [{ id: 'u1' }]);
    await (svc as unknown as ServiceInternals).persistChain['units.json'];

    expect(uploadDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ blobHTTPHeaders: expect.any(Object) }),
    );
  });

  it('Download JSON from Azure Blob', async () => {
    downloadToBufferMock.mockResolvedValue(Buffer.from(JSON.stringify([{ id: 'u1' }]), 'utf-8'));
    const svc = buildSvc();

    const result = await (svc as unknown as ServiceInternals).downloadJsonObject('users.json', []);
    expect(result).toEqual([{ id: 'u1' }]);
  });

  it('Parse JSON correctly after download', async () => {
    const data = { permissions: [{ key: 'k1', units: ['unit1'] }] };
    downloadToBufferMock.mockResolvedValue(Buffer.from(JSON.stringify(data)));
    const svc = buildSvc();

    const result = await (svc as unknown as ServiceInternals).downloadJsonObject(
      'username-units.json',
      {
        permissions: [],
      },
    );
    expect(result).toEqual(data);
  });

  it('Handle file not found in Blob Storage', async () => {
    const err = new Error('BlobNotFound') as Error & { statusCode?: number };
    err.statusCode = 404;
    downloadToBufferMock.mockRejectedValue(err);
    const svc = buildSvc();

    const result = await (svc as unknown as ServiceInternals).downloadJsonObject(
      'missing.json',
      [],
    );
    expect(result).toEqual([]);
  });

  it('Handle invalid JSON data', async () => {
    downloadToBufferMock.mockResolvedValue(Buffer.from('NOT_JSON'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const svc = buildSvc();

    const result = await (svc as unknown as ServiceInternals).downloadJsonObject(
      'corrupt.json',
      [],
    );
    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });

  it('Handle upload failure (network/error)', async () => {
    const err = new Error('Network error') as Error & { statusCode?: number };
    err.statusCode = 500;
    uploadDataMock.mockRejectedValue(err);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const svc = buildSvc();
    (svc as unknown as ServiceInternals).azureEnabled = true;

    (svc as unknown as ServiceInternals).scheduleUploadJson('units.json', []);
    await (svc as unknown as ServiceInternals).persistChain['units.json'];

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('Validate Azure configuration per environment', () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      'DefaultEndpointsProtocol=https;AccountName=prod;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net';
    process.env.AZURE_BLOB_CONTAINER_NAME = 'prod-container';
    process.env.AZURE_BLOB_PREFIX = 'prod';
    const svc = new JsonDataService();
    expect((svc as unknown as ServiceInternals).azureEnabled).toBe(true);
    expect((svc as unknown as ServiceInternals).blobContainerName).toBe('prod-container');
    expect((svc as unknown as ServiceInternals).blobPrefix).toBe('prod');
  });

  it('Throw error when config is missing', () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = '';
    const svc = new JsonDataService();
    expect((svc as unknown as ServiceInternals).azureEnabled).toBe(false);
    expect((svc as unknown as ServiceInternals).containerClient).toBeUndefined();
  });

  it('Ensure no local file system usage', () => {
    const fsMock = jest.requireMock('fs');
    const svc = buildSvc();
    (svc as unknown as ServiceInternals).writeJsonFile('units.json', []);
    // fs module must never be called – all persistence goes through Azure mock
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(fsMock.readFileSync).not.toHaveBeenCalled();
  });

  it('Overwrite existing JSON file (if applicable)', async () => {
    uploadDataMock.mockResolvedValue({});
    const svc = buildSvc();
    (svc as unknown as ServiceInternals).azureEnabled = true;

    (svc as unknown as ServiceInternals).scheduleUploadJson('units.json', [{ id: 'v1' }]);
    (svc as unknown as ServiceInternals).scheduleUploadJson('units.json', [{ id: 'v2' }]);
    await (svc as unknown as ServiceInternals).persistChain['units.json'];

    expect(uploadDataMock).toHaveBeenCalledTimes(2);
    const lastBuf = uploadDataMock.mock.calls[1][0] as Buffer;
    expect(JSON.parse(lastBuf.toString())).toEqual([{ id: 'v2' }]);
  });
});

/* =======================
   AZURE BLOB - INTEGRATION TESTS
   Uses Azurite emulator connection string (UseDevelopmentStorage=true).
   The container client is replaced with an in-memory mock that simulates
   Azurite behaviour – no real network or credentials required.
======================= */
describe('JsonDataService - Azure Blob Integration Tests', () => {
  // In-memory blob store simulates Azurite local storage
  const blobStore: Record<string, Buffer> = {};
  let activeBlobName = '';

  const intUpload = jest.fn(async (data: Buffer) => {
    blobStore[activeBlobName] = data;
  });
  const intDownload = jest.fn(async (): Promise<Buffer> => {
    if (!blobStore[activeBlobName]) {
      const e = new Error('BlobNotFound') as Error & { statusCode?: number };
      e.statusCode = 404;
      throw e;
    }
    return blobStore[activeBlobName];
  });
  const intGetProperties = jest.fn().mockResolvedValue({ etag: 'v1', lastModified: new Date() });
  const intGetBlob = jest.fn((name: string) => {
    activeBlobName = name;
    return {
      uploadData: intUpload,
      downloadToBuffer: intDownload,
      getProperties: intGetProperties,
    };
  });
  const intContainer: { createIfNotExists: jest.Mock; getBlockBlobClient: jest.Mock } = {
    createIfNotExists: jest.fn().mockResolvedValue({}),
    getBlockBlobClient: intGetBlob,
  };

  // Azurite emulator connection string – no real Azure key needed
  function buildSvc(prefix = '') {
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.AZURE_BLOB_CONTAINER_NAME = 'json-data';
    process.env.AZURE_BLOB_PREFIX = prefix;
    const svc = new JsonDataService();
    // Replace container client with in-memory Azurite-like mock
    (svc as unknown as ServiceInternals).containerClient = intContainer;
    (svc as unknown as ServiceInternals).azureEnabled = true;
    (svc as unknown as ServiceInternals).containerReady = undefined;
    return svc;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(blobStore).forEach((k) => delete blobStore[k]);
    activeBlobName = '';
    intContainer.createIfNotExists.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_BLOB_CONTAINER_NAME;
    delete process.env.AZURE_BLOB_PREFIX;
  });

  it('Upload JSON via API and store in Blob', async () => {
    const svc = buildSvc();
    const unit = { id: 'u1', name: 'Unit 1' } as unknown as Unit;
    (svc as unknown as ServiceInternals).cache['units.json'] = [];
    svc.addUnit(unit);
    await (svc as unknown as ServiceInternals).persistChain['units.json'];

    expect(intUpload).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(blobStore['units.json'].toString());
    expect(stored).toContainEqual(unit);
  });

  it('Retrieve JSON via API from Blob', async () => {
    const data = [{ id: 's1', title: 'Scenario 1' }];
    blobStore['scenarios.json'] = Buffer.from(JSON.stringify(data));
    const svc = buildSvc();

    const result = await (svc as unknown as ServiceInternals).downloadJsonArray(
      'scenarios.json',
      [],
    );
    expect(result).toEqual(data);
  });

  it('Full flow: upload -> store -> fetch -> validate', async () => {
    const svc = buildSvc();
    const report = { id: 'r1', userId: 'u1', transcriptId: 't1' } as unknown as Report;
    (svc as unknown as ServiceInternals).cache['reports.json'] = [];
    svc.addReport(report);
    await (svc as unknown as ServiceInternals).persistChain['reports.json'];

    const fetched = await (svc as unknown as ServiceInternals).downloadJsonArray(
      'reports.json',
      [],
    );
    expect(fetched).toContainEqual(report);
  });

  it('Update JSON and verify latest data', async () => {
    const svc = buildSvc();
    (svc as unknown as ServiceInternals).cache['units.json'] = [{ id: 'u1', name: 'Old Name' }];
    svc.updateUnit('u1', { name: 'New Name' });
    await (svc as unknown as ServiceInternals).persistChain['units.json'];

    const fetched = (await (svc as unknown as ServiceInternals).downloadJsonArray(
      'units.json',
      [],
    )) as Array<Record<string, unknown>>;
    expect(fetched[0]).toMatchObject({ id: 'u1', name: 'New Name' });
  });

  it('Validate API works across environments', () => {
    // Build service with staging prefix – simulates a staging environment
    const svc = buildSvc('staging');
    expect((svc as unknown as ServiceInternals).getBlobName('users.json')).toBe(
      'staging/users.json',
    );
  });

  it('Handle missing blob in API response', async () => {
    const svc = buildSvc();
    const result = await (svc as unknown as ServiceInternals).downloadJsonArray(
      'nonexistent.json',
      [],
    );
    expect(result).toEqual([]);
  });

  it('Handle authentication failure for Blob access', async () => {
    const err = new Error('AuthenticationFailed') as Error & { code?: string; statusCode?: number };
    err.code = 'AuthenticationFailed';
    err.statusCode = 403;
    intDownload.mockRejectedValueOnce(err);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const svc = buildSvc();

    const result = await (svc as unknown as ServiceInternals).downloadJsonObject('users.json', []);
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'));
    consoleSpy.mockRestore();
  });

  it('Validate error handling for network issues', async () => {
    const err = new Error('ECONNRESET') as Error & { statusCode?: number };
    err.statusCode = 503;
    intDownload.mockRejectedValueOnce(err);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const svc = buildSvc();

    const result = await (svc as unknown as ServiceInternals).downloadJsonObject('units.json', []);
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
