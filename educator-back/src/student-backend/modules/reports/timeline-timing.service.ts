import { Injectable } from '@nestjs/common';

import { type MedicationsAnalysisResult, type VitalsAnalysisResult } from './types/scoring.types';

// --- Vital time-window constants (seconds) ---------------------------------
const VITAL_TIME_LIMIT_5_MIN_S = 300; //  5 minutes
const VITAL_TIME_LIMIT_10_MIN_S = 600; // 10 minutes
const VITAL_TIME_LIMIT_15_MIN_S = 900; // 15 minutes
const VITAL_TIME_LIMIT_30_MIN_S = 1800; // 30 minutes

export interface VitalReading {
  title?: string;
  details?: string;
  timestamp?: string | number | Date;
  timestampValue?: number;
  elapsedTime?: string;
  elapsedSeconds?: number;
}

export interface StudentSummary {
  medications?: Array<string | { title?: string; name?: string }>;
  vitals?: Record<string, VitalReading[]> | VitalReading[];
  actions?: unknown;
  patientData?: unknown;
  followUp?: unknown;
  assessmentNarrative?: unknown;
  [key: string]: unknown;
}

export interface MedicationsItem {
  expectedActions?: Array<string | { name?: string }>;
}

export interface VitalConfigObject {
  field: string;
  status: string;
}

export type VitalConfig = string | VitalConfigObject;

export interface TimingInterval {
  from: number;
  to: number;
  intervalSeconds: number;
  intervalFormatted: string;
  withinLimit: boolean;
  fromReading?: string;
  toReading?: string;
  fromTimestamp?: string | number | Date;
  toTimestamp?: string | number | Date;
}

export interface VitalTimingAnalysis {
  vital: string;
  requirement: string;
  type: 'required' | 'reassess';
  timeTakenSeconds?: number;
  timeTakenFormatted?: string;
  timeLimit: number;
  timeLimitFormatted: string;
  withinTimeLimit: boolean;
  status: string;
  actionTitle?: string;
  readingValue?: string;
  readingsCount?: number;
  hasReassessment?: boolean;
  firstReadingTimeTaken?: number;
  firstReadingTimeTakenFormatted?: string;
  firstReadingOnTime?: boolean;
  intervals?: TimingInterval[];
  allIntervalsWithinLimit?: boolean;
  readings?: Array<{
    index: number;
    value?: string;
    timestamp?: string | number | Date;
    elapsedTime?: string;
    elapsedSeconds?: number;
  }>;
}

interface EnrichableItem {
  elapsedSeconds?: number;
  elapsedTimeFormatted?: string;
  timestamp?: string | number | Date;
  timestampValue?: number;
  [key: string]: unknown;
}

@Injectable()
export class TimelineTimingService {
  /** Converts a total-seconds count into a human-readable string. */
  formatSecondsToTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes === 0) {
      return `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
    }
    if (remainingSeconds === 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }

  /**
   * Adds elapsedSeconds / elapsedTimeFormatted to timeline items that are missing them.
   */
  enrichTimingData(data: unknown, scenarioStart: number): unknown {
    if (!data) {
      return data;
    }

    const enrichItem = (item: unknown): unknown => {
      if (item && typeof item === 'object') {
        const obj = item as EnrichableItem;
        if (obj.elapsedSeconds === undefined && (obj.timestamp ?? obj.timestampValue)) {
          const itemTime =
            obj.timestampValue ?? (obj.timestamp ? new Date(obj.timestamp).getTime() : 0);
          obj.elapsedSeconds = Math.max(0, Math.round((itemTime - scenarioStart) / 1000));
          obj.elapsedTimeFormatted = this.formatSecondsToTime(obj.elapsedSeconds);
        }
      }
      return item;
    };

    if (Array.isArray(data)) {
      return data.map(enrichItem);
    }

    if (typeof data === 'object') {
      const enriched = { ...data } as Record<string, unknown>;
      Object.keys(enriched).forEach((key) => {
        const value = enriched[key];
        if (Array.isArray(value)) {
          enriched[key] = value.map(enrichItem);
        } else if (value && typeof value === 'object') {
          enriched[key] = enrichItem(value);
        }
      });
      return enriched;
    }

    return data;
  }

  /**
   * Deterministic medications analysis.
   * Compares student-administered medications against rubric-configured required medications.
   */
  computeMedicationsAnalysis(
    studentSummary: StudentSummary | null | undefined,
    medicationsItem: MedicationsItem | null | undefined,
  ): MedicationsAnalysisResult {
    const requiredMeds = medicationsItem?.expectedActions ?? [];
    const studentMeds = studentSummary?.medications ?? [];

    const medicationsGiven: string[] = [];
    const medicationsMissed: string[] = [];

    requiredMeds.forEach((reqMed) => {
      const medName = String(
        typeof reqMed === 'object' && reqMed !== null ? (reqMed.name ?? '') : reqMed,
      ).toLowerCase();
      const found = studentMeds.some((sm) => {
        const smName = String(
          typeof sm === 'object' && sm !== null ? (sm.title ?? sm.name ?? '') : (sm ?? ''),
        );
        return smName.toLowerCase().includes(medName);
      });

      if (found) {
        medicationsGiven.push(medName);
      } else {
        medicationsMissed.push(medName);
      }
    });

    return {
      requiredMedications: requiredMeds,
      medicationsGiven,
      medicationsMissed,
    };
  }

  /**
   * Deterministic vitals analysis.
   *
   * Supports new summaryByCategory.vitals structure (object keyed by vital name)
   * as well as the legacy flat-array structure.
   *
   * Handles two requirement types:
   * - "Required Within X minutes": first reading must be within X minutes of scenario start
   * - "Reassess Within X minutes": all subsequent readings must be within X minutes of each other
   */
  computeVitalsAnalysisFromSummary(
    studentSummary: StudentSummary | null | undefined,
    requiredVitals: VitalConfig[],
    scenarioStartTime?: string,

    _actionsTimeline?: unknown[],
  ): VitalsAnalysisResult {
    const fieldToDisplayName: Record<string, string> = {
      heartRate: 'Heart Rate',
      bloodPressure: 'Blood Pressure',
      respiratoryRate: 'Respiratory Rate',
      temperature: 'Temperature',
      spO2: 'SpO2',
      weight: 'Weight',
      height: 'Height',
      'Heart Rate': 'Heart Rate',
      'Blood Pressure': 'Blood Pressure',
      'Respiratory Rate': 'Respiratory Rate',
      Temperature: 'Temperature',
      SpO2: 'SpO2',
      Weight: 'Weight',
      Height: 'Height',
    };

    const keywordMap: Record<string, string[]> = {
      heartRate: ['heart rate', 'hr', 'pulse'],
      bloodPressure: ['blood pressure', 'bp'],
      respiratoryRate: ['respiratory rate', 'rr', 'respiration'],
      temperature: ['temperature', 'temp'],
      spO2: ['spo2', 'oxygen', 'o2', 'sat', 'saturation'],
      weight: ['weight'],
      height: ['height'],
    };

    const vitalsTaken: string[] = [];
    const vitalsMissing: string[] = [];
    const timingAnalysis: VitalTimingAnalysis[] = [];

    const scenarioStart = scenarioStartTime ? new Date(scenarioStartTime).getTime() : null;

    const vitalsFromCategory = studentSummary?.vitals;
    const legacyVitalsEntries = Array.isArray(vitalsFromCategory) ? vitalsFromCategory : [];

    (requiredVitals || []).forEach((vitalConfig) => {
      const vitalField = typeof vitalConfig === 'string' ? vitalConfig : vitalConfig.field;
      const timeRequirement =
        typeof vitalConfig === 'object' && vitalConfig !== null ? vitalConfig.status : null;

      const displayName = fieldToDisplayName[vitalField] ?? vitalField;
      const kws = keywordMap[vitalField] ?? [String(vitalField).toLowerCase()];

      if (vitalField !== displayName) {
        kws.push(vitalField.toLowerCase());
      }

      let vitalReadings: VitalReading[] = [];

      if (
        vitalsFromCategory &&
        typeof vitalsFromCategory === 'object' &&
        !Array.isArray(vitalsFromCategory)
      ) {
        const categoryObj = vitalsFromCategory;
        if (categoryObj[displayName] && Array.isArray(categoryObj[displayName])) {
          vitalReadings = categoryObj[displayName];
        } else if (categoryObj[vitalField] && Array.isArray(categoryObj[vitalField])) {
          vitalReadings = categoryObj[vitalField];
        } else {
          const matchingKey = Object.keys(categoryObj).find((key) =>
            kws.some(
              (kw) =>
                key.toLowerCase().includes(kw.toLowerCase()) ||
                kw.toLowerCase().includes(key.toLowerCase()),
            ),
          );
          if (matchingKey && Array.isArray(categoryObj[matchingKey])) {
            vitalReadings = categoryObj[matchingKey];
          }
        }
      }

      if (vitalReadings.length === 0 && legacyVitalsEntries.length > 0) {
        vitalReadings = legacyVitalsEntries.filter((entry) => {
          const entryText = `${entry.title ?? ''} ${entry.details ?? ''} `.toLowerCase();
          return kws.some((kw) => entryText.includes(kw.toLowerCase()));
        });
      }

      const found = vitalReadings.length > 0;

      if (found) {
        vitalsTaken.push(vitalField);

        if (timeRequirement && timeRequirement.includes('minutes') && scenarioStart) {
          let timeLimit = 0;
          if (timeRequirement.includes('5 minutes')) {
            timeLimit = VITAL_TIME_LIMIT_5_MIN_S;
          } else if (timeRequirement.includes('10 minutes')) {
            timeLimit = VITAL_TIME_LIMIT_10_MIN_S;
          } else if (timeRequirement.includes('15 minutes')) {
            timeLimit = VITAL_TIME_LIMIT_15_MIN_S;
          } else if (timeRequirement.includes('30 minutes')) {
            timeLimit = VITAL_TIME_LIMIT_30_MIN_S;
          }

          const sortedReadings = [...vitalReadings].sort((a, b) => {
            const timeA = a.timestampValue ?? (a.timestamp ? new Date(a.timestamp).getTime() : 0);
            const timeB = b.timestampValue ?? (b.timestamp ? new Date(b.timestamp).getTime() : 0);
            return timeA - timeB;
          });

          const isReassessRequirement = timeRequirement.toLowerCase().includes('reassess');
          const isRequiredRequirement = timeRequirement.toLowerCase().includes('required');

          if (isRequiredRequirement && !isReassessRequirement) {
            const firstReading = sortedReadings[0];
            if (firstReading) {
              const readingTime =
                firstReading.timestampValue ??
                (firstReading.timestamp ? new Date(firstReading.timestamp).getTime() : 0);
              const timeTakenSeconds = Math.round((readingTime - scenarioStart) / 1000);

              const analysis: VitalTimingAnalysis = {
                vital: vitalField,
                requirement: timeRequirement,
                type: 'required',
                timeTakenSeconds,
                timeTakenFormatted: this.formatSecondsToTime(timeTakenSeconds),
                timeLimit,
                timeLimitFormatted: this.formatSecondsToTime(timeLimit),
                withinTimeLimit: timeTakenSeconds <= timeLimit,
                status: timeTakenSeconds <= timeLimit ? 'On Time' : 'Late',
                actionTitle: firstReading.title ?? '',
                readingValue: firstReading.details ?? '',
              };

              timingAnalysis.push(analysis);
            }
          } else if (isReassessRequirement) {
            const readingsCount = sortedReadings.length;
            const intervals: TimingInterval[] = [];
            let allIntervalsWithinLimit = true;
            const hasReassessment = readingsCount > 1;

            for (let i = 1; i < sortedReadings.length; i++) {
              const prevReading = sortedReadings[i - 1];
              const currReading = sortedReadings[i];

              const prevTime =
                prevReading.timestampValue ??
                (prevReading.timestamp ? new Date(prevReading.timestamp).getTime() : 0);
              const currTime =
                currReading.timestampValue ??
                (currReading.timestamp ? new Date(currReading.timestamp).getTime() : 0);
              const intervalSeconds = Math.round((currTime - prevTime) / 1000);

              const withinLimit = intervalSeconds <= timeLimit;
              if (!withinLimit) {
                allIntervalsWithinLimit = false;
              }

              intervals.push({
                from: i,
                to: i + 1,
                intervalSeconds,
                intervalFormatted: this.formatSecondsToTime(intervalSeconds),
                withinLimit,
                fromReading: prevReading.details ?? '',
                toReading: currReading.details ?? '',
                fromTimestamp: prevReading.timestamp,
                toTimestamp: currReading.timestamp,
              });
            }

            const firstReading = sortedReadings[0];
            let firstReadingTimeTaken = 0;
            let firstReadingOnTime = true;
            if (firstReading) {
              const readingTime =
                firstReading.timestampValue ??
                (firstReading.timestamp ? new Date(firstReading.timestamp).getTime() : 0);
              firstReadingTimeTaken = Math.round((readingTime - scenarioStart) / 1000);
              firstReadingOnTime = firstReadingTimeTaken <= timeLimit;
            }

            let overallStatus: string;
            let withinTimeLimit: boolean;

            if (!hasReassessment) {
              overallStatus = 'Not Reassessed';
              withinTimeLimit = false;
            } else if (allIntervalsWithinLimit && firstReadingOnTime) {
              overallStatus = 'All Reassessments On Time';
              withinTimeLimit = true;
            } else if (!firstReadingOnTime && allIntervalsWithinLimit) {
              overallStatus = 'First Reading Late, Reassessments On Time';
              withinTimeLimit = false;
            } else {
              const lateIntervals = intervals.filter((i) => !i.withinLimit).length;
              overallStatus = `${lateIntervals} of ${intervals.length} Reassessment(s) Late`;
              withinTimeLimit = false;
            }

            const analysis: VitalTimingAnalysis = {
              vital: vitalField,
              requirement: timeRequirement,
              type: 'reassess',
              readingsCount,
              hasReassessment,
              timeLimit,
              timeLimitFormatted: this.formatSecondsToTime(timeLimit),
              firstReadingTimeTaken,
              firstReadingTimeTakenFormatted: this.formatSecondsToTime(firstReadingTimeTaken),
              firstReadingOnTime,
              intervals,
              allIntervalsWithinLimit,
              withinTimeLimit,
              status: overallStatus,
              readings: sortedReadings.map((r, idx) => ({
                index: idx + 1,
                value: r.details ?? '',
                timestamp: r.timestamp,
                elapsedTime: r.elapsedTime ?? '',
                elapsedSeconds: r.elapsedSeconds,
              })),
            };

            timingAnalysis.push(analysis);
          }
        }
      } else {
        vitalsMissing.push(vitalField);
      }
    });

    return {
      requiredVitals: requiredVitals || [],
      vitalsTaken,
      vitalsMissing,
      timingAnalysis,
    };
  }

  /**
   * Maps a percentage score to a human-readable performance category.
   */
  getPerformanceCategory(percentage: number): string {
    if (percentage < 60) {
      return 'Needs Improvement';
    }
    if (percentage <= 80) {
      return 'Meets Expectations';
    }
    return 'Exceptional';
  }
}
