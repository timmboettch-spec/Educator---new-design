import { JsonDataService } from './../../student-backend/data/json-data.service';
import { Global, Injectable, Logger, Module, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { StringDecoder } from 'node:string_decoder';
import { RedisService } from 'src/redis/redis.service';
import { blobFieldToString } from './blob-field.util';

@Injectable()
export class TutorPatientService implements OnModuleInit {
  private static readonly DEFAULT_SCENARIO_LOCALE = 'en' as const;
  private readonly logger = new Logger(TutorPatientService.name);
  private blobServiceClient?: BlobServiceClient;
  private readonly containerName: string;
  private readonly dataContainerName: string;
  private containerClient?: ContainerClient;
  private dataContainerClient?: ContainerClient;
  private readonly localJsonCache = new Map<string, { data: object[]; expiresAt: number }>();
  private readonly localBufferCache = new Map<string, { buffer: Buffer; expiresAt: number }>();
  private readonly unitsCache = new Map<string, Record<string, unknown>>();
  readonly scenariosMap = new Map<string, Record<string, unknown>>();
  private scenariosMapReady?: Promise<void>;
  private readonly lastReadSource = new Map<
    string,
    'local-cache' | 'redis' | 'memory-fallback' | 'blob'
  >();
  private readonly inflightBlobReads = new Map<string, Promise<object[]>>();
  private readonly overlayListCache = new Map<string, { names: string[]; expiresAt: number }>();
  private readonly inflightOverlayLists = new Map<string, Promise<string[]>>();
  private readonly mergedScenariosCache = new Map<string, { data: object[]; expiresAt: number }>();
  private readonly inflightMergedScenarios = new Map<string, Promise<object[]>>();
  private readonly cacheTtlMs: number;
  private readonly blobKeyPrefix: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jsonDataService: JsonDataService,
    @Optional() private readonly redisService?: RedisService,
  ) {
    const connectionString =
      this.configService.get<string>('AZURE_STORAGE_CONNECTION_STRING') ??
      this.configService.get<string>('edu_azure_storage_connection_string');
    this.containerName =
      this.configService.get<string>('AZURE_BLOB_CONTAINER_NAME') ??
      this.configService.get<string>('edu_azure_blob_container_name') ??
      'json-data';
    this.dataContainerName =
      this.configService.get<string>('AZURE_BLOB_DATA_CONTAINER_NAME') ?? this.containerName;

    if (connectionString) {
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      this.dataContainerClient = this.blobServiceClient.getContainerClient(this.dataContainerName);
    }

    this.blobKeyPrefix =
      this.configService.get<string>('REDIS_BLOB_KEY_PREFIX') ?? 'tutor-patient:blob:';

    const ttlRaw = this.configService.get<string>('REDIS_CACHE_TTL_SECONDS');
    const ttlParsed = ttlRaw ? parseInt(ttlRaw, 10) : NaN;
    this.cacheTtlMs = (Number.isFinite(ttlParsed) && ttlParsed > 0 ? ttlParsed : 300) * 1000;
  }

  onModuleInit(): void {
    void this.ensureScenariosMapLoaded().catch((err) => {
      this.logger.warn(
        `[onModuleInit] Could not pre-load scenario map (blob may be unreachable): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  private async ensureScenariosMapLoaded(): Promise<void> {
    if (!this.scenariosMapReady) {
      this.scenariosMapReady = this.loadAllScenarioFiles();
    }
    await this.scenariosMapReady;
  }

  async getScenarioByIdFromMap(id: string): Promise<Record<string, unknown> | null> {
    await this.ensureScenariosMapLoaded();
    const trimmed = id.trim();
    if (!trimmed) return null;
    return this.scenariosMap.get(trimmed) ?? null;
  }

  private async loadAllScenarioFiles(): Promise<void> {
    if (!this.containerClient) return;

    this.scenariosMap.clear();
    const prefixes = ['en/scenario/', 'es/scenario/'] as const;

    for (const prefix of prefixes) {
      try {
        for await (const blobItem of this.containerClient.listBlobsFlat({ prefix })) {
          if (!blobItem.name.endsWith('.json')) continue;
          const relName = blobItem.name.replace(/^\/+/, '');
          const scenario = await this.readIndividualJsonRecord(relName);
          const scenarioId = blobFieldToString(scenario?.['id']).trim();
          if (!scenario || !scenarioId) continue;
          if (!this.scenariosMap.has(scenarioId)) {
            this.scenariosMap.set(scenarioId, scenario);
          }
        }
      } catch (err) {
        this.logger.warn(
          `[loadAllScenarioFiles] Could not list blobs for prefix '${prefix}' — blob may be unreachable: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.jsonDataService.setScenarioCache(this.scenariosMap);

    this.logger.log(`[Scenarios] Loaded ${this.scenariosMap.size} scenarios from individual blobs`);
  }

  async getReports(): Promise<object[]> {
    return this.readBlob('reports.json');
  }

  async getTranscripts(): Promise<object[]> {
    return this.readBlob('transcripts.json');
  }

  async getTranscriptById(transcriptId: string): Promise<Record<string, unknown> | null> {
    const trimmed = transcriptId.trim();
    if (!trimmed) return null;

    const toRecord = (raw: unknown): Record<string, unknown> | null => {
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
      }
      if (Array.isArray(raw) && raw.length > 0) {
        return { messages: raw };
      }
      return null;
    };

    const blobCandidates = [
      `transcripts/${trimmed}.json`,
      `en/transcripts/${trimmed}.json`,
      `es/transcripts/${trimmed}.json`,
    ];

    for (const blobName of blobCandidates) {
      for (const useDataContainer of [false, true]) {
        if (useDataContainer && this.dataContainerName === this.containerName) continue;
        try {
          const raw = await this.readJsonBlobUnknown(blobName, useDataContainer);
          const result = toRecord(raw);
          if (result) {
            const msgCount = Array.isArray(result['messages'])
              ? (result['messages'] as unknown[]).length
              : 'N/A';
            this.logger.log(
              `[getTranscriptById] Transcript fetched from blob: ${blobName} | container: ${useDataContainer ? 'data' : 'main'} | messages: ${msgCount}`,
            );
            return result;
          }
        } catch (err) {
          this.logger.warn(
            `[getTranscriptById] Failed to read blob '${blobName}': ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const transcripts = await this.getTranscripts();
    const fromArray = transcripts.find((entry) => {
      const rec = entry as Record<string, unknown>;
      return blobFieldToString(rec['id']) === trimmed;
    }) as Record<string, unknown> | undefined;
    if (fromArray) return fromArray;

    this.logger.warn(`[getTranscriptById] Transcript not found: ${trimmed}`);
    return null;
  }

  async getScenarioById(id: string, ls?: string): Promise<Record<string, unknown> | null> {
    const trimmed = id.trim();
    if (!trimmed) return null;
    const normalize = (s: string): string => s.toLowerCase().replace(/[-_\s]+/g, '-');
    const normId = normalize(trimmed);
    const scenarios = (await this.getScenarios(ls)) as Record<string, unknown>[];
    return (
      scenarios.find((s) => {
        const rid = blobFieldToString(s['id']);
        return rid === trimmed || normalize(rid) === normId;
      }) ?? null
    );
  }
  getReportsSourceMessage(): string {
    const source = this.getBestSourceForBlobCandidates(['reports.json']);
    if (source === 'local-cache') return 'Local cache reports sent successfully.';
    if (source === 'redis') return 'Redis reports data sent successfully.';
    if (source === 'memory-fallback') return 'In-memory fallback reports sent successfully.';
    return 'Blob reports data sent successfully.';
  }

  getReportSourceLabel(): 'cache' | 'redis' | 'memory-fallback' | 'file' {
    const source = this.getBestSourceForBlobCandidates(['reports.json']);
    if (source === 'local-cache') return 'cache';
    if (source === 'redis') return 'redis';
    if (source === 'memory-fallback') return 'memory-fallback';
    return 'file';
  }

  async getReportsFresh(): Promise<object[]> {
    await this.clearCache('reports.json');
    return this.readBlob('reports.json');
  }

  async clearCache(blobName?: string): Promise<void> {
    if (blobName) {
      const scopedBlobNames = [
        this.getScopedBlobName(blobName, false),
        this.getScopedBlobName(blobName, true),
      ];

      for (const scopedBlobName of scopedBlobNames) {
        this.localJsonCache.delete(scopedBlobName);
        this.localBufferCache.delete(scopedBlobName);
        await this.redisService?.del(`${this.blobKeyPrefix}${scopedBlobName}`);
        await this.redisService?.del(`${this.blobKeyPrefix}buffer:${scopedBlobName}`);
      }

      this.overlayListCache.clear();
      this.mergedScenariosCache.clear();
    } else {
      const jsonKeys = Array.from(this.localJsonCache.keys());
      const bufferKeys = Array.from(this.localBufferCache.keys());
      this.localJsonCache.clear();
      this.localBufferCache.clear();
      this.overlayListCache.clear();
      this.mergedScenariosCache.clear();

      if (this.redisService) {
        for (const key of jsonKeys) {
          await this.redisService.del(`${this.blobKeyPrefix}${key}`);
        }
        for (const key of bufferKeys) {
          await this.redisService.del(`${this.blobKeyPrefix}buffer:${key}`);
        }
        await this.redisService.delByPrefix(this.blobKeyPrefix);
      }
    }
  }

  async getReportsByStudentIds(
    studentIds: string[],
  ): Promise<{ matched: object[]; isMatch: boolean }> {
    const normTargetSet = new Set(
      studentIds.map((id) => id.toUpperCase().replace(/[-_ ]/g, '')).filter(Boolean),
    );
    const all = (await this.readBlob('reports.json')) as Array<Record<string, unknown>>;

    const matched = all.filter((r) => {
      const val = (r['userId'] ??
        r['user_id'] ??
        r['UserID'] ??
        r['studentId'] ??
        r['student_id'] ??
        r['StudentId']) as string | undefined;
      return val ? normTargetSet.has(val.toUpperCase().replace(/[-_ ]/g, '')) : false;
    });

    return { matched, isMatch: matched.length > 0 };
  }

  async getReportsByStudentIdsFresh(
    studentIds: string[],
  ): Promise<{ matched: object[]; isMatch: boolean }> {
    await this.clearCache('reports.json');
    return this.getReportsByStudentIds(studentIds);
  }

  normalizeScenarioLocale(ls?: string): 'en' | 'es' {
    return ls?.toLowerCase() === 'es' ? 'es' : TutorPatientService.DEFAULT_SCENARIO_LOCALE;
  }

  private getScenarioBaseBlobCandidates(ls?: string): string[] {
    const locale = this.normalizeScenarioLocale(ls);
    if (locale === 'es') {
      return ['es/scenarios.json'];
    }
    return ['en/scenarios.json'];
  }

  private getScenarioOverlayPrefixes(ls?: string): string[] {
    const locale = this.normalizeScenarioLocale(ls);
    if (locale === 'es') {
      return ['es/scenario/', 'es/simulations/'];
    }
    return ['en/scenario/', 'en/simulations/', 'scenario/', 'simulations/'];
  }

  async getScenarios(ls?: string): Promise<object[]> {
    return this.getMergedScenarios(ls);
  }

  async getFreshScenarios(ls?: string): Promise<object[]> {
    await this.clearScenarioCaches(ls);
    return this.getMergedScenarios(ls);
  }

  async getAllScenariosDirect(ls?: string): Promise<object[]> {
    const localeKey = this.normalizeScenarioLocale(ls);
    const baseCandidates: string[] =
      localeKey === 'es' ? ['en/scenarios.json', 'es/scenarios.json'] : ['en/scenarios.json'];

    const mergedBaseById = new Map<string, Record<string, unknown>>();
    const baseWithoutId: Array<Record<string, unknown>> = [];

    for (const blobName of baseCandidates) {
      for (const useDataContainer of [false, true]) {
        const parsed = await this.readJsonBlob(blobName, useDataContainer).catch(() => null);

        const arr = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];

        for (const s of arr) {
          const id = this.extractScenarioId(s);

          if (!id) {
            baseWithoutId.push(s);
            continue;
          }

          if (!mergedBaseById.has(id) || blobName.startsWith('es/')) {
            mergedBaseById.set(id, {
              ...(mergedBaseById.get(id) ?? {}),
              ...s,
            });
          }
        }
      }
    }

    const baseScenarios: Array<Record<string, unknown>> = [
      ...mergedBaseById.values(),
      ...baseWithoutId,
    ];

    const overlayPrefixes =
      localeKey === 'es'
        ? ['en/scenario/', 'en/simulations/', 'es/scenario/', 'es/simulations/']
        : ['en/scenario/', 'en/simulations/'];

    const allOverlayLocations: Array<{
      blobName: string;
      useDataContainer: boolean;
    }> = [];

    const seenOverlayKeys = new Set<string>();

    for (const useDataContainer of [false, true]) {
      try {
        const containerClient = this.getContainerClient(useDataContainer);
        for (const prefix of overlayPrefixes) {
          try {
            for await (const blob of containerClient.listBlobsFlat({ prefix })) {
              if (!blob.name.endsWith('.json')) continue;
              const key = `${useDataContainer ? 'data' : 'main'}:${blob.name}`;
              if (seenOverlayKeys.has(key)) continue;
              seenOverlayKeys.add(key);
              allOverlayLocations.push({
                blobName: blob.name,
                useDataContainer,
              });
            }
          } catch {
            // prefix may not exist
          }
        }
      } catch {
        // container may not be configured
      }
    }

    const overlays: Array<Record<string, unknown>> = [];
    await Promise.all(
      allOverlayLocations.map(async ({ blobName, useDataContainer }) => {
        const parsed = await this.readJsonBlob(blobName, useDataContainer).catch(() => null);

        if (!parsed) return;

        const fallbackId = this.extractScenarioIdFromBlobName(blobName, overlayPrefixes);

        const records = Array.isArray(parsed)
          ? (parsed as Array<Record<string, unknown>>)
          : [parsed as Record<string, unknown>];
        for (const record of records) {
          overlays.push(
            !this.extractScenarioId(record) && fallbackId ? { ...record, id: fallbackId } : record,
          );
        }
      }),
    );

    const mergedById = new Map<string, Record<string, unknown>>();
    const withoutId: Array<Record<string, unknown>> = [];
    for (const s of baseScenarios) {
      const id = this.extractScenarioId(s);

      if (!id) {
        withoutId.push(s);
        continue;
      }

      mergedById.set(id, s);
    }
    for (const o of overlays) {
      const id = this.extractScenarioId(o);

      if (!id) {
        withoutId.push(o);
        continue;
      }

      mergedById.set(id, {
        ...(mergedById.get(id) ?? {}),
        ...o,
      });
    }

    this.logger.log(
      `[getAllScenariosDirect] locale=${localeKey} base=${baseScenarios.length} overlays=${overlays.length} merged=${mergedById.size}`,
    );

    return [...mergedById.values(), ...withoutId];
  }

  async getUnits(): Promise<object[]> {
    return this.readBlobFromAnyContainer('units.json');
  }

  async getFreshAllSimulationData(ls?: string): Promise<object[]> {
    await this.clearCache();
    await this.clearScenarioCaches(ls);
    await this.clearCache('units.json');
    return this.getAllSimulationData(ls);
  }

  async getAllSimulationData(ls?: string): Promise<object[]> {
    const [scenarios, units] = await Promise.all([
      this.getMergedScenarios(ls),
      this.readBlob('units.json'),
    ]);

    const unitMap = new Map<string, object>(
      (units as Array<Record<string, unknown>>).map((u) => [u['id'] as string, u]),
    );

    return (scenarios as Array<Record<string, unknown>>).map((scenario) => {
      const unitId = (scenario['unitId'] ?? scenario['unit_id']) as string | undefined;
      const unit = unitId
        ? (unitMap.get(unitId) as Record<string, unknown> | undefined)
        : undefined;
      const scenarioImage =
        ((scenario['scenarioImage'] ??
          scenario['image_url'] ??
          scenario['imageUrl'] ??
          unit?.['imageUrl']) as string | null) ?? null;
      return { ...scenario, unit: unit ?? null, scenarioImage };
    });
  }

  getSimulationSourceMessage(ls?: string): string {
    const scenarioCandidates = this.getScenarioBaseBlobCandidates(ls);
    const source = this.getBestSourceForBlobCandidates([...scenarioCandidates, 'units.json']);
    if (source === 'local-cache') return 'Local cache simulations sent successfully.';
    if (source === 'redis') return 'Redis simulations data sent successfully.';
    if (source === 'memory-fallback') return 'In-memory fallback simulations sent successfully.';
    return 'Blob simulations data sent successfully.';
  }

  getSimulationSourceLabel(ls?: string): 'cache' | 'redis' | 'memory-fallback' | 'file' {
    const scenarioCandidates = this.getScenarioBaseBlobCandidates(ls);
    const source = this.getBestSourceForBlobCandidates([...scenarioCandidates, 'units.json']);
    if (source === 'local-cache') return 'cache';
    if (source === 'redis') return 'redis';
    if (source === 'memory-fallback') return 'memory-fallback';
    return 'file';
  }

  private extractScenarioId(scenario: Record<string, unknown>): string | undefined {
    const value = scenario['id'] ?? scenario['scenarioId'] ?? scenario['scenario_id'];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private async listScenarioOverlayBlobNames(
    prefixes: string[],
    useDataContainer = false,
  ): Promise<string[]> {
    const cacheKey = `${useDataContainer ? 'data' : 'main'}:${prefixes.join('|')}`;
    const now = Date.now();

    const cached = this.overlayListCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.logger.debug?.(`[overlayList] HIT key=${cacheKey} names=${cached.names.length}`);
      return cached.names;
    }

    const inflight = this.inflightOverlayLists.get(cacheKey);
    if (inflight) {
      this.logger.debug?.(`[overlayList] INFLIGHT key=${cacheKey}`);
      return inflight;
    }

    this.logger.debug?.(`[overlayList] MISS key=${cacheKey}`);
    const listPromise = (async (): Promise<string[]> => {
      const listStart = Date.now();
      try {
        const containerClient = this.getContainerClient(useDataContainer);
        const names = new Set<string>();

        for (const prefix of prefixes) {
          for await (const blob of containerClient.listBlobsFlat({ prefix })) {
            if (blob.name.endsWith('.json')) {
              names.add(blob.name);
            }
          }
        }

        const result = Array.from(names.values());
        this.overlayListCache.set(cacheKey, {
          names: result,
          expiresAt: Date.now() + this.cacheTtlMs,
        });
        this.logger.log(
          `[overlayList] FETCHED key=${cacheKey} names=${result.length} in ${Date.now() - listStart}ms`,
        );
        return result;
      } finally {
        this.inflightOverlayLists.delete(cacheKey);
      }
    })();

    this.inflightOverlayLists.set(cacheKey, listPromise);
    return listPromise;
  }

  private async listAllScenarioOverlayLocations(
    prefixes: string[],
  ): Promise<Array<{ blobName: string; useDataContainer: boolean }>> {
    const [mainNames, dataNames] = await Promise.all([
      this.listScenarioOverlayBlobNames(prefixes, false).catch((): string[] => []),
      this.listScenarioOverlayBlobNames(prefixes, true).catch((): string[] => []),
    ]);

    return [
      ...mainNames.map((blobName) => ({ blobName, useDataContainer: false })),
      ...dataNames.map((blobName) => ({ blobName, useDataContainer: true })),
    ];
  }

  private getScenarioOverlayProbeLocations(
    baseScenarios: Array<Record<string, unknown>>,
    prefixes: string[],
  ): Array<{ blobName: string; useDataContainer: boolean }> {
    const locations: Array<{ blobName: string; useDataContainer: boolean }> = [];
    const seen = new Set<string>();

    for (const scenario of baseScenarios) {
      const id = this.extractScenarioId(scenario);
      if (!id) continue;

      for (const prefix of prefixes) {
        for (const useDataContainer of [false, true]) {
          const blobName = `${prefix}${id}.json`;
          const key = `${useDataContainer ? 'data' : 'main'}:${blobName}`;
          if (seen.has(key)) continue;
          seen.add(key);
          locations.push({ blobName, useDataContainer });
        }
      }
    }

    return locations;
  }

  private async readScenarioOverlayBlobs(
    baseScenarios: Array<Record<string, unknown>>,
    ls?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const overlayPrefixes = this.getScenarioOverlayPrefixes(ls);
    let overlayLocations = await this.listAllScenarioOverlayLocations(overlayPrefixes);
    if (overlayLocations.length === 0) {
      const probeLocations = this.getScenarioOverlayProbeLocations(baseScenarios, overlayPrefixes);
      this.logger.log(
        `[newScenario] list returned 0; probing known ids for overlays: ${probeLocations.length} candidate file(s).`,
      );
      overlayLocations = probeLocations;
    }

    if (overlayLocations.length === 0) {
      this.logger.log('[newScenario] No overlay files found in scenario/ or simulations/.');
      return [];
    }

    const scenarioFolderCount = overlayLocations.filter(({ blobName }) =>
      blobName.startsWith('scenario/'),
    ).length;
    const simulationsFolderCount = overlayLocations.filter(({ blobName }) =>
      blobName.startsWith('simulations/'),
    ).length;
    const dataContainerCount = overlayLocations.filter(
      ({ useDataContainer }) => useDataContainer,
    ).length;
    const mainContainerCount = overlayLocations.length - dataContainerCount;

    this.logger.log(
      `[newScenario] overlay files found -> scenario/: ${scenarioFolderCount}, simulations/: ${simulationsFolderCount}, main-container: ${mainContainerCount}, data-container: ${dataContainerCount}`,
    );

    const rawOverlayValues = await Promise.all(
      overlayLocations.map(async ({ blobName, useDataContainer }) => {
        try {
          return await this.readJsonBlobUnknown(blobName, useDataContainer);
        } catch {
          return null;
        }
      }),
    );

    const overlays: Array<Record<string, unknown>> = [];
    for (let i = 0; i < rawOverlayValues.length; i += 1) {
      const value = rawOverlayValues[i];
      const blobName = overlayLocations[i].blobName;
      const fallbackId = this.extractScenarioIdFromBlobName(blobName, overlayPrefixes);

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>;
            if (!this.extractScenarioId(record) && fallbackId) {
              overlays.push({ ...record, id: fallbackId });
            } else {
              overlays.push(record);
            }
          }
        }
      } else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (!this.extractScenarioId(record) && fallbackId) {
          overlays.push({ ...record, id: fallbackId });
        } else {
          overlays.push(record);
        }
      }
    }

    this.logger.log(`[newScenario] overlay records parsed: ${overlays.length}`);

    return overlays;
  }

  private extractScenarioIdFromBlobName(blobName: string, prefixes: string[]): string | undefined {
    for (const prefix of prefixes) {
      if (!blobName.startsWith(prefix)) {
        continue;
      }

      const fileName = blobName.slice(prefix.length);
      if (!fileName.endsWith('.json')) {
        return undefined;
      }

      const lastSegment = fileName.split('/').pop() ?? fileName;
      const scenarioId = lastSegment.slice(0, -'.json'.length).trim();
      return scenarioId.length > 0 ? scenarioId : undefined;
    }

    return undefined;
  }

  private async clearScenarioCaches(ls?: string): Promise<void> {
    this.overlayListCache.clear();
    this.mergedScenariosCache.clear();
    this.inflightMergedScenarios.clear();
    this.inflightOverlayLists.clear();
    this.localJsonCache.clear();
    this.localBufferCache.clear();
    if (this.redisService) {
      await this.redisService.delByPrefix(this.blobKeyPrefix).catch(() => {});
    }
    const baseBlobCandidates = this.getScenarioBaseBlobCandidates(ls);
    for (const scenarioBlobName of baseBlobCandidates) {
      await this.clearCache(scenarioBlobName);
    }
    let overlayLocations: Array<{ blobName: string; useDataContainer: boolean }> = [];
    try {
      overlayLocations = await this.listAllScenarioOverlayLocations(
        this.getScenarioOverlayPrefixes(ls),
      );
    } catch {
      overlayLocations = [];
    }
    await Promise.all(overlayLocations.map(({ blobName }) => this.clearCache(blobName)));

    const localeKey = this.normalizeScenarioLocale(ls);
    this.mergedScenariosCache.delete(localeKey);
  }

  private async getMergedScenarios(ls?: string): Promise<object[]> {
    const localeKey = this.normalizeScenarioLocale(ls);

    const cached = this.mergedScenariosCache.get(localeKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.log(`[mergedScenarios] cache hit locale=${localeKey}`);
      return cached.data;
    }

    const inflight = this.inflightMergedScenarios.get(localeKey);
    if (inflight) {
      this.logger.log(`[mergedScenarios] joining inflight request locale=${localeKey}`);
      return inflight;
    }

    this.logger.log(`[mergedScenarios] cache miss — reading from blob locale=${localeKey}`);
    const t0 = Date.now();
    const work = (async (): Promise<Record<string, unknown>[]> => {
      try {
        const baseStart = Date.now();
        const baseScenarios = (await this.readBaseScenarios(ls)) as Array<Record<string, unknown>>;
        const baseMs = Date.now() - baseStart;
        const overlayStart = Date.now();
        const overlayPrefixes = this.getScenarioOverlayPrefixes(ls);
        const listStart = Date.now();
        const overlayLocations = await this.listAllScenarioOverlayLocations(overlayPrefixes);
        const overlayListMs = Date.now() - listStart;
        const downloadStart = Date.now();
        const overlays = await this.readScenarioOverlayBlobs(baseScenarios, ls);
        const downloadParseMs = Date.now() - downloadStart;
        const overlayTotalMs = Date.now() - overlayStart;
        const mergeStart = Date.now();
        const mergedById = new Map<string, Record<string, unknown>>();
        const withoutId: Array<Record<string, unknown>> = [];

        for (const scenario of baseScenarios) {
          const id = this.extractScenarioId(scenario);
          if (!id) {
            withoutId.push(scenario);
            continue;
          }
          mergedById.set(id, scenario);
        }

        for (const overlay of overlays) {
          const id = this.extractScenarioId(overlay);
          if (!id) {
            withoutId.push(overlay);
            continue;
          }

          const base = mergedById.get(id);
          mergedById.set(id, base ? { ...base, ...overlay } : overlay);
        }

        const merged = [...mergedById.values(), ...withoutId];
        const mergeMs = Date.now() - mergeStart;

        const totalMs = Date.now() - t0;
        this.logger.log(
          `[mergedScenarios] DIRECT-BLOB locale=${localeKey} base=${baseScenarios.length} ` +
            `overlays=${overlays.length} overlayLocations=${overlayLocations.length} ` +
            `final=${merged.length} total=${totalMs}ms | ` +
            `baseMs=${baseMs}ms overlayListMs=${overlayListMs}ms ` +
            `downloadParseMs=${downloadParseMs}ms overlayTotalMs=${overlayTotalMs}ms ` +
            `mergeMs=${mergeMs}ms`,
        );

        this.mergedScenariosCache.set(localeKey, {
          data: merged,
          expiresAt: Date.now() + this.cacheTtlMs,
        });
        return merged;
      } catch (error) {
        this.logger.error(`[mergedScenarios] Error reading directly from blob: ${error}`);
        throw error;
      } finally {
        this.inflightMergedScenarios.delete(localeKey);
      }
    })();

    this.inflightMergedScenarios.set(localeKey, work);
    return work;
  }

  private async readBaseScenarios(ls?: string): Promise<object[]> {
    const baseBlobCandidates = this.getScenarioBaseBlobCandidates(ls);
    const candidateData = await Promise.all(
      baseBlobCandidates.map(async (blobName) => ({
        blobName,
        data: await this.readBlobFromAnyContainer(blobName),
      })),
    );

    const firstNonEmpty = candidateData.find((entry) => entry.data.length > 0);
    if (firstNonEmpty) {
      this.logger.log(
        `[newScenario] base scenarios source: ${firstNonEmpty.blobName} (${firstNonEmpty.data.length}).`,
      );
      return firstNonEmpty.data;
    }

    this.logger.log(
      `[newScenario] base scenarios source not found for locale '${this.normalizeScenarioLocale(ls)}'.`,
    );
    return [];
  }

  async writeBlob(blobName: string, data: object[]): Promise<void> {
    if (!this.blobServiceClient) throw new Error('[TutorPatient] Blob not configured');
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const content = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(content, 'utf-8');
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });

    await this.clearCache(blobName);
  }

  private async readBlob(blobName: string): Promise<object[]> {
    return this.readBlobFromContainer(blobName, false);
  }

  private getScopedBlobName(blobName: string, useDataContainer: boolean): string {
    return `${useDataContainer ? 'data' : 'main'}:${blobName}`;
  }

  private getBestSourceForBlobCandidates(
    blobCandidates: string[],
  ): 'local-cache' | 'redis' | 'memory-fallback' | 'blob' {
    const priority: Array<'local-cache' | 'redis' | 'memory-fallback' | 'blob'> = [
      'local-cache',
      'redis',
      'memory-fallback',
      'blob',
    ];

    for (const level of priority) {
      for (const blobName of blobCandidates) {
        const mainKey = this.getScopedBlobName(blobName, false);
        const dataKey = this.getScopedBlobName(blobName, true);
        if (
          this.lastReadSource.get(mainKey) === level ||
          this.lastReadSource.get(dataKey) === level
        ) {
          return level;
        }
      }
    }

    return 'blob';
  }

  private async readBlobFromAnyContainer(blobName: string): Promise<object[]> {
    const mainData = await this.readBlobFromContainer(blobName, false);
    if (mainData.length > 0 || this.dataContainerName === this.containerName) {
      return mainData;
    }

    const dataContainerData = await this.readBlobFromContainer(blobName, true);
    if (dataContainerData.length > 0) {
      this.logger.log(
        `[newScenario] ${blobName} loaded from data container fallback (${dataContainerData.length}).`,
      );
    }
    return dataContainerData;
  }

  private async readBlobFromContainer(
    blobName: string,
    useDataContainer: boolean,
  ): Promise<object[]> {
    if (!this.blobServiceClient) {
      this.logger.error(
        `[readBlob] blobServiceClient is NOT configured — skipping read of '${blobName}'. ` +
          `Check edu_azure_storage_connection_string in .env`,
      );
      return [];
    }

    const scopedBlobName = this.getScopedBlobName(blobName, useDataContainer);
    const cacheKey = `${this.blobKeyPrefix}${scopedBlobName}`;
    const now = Date.now();

    if (this.redisService) {
      const cached = await this.redisService.get<object[]>(cacheKey);
      if (cached !== null) {
        this.localJsonCache.set(scopedBlobName, { data: cached, expiresAt: now + this.cacheTtlMs });
        const source = this.redisService.isRedisConnected ? 'redis' : 'memory-fallback';
        this.lastReadSource.set(scopedBlobName, source);
        const label = source === 'redis' ? 'Redis Cache' : 'In-Memory Cache';
        this.logger.log(`[Cache] Source: ${label} - ${scopedBlobName}`);
        return cached;
      }
    }

    const localHit = this.localJsonCache.get(scopedBlobName);
    if (localHit && localHit.expiresAt > now) {
      this.lastReadSource.set(scopedBlobName, 'local-cache');
      this.logger.log(`[Cache] Source: Local Cache - ${scopedBlobName}`);
      return localHit.data;
    }

    const inflight = this.inflightBlobReads.get(scopedBlobName);
    if (inflight) {
      return inflight;
    }

    const downloadPromise = (async (): Promise<object[]> => {
      try {
        const parsed = await this.readJsonBlob(blobName, useDataContainer);
        const data = Array.isArray(parsed) ? parsed : [];
        this.localJsonCache.set(scopedBlobName, { data, expiresAt: Date.now() + this.cacheTtlMs });
        this.lastReadSource.set(scopedBlobName, 'blob');
        this.logger.log(
          `[Cache] Source: Azure Blob Storage - ${scopedBlobName} (${data.length} records)`,
        );
        if (this.redisService && data.length > 0) {
          await this.redisService.set(cacheKey, data);
        }
        return data;
      } catch {
        return [];
      } finally {
        this.inflightBlobReads.delete(scopedBlobName);
      }
    })();

    this.inflightBlobReads.set(scopedBlobName, downloadPromise);
    return downloadPromise;
  }

  parseSeatTokensFromSku(sku?: string): number {
    if (!sku) return 0;

    const aiSeatMatch = sku.match(/AI-SEAT-(\d+)/i);
    if (aiSeatMatch) return parseInt(aiSeatMatch[1], 10);

    const aiSuffixMatch = sku.match(/-AI(\d+)$/i);
    if (aiSuffixMatch) return parseInt(aiSuffixMatch[1], 10);

    const trailingMatch = sku.match(/-(\d+)$/);
    if (trailingMatch) return parseInt(trailingMatch[1], 10);

    return 0;
  }

  private async readBlobStrict(blobName: string): Promise<object[]> {
    const parsed = await this.readJsonBlob(blobName);
    const data = Array.isArray(parsed) ? parsed : [];
    return data;
  }

  private getContainerClient(useDataContainer = false): ContainerClient {
    if (!this.blobServiceClient) {
      throw new Error('Azure Blob Storage is not configured.');
    }

    if (useDataContainer) {
      if (!this.dataContainerClient) {
        this.dataContainerClient = this.blobServiceClient.getContainerClient(
          this.dataContainerName,
        );
      }
      return this.dataContainerClient;
    }

    if (!this.containerClient) {
      this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    }
    return this.containerClient;
  }

  private static getBlobDownloadTimeoutMs(): number {
    const raw = process.env.BLOB_DOWNLOAD_TIMEOUT_MS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 20_000;
  }

  private async getFileBuffer(fileName: string, useDataContainer = false): Promise<Buffer> {
    const scopedBlobName = this.getScopedBlobName(fileName, useDataContainer);
    const cacheKey = `${this.blobKeyPrefix}buffer:${scopedBlobName}`;
    const now = Date.now();

    const localHit = this.localBufferCache.get(scopedBlobName);
    if (localHit && localHit.expiresAt > now) {
      return localHit.buffer;
    }

    if (this.redisService) {
      const cachedBuffer = await this.redisService.get<string>(cacheKey);
      if (cachedBuffer) {
        const buffer = Buffer.from(cachedBuffer, 'base64');
        this.localBufferCache.set(scopedBlobName, { buffer, expiresAt: now + this.cacheTtlMs });
        return buffer;
      }
    }

    const containerClient = this.getContainerClient(useDataContainer);
    const blobClient = containerClient.getBlockBlobClient(fileName);
    const abortSignal = AbortSignal.timeout(TutorPatientService.getBlobDownloadTimeoutMs());
    const downloadResponse = await blobClient.download(0, undefined, { abortSignal });

    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Blob not found: ${fileName}`);
    }

    const chunks: Buffer[] = [];
    try {
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    } finally {
      if (
        downloadResponse.readableStreamBody &&
        typeof downloadResponse.readableStreamBody.destroy === 'function'
      ) {
        downloadResponse.readableStreamBody.destroy();
      }
    }

    let buffer: Buffer;
    if (chunks.length === 0) {
      buffer = Buffer.alloc(0);
    } else if (chunks.length === 1) {
      buffer = chunks[0];
    } else {
      buffer = Buffer.concat(chunks);
    }

    if (buffer.length > 0) {
      this.localBufferCache.set(scopedBlobName, { buffer, expiresAt: now + this.cacheTtlMs });
    }
    if (this.redisService && buffer.length > 0) {
      await this.redisService.set(cacheKey, buffer.toString('base64'));
    }

    return buffer;
  }

  private async readJsonBlob(blobName: string, useDataContainer = false): Promise<object[]> {
    const buffer = await this.getFileBuffer(blobName, useDataContainer);
    return JSON.parse(buffer.toString('utf8')) as object[];
  }

  private async readJsonBlobUnknown(blobName: string, useDataContainer = false): Promise<unknown> {
    const buffer = await this.getFileBuffer(blobName, useDataContainer);
    return JSON.parse(buffer.toString('utf8')) as unknown;
  }

  async getSalesOrderByRedeemCode(
    redeemCode: string,
  ): Promise<{ found: boolean; lines: Array<Record<string, unknown>> }> {
    const cleanCode = redeemCode.trim().toUpperCase();
    const allLines = (await this.readBlobStrict('sales-order-lines.json')) as Array<
      Record<string, unknown>
    >;

    const matched = allLines.filter(
      (line) => (line['redeem_code'] as string)?.trim().toUpperCase() === cleanCode,
    );

    const enriched = matched.map((line) => ({
      ...line,
      ai_seats: this.parseSeatTokensFromSku(line['sku'] as string) * (line['qty'] as number),
    }));

    return {
      found: matched.length > 0,
      lines: enriched,
    };
  }

  private async readIndividualJsonRecord(
    blobName: string,
  ): Promise<Record<string, unknown> | null> {
    const candidates = [false, true] as const;
    for (const useDataContainer of candidates) {
      if (useDataContainer && this.dataContainerName === this.containerName) continue;
      try {
        const data = await this.readJsonBlobUnknown(blobName, useDataContainer);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          return data as Record<string, unknown>;
        }
      } catch (err) {
        this.logger.warn(
          `[readTranscriptBlob] Failed to read blob '${blobName}': ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return null;
  }

  async getUnitById(id: string): Promise<Record<string, unknown> | null> {
    const trimmed = id.trim();
    if (!trimmed) return null;

    const cached = this.unitsCache.get(trimmed);
    if (cached) return cached;

    const units = (await this.getUnits()) as Record<string, unknown>[];
    for (const unit of units) {
      const unitId = blobFieldToString(unit['id']).trim();
      if (unitId) this.unitsCache.set(unitId, unit);
    }

    return this.unitsCache.get(trimmed) ?? null;
  }

  async getReportByIdFresh(id: string): Promise<Record<string, unknown> | null> {
    const individual = await this.readIndividualJsonRecord(`reports/${id}.json`);
    if (individual) return individual;

    const cached = (await this.getReports()) as Record<string, unknown>[];
    return cached.find((report) => blobFieldToString(report['id']) === id) ?? null;
  }

  async getReportByTranscriptIdFresh(
    transcriptId: string,
  ): Promise<Record<string, unknown> | null> {
    const findByTranscript = (reports: Record<string, unknown>[]): Record<string, unknown> | null =>
      reports.find(
        (report) =>
          blobFieldToString(report['transcriptId'] ?? report['transcript_id']) === transcriptId,
      ) ?? null;

    return findByTranscript((await this.getReports()) as Record<string, unknown>[]);
  }

  async getTranscriptByIdFresh(id: string): Promise<Record<string, unknown> | null> {
    const individual = await this.readIndividualJsonRecord(`transcripts/${id}.json`);
    if (individual) return individual;

    const fromService = await this.getTranscriptById(id);
    if (fromService) return fromService;

    const transcripts = (await this.getTranscripts()) as Record<string, unknown>[];
    return transcripts.find((entry) => blobFieldToString(entry['id']) === id) ?? null;
  }

  async getScenarioByIdFresh(id: string, ls?: string): Promise<Record<string, unknown> | null> {
    const trimmed = id.trim();
    if (!trimmed) return null;

    const preferredLang = ls === 'es' ? 'es' : 'en';
    const langs: Array<'en' | 'es'> = preferredLang === 'es' ? ['es', 'en'] : ['en', 'es'];

    for (const lang of langs) {
      const individual = await this.readIndividualJsonRecord(`${lang}/scenario/${trimmed}.json`);
      if (individual) {
        const scenarioId = blobFieldToString(individual['id'] ?? trimmed).trim();
        if (scenarioId) this.scenariosMap.set(scenarioId, individual);
        return individual;
      }
    }

    const fromMap = await this.getScenarioByIdFromMap(trimmed);
    if (fromMap) return fromMap;

    return this.getScenarioById(trimmed, ls);
  }

  async getFile(fileName: string, useDataContainer = false): Promise<string> {
    if (!this.blobServiceClient) {
      throw new Error('Azure Blob Storage is not configured.');
    }

    const containerName = useDataContainer ? this.dataContainerName : this.containerName;
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    const downloadResponse = await blockBlobClient.download();

    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Blob not found: ${fileName}`);
    }

    const decoder = new StringDecoder('utf8');
    const contentParts: string[] = [];
    try {
      for await (const chunk of downloadResponse.readableStreamBody) {
        contentParts.push(Buffer.isBuffer(chunk) ? decoder.write(chunk) : chunk);
      }
      contentParts.push(decoder.end());
    } finally {
      if (
        downloadResponse.readableStreamBody &&
        typeof downloadResponse.readableStreamBody.destroy === 'function'
      ) {
        downloadResponse.readableStreamBody.destroy();
      }
    }
    return contentParts.join('');
  }
}

@Global()
@Module({
  providers: [TutorPatientService],
  exports: [TutorPatientService],
})
export class TutorPatientModule {}
