import {
  registerDecorator,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';

// --- Vital sign maximum limits (used for admin input validation) ------------
const VITAL_MAX_HEART_RATE_BPM = 300;
const VITAL_MAX_BLOOD_PRESSURE_MMHG = 400;
const VITAL_MAX_RESPIRATORY_RATE_BPM = 99;
const VITAL_MAX_SPO2_PERCENT = 100;
const VITAL_MAX_TEMP_CELSIUS = 43;
const VITAL_MAX_TEMP_FAHRENHEIT = 109;

@ValidatorConstraint({ name: 'validVitalSigns', async: false })
export class ValidVitalSignsConstraint implements ValidatorConstraintInterface {
  validate(actions: unknown[]): boolean {
    if (!Array.isArray(actions)) {
      return true;
    }

    for (const action of actions) {
      if (
        typeof action !== 'object' ||
        action === null ||
        (action as Record<string, unknown>).type !== 'vital'
      ) {
        continue;
      }

      const vitals = (action as Record<string, unknown>).vitals;
      if (!vitals || typeof vitals !== 'object') {
        continue;
      }

      const vitalsRecord = vitals as Record<string, unknown>;

      // Validate Heart Rate limits
      if (vitalsRecord.heartRate && Array.isArray(vitalsRecord.heartRate)) {
        for (const value of vitalsRecord.heartRate) {
          if (typeof value === 'string' && value.trim()) {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > VITAL_MAX_HEART_RATE_BPM) {
              return false;
            }
          }
        }
      }

      // Validate Blood Pressure limits
      if (vitalsRecord.bloodPressure && Array.isArray(vitalsRecord.bloodPressure)) {
        for (const value of vitalsRecord.bloodPressure) {
          if (typeof value === 'string' && value.trim()) {
            const parts = value.split('/');
            if (parts.length === 2) {
              const sys = parseInt(parts[0], 10);
              const dia = parseInt(parts[1], 10);
              if (
                (!isNaN(sys) && sys > VITAL_MAX_BLOOD_PRESSURE_MMHG) ||
                (!isNaN(dia) && dia > VITAL_MAX_BLOOD_PRESSURE_MMHG)
              ) {
                return false;
              }
            } else {
              const single = parseInt(value, 10);
              if (!isNaN(single) && single > VITAL_MAX_BLOOD_PRESSURE_MMHG) {
                return false;
              }
            }
          }
        }
      }

      // Validate Respiratory Rate limits
      if (vitalsRecord.respiratoryRate && Array.isArray(vitalsRecord.respiratoryRate)) {
        for (const value of vitalsRecord.respiratoryRate) {
          if (typeof value === 'string' && value.trim()) {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > VITAL_MAX_RESPIRATORY_RATE_BPM) {
              return false;
            }
          }
        }
      }

      // Validate SpO2 limits
      if (vitalsRecord.spO2 && Array.isArray(vitalsRecord.spO2)) {
        for (const value of vitalsRecord.spO2) {
          if (typeof value === 'string' && value.trim()) {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > VITAL_MAX_SPO2_PERCENT) {
              return false;
            }
          }
        }
      }

      // Validate Temperature limits (match frontend: °F max 109, °C max 43)
      if (vitalsRecord.temperature && Array.isArray(vitalsRecord.temperature)) {
        for (const value of vitalsRecord.temperature) {
          if (typeof value === 'string' && value.trim()) {
            const num = parseFloat(value);
            if (!isNaN(num)) {
              const isCelsius = value.includes('°C');
              const maxTemp = isCelsius ? VITAL_MAX_TEMP_CELSIUS : VITAL_MAX_TEMP_FAHRENHEIT;
              if (num > maxTemp) {
                return false;
              }
            }
          }
        }
      }

      // Validate mandatory vital fields have values
      const typeRequirement = (action as Record<string, unknown>).typeRequirement;
      if (typeRequirement === 'Mandatory') {
        const vitalRequirements = (action as Record<string, unknown>).vitalRequirements as
          Record<string, string> | undefined;
        const vitalRequirementEntries = (action as Record<string, unknown>)
          .vitalRequirementEntries as Record<string, string[]> | undefined;

        const vitalsFields = [
          'heartRate',
          'bloodPressure',
          'respiratoryRate',
          'spO2',
          'temperature',
        ];

        for (const field of vitalsFields) {
          const fieldValues = vitalsRecord[field] as string[] | undefined;
          if (!Array.isArray(fieldValues)) {
            continue;
          }

          // Determine requirements for this field
          const entries = vitalRequirementEntries?.[field];
          const requirements =
            Array.isArray(entries) && entries.length > 0
              ? entries
              : Array.from(
                  { length: fieldValues.length },
                  () => vitalRequirements?.[field] ?? 'Mandatory',
                );

          // Check each mandatory index has a non-empty value
          for (let idx = 0; idx < requirements.length; idx++) {
            if (requirements[idx] === 'Mandatory') {
              const value = fieldValues[idx];
              const isEmpty = !value || (typeof value === 'string' && value.trim().length === 0);
              if (isEmpty) {
                return false;
              }
            }
          }
        }
      }
    }

    return true;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Invalid vital signs: Check that vital sign values are within limits (HR: 300 bpm, BP: 400 mmHg, RR: 99 breaths/min, SpO2: 100%, Temp: 109°F / 43°C) and that all mandatory vital fields have values.';
  }
}

export function IsValidVitalSigns(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: ValidVitalSignsConstraint,
    });
  };
}
