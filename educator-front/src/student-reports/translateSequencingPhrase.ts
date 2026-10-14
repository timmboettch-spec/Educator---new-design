/**
 * Localises fixed English phrases emitted by the backend sequencing service
 * into the active language. Adapted from the HS student app's
 * `lib/i18n/translateSequencingPhrase.ts` to work with the Educator app's
 * language parameter instead of a `useTranslation` hook.
 *
 * When `language` is "en" the input is returned unchanged.
 * When `language` is "es" all known template phrases and default labels
 * are swapped to Spanish equivalents.
 */

// ─── Spanish translation map ──────────────────────────────────────────────────
const ES: Record<string, string> = {
  'report.seq.point.overall_appropriate':
    'Secuenciación general: Los elementos agrupados se realizaron en la secuencia adecuada',
  'report.seq.point.overall_not_in_order':
    'Secuenciación general: Los grupos no se completaron en el orden correcto',
  'report.seq.point.overall_issues_found':
    'Secuenciación general: se encontraron {count} problemas',
  'report.seq.point.timing_met': 'Requisito de tiempo cumplido: {label}',
  'report.seq.point.timing_not_met': 'Requisito de tiempo no cumplido: {label}',
  'report.seq.point.interrupted_suffix': '{label} - Interrumpido',
  'report.seq.point.correctly_sequenced': 'Secuenciado correctamente',
  'report.seq.point.correctly_sequenced_with_label':
    'Secuenciado correctamente: {label}',
  'report.seq.point.group_with_issues': '{label} ({count} problemas)',
  'report.seq.example.was_not_completed': 'no fue completado.',
  'report.seq.example.no_items_completed': 'No se completó ningún elemento.',
  'report.seq.example.all_correct_sequence':
    'Todos los elementos se realizaron en la secuencia correcta.',
  'report.seq.example.all_completed':
    'Se completaron todos los elementos requeridos.',
  'report.seq.example.within_timeframe':
    'Los elementos se realizaron dentro del plazo requerido.',
  'report.seq.example.not_within_timeframe':
    'Los elementos no se realizaron dentro del plazo requerido.',
  'report.seq.example.not_completed_strict':
    'No completaste ningún elemento de los siguientes grupos: {groups}. Todos los grupos deben intentarse y completarse en orden.',
  'report.seq.example.not_completed_flexible':
    'No completaste ningún elemento de los siguientes grupos: {groups}. Todos los grupos deben intentarse.',
  'report.seq.example.success_strict':
    'Completaste con éxito todos los grupos de la secuencia en el orden esperado: {groups}. {rationale}',
  'report.seq.example.success_flexible':
    'Completaste todos los grupos sin interrumpir uno con elementos de otro. Grupos completados: {groups}.',
  'report.seq.example.need_complete_before_next':
    'Debes completar todos los elementos de un grupo antes de comenzar el siguiente. Orden esperado: {groups}.',
  'report.seq.example.groups_should_be_completed':
    'Los grupos deben completarse en este orden: {groups}. Asegúrate de terminar todos los elementos de un grupo antes de iniciar el siguiente.',
  'report.seq.example.this_group_includes': 'Este grupo incluye: {items}.',
  'report.seq.example.this_subgroup_includes':
    'Este subgrupo incluye: {items}.',
  'report.seq.example.this_group_has_items':
    'Este grupo tiene {count} elementos requeridos.',
  'report.seq.example.this_subgroup_has_items':
    'Este subgrupo tiene {count} elementos requeridos.',
  'report.seq.example.this_group_includes_x_items':
    'Este grupo incluye {count} elementos',
  'report.seq.example.this_subgroup_includes_x_items':
    'Este subgrupo incluye {count} elementos',
  'report.seq.example.issues': 'Problemas:',
  'report.seq.example.specific_issues': 'Problemas específicos:',
  'report.seq.example.missing': 'Faltante:',
  'report.seq.example.completed': 'Completado',
  'report.seq.example.following_not_completed':
    'Los siguientes {count} elemento(s) no fueron completados: {items}.',
  'report.seq.example.following_not_completed_prefix':
    'Los siguientes {count} elemento(s) no fueron completados:',
  'report.seq.example.group_interrupted_by':
    'Este grupo fue interrumpido por "{action}" de "{group}"',
  'report.seq.example.not_all_items_missing':
    'No se completaron todos los elementos en "{group}". Faltante: {items}.',
  'report.seq.example.within_time_of': 'dentro de {count} {unit} de',
  'report.seq.example.started_too_early':
    'Comenzaste "{group}" demasiado pronto.',
  'report.seq.example.must_complete_before_next':
    'Todos los elementos de un grupo deben completarse antes de iniciar elementos del siguiente grupo',
  'report.seq.example.started_before_completed':
    '"{next}" se inició antes de que "{current}" se completara.',
  'report.seq.example.performed_before':
    '"{next}" se realizó antes de "{current}".',
  'report.seq.example.performed_before_must_after':
    '"{current}" se realizó ANTES de "{reference}". Debe realizarse DESPUÉS de "{reference}" y dentro de {time} minutos.',
  'report.seq.example.performed_after_exceeding':
    '"{current}" se realizó {time} después de "{reference}", excediendo la ventana de {threshold}.',
  'report.seq.example.cannot_validate_timing':
    'No se puede validar el tiempo — elemento requerido no completado.',
  'report.seq.example.started_too_early_action_from':
    'Comenzaste "{interrupting}" demasiado pronto. La acción "{action}" de "{interrupting}" se realizó antes de que se completaran todos los elementos en "{current}". Debes terminar todos los elementos en "{current}" antes de comenzar "{interrupting}".',
  'report.seq.example.started_too_early_overlap':
    'Comenzaste "{next}" demasiado pronto. Algunos elementos de "{next}" se realizaron antes de que se completaran todos los elementos en "{current}". Completa todos los elementos en "{current}" primero, luego procede a "{next}".',
  'report.seq.rationale.timing_wrong_order':
    'Violación de tiempo: Elemento realizado en orden incorrecto ({time} antes del elemento de referencia).',
  'report.seq.rationale.timing_exceeds_limit':
    'Violación de tiempo: {time} excede el límite de {threshold}.',
  'report.seq.rationale.flexible_group_followed':
    'Se siguieron los requisitos de secuencia flexibles en el grupo.',
  'report.seq.rationale.strict_group_followed':
    'Se siguieron todos los requisitos de secuencia ESTRICTOS en el grupo.',
  'report.seq.rationale.flexible_subgroup_followed':
    'Se siguieron los requisitos de secuencia flexibles en el subgrupo.',
  'report.seq.rationale.strict_subgroup_followed':
    'Se siguieron todos los requisitos de secuencia ESTRICTOS en el subgrupo.',
  'report.seq.rationale.timing_met': 'Requisito de tiempo cumplido.',
  'report.seq.rationale.grouped_appropriate':
    'Los elementos agrupados se realizaron en la secuencia adecuada.',
  'report.seq.rationale.group_has_issues':
    'El grupo "{group}" tiene {count} problema(s).',
  'report.seq.rationale.group_strict_has_issues':
    'El grupo "{group}" (ESTRICTO) tiene {count} problema(s).',
  'report.seq.rationale.subgroup_has_issues':
    'El subgrupo "{subgroup}" tiene {count} problema(s).',
  'report.seq.rationale.subgroup_strict_has_issues':
    'El subgrupo "{subgroup}" (ESTRICTO) tiene {count} problema(s).',
  'report.seq.time_unit.min': 'min',
  'report.seq.time_unit.minute': 'minuto',
  'report.seq.time_unit.hour': 'hora',
  'report.seq.time_unit.sec': 'seg',
  'report.seq.time_unit.second': 'segundo',
  'report.seq.rec.ensure_sequence':
    'Asegúrese de que todos los pasos se realicen en la secuencia correcta.',
  'report.seq.rec.timing':
    'Preste especial atención a los requisitos de tiempo.',
  'report.seq.rec.review_sequence': 'Revise la secuencia esperada de acciones.',
  'report.seq.rec.continue':
    'Continúe siguiendo la secuenciación y los tiempos correctos.',
  'report.seq.summary.no_groups_configured':
    'No se configuraron grupos de secuencia para este escenario.',
  'report.seq.summary.criteria_passed':
    '{passed} de {total} criterios de secuenciación aprobados.',
  'report.seq.label.all_groups_overall': 'Todos los Grupos en General',
  'report.seq.label.group': 'Grupo',
  'report.seq.label.subgroup': 'Subgrupo',
  'report.seq.label.mode_strict': 'Estricto',
  'report.seq.label.mode_flexible': 'Flexible',
  'report.seq.action.don': 'Colocar',
  'report.seq.action.doff': 'Quitar',
  'report.seq.action.eye_protection': 'Protección Ocular',
  'report.seq.action.standard_gloves': 'Guantes Estándar',
  'report.seq.action.isolation_gown': 'Bata de Aislamiento',
  'report.seq.action.respirator_mask': 'Mascarilla Respiratoria',
  'report.seq.action.surgical_mask': 'Mascarilla Quirúrgica',
  'report.seq.action.sterile_gloves': 'Guantes Estériles',
  'report.seq.action.knock': 'Tocar',
  'report.seq.action.open_door': 'Abrir Puerta',
  'report.seq.action.close_door': 'Cerrar Puerta',
  'report.seq.action.open_curtain': 'Abrir Cortina',
  'report.seq.action.close_curtain': 'Cerrar Cortina',
  'report.seq.action.hand_hygiene': 'Higiene de Manos',
  'report.seq.action.discard_sharps': 'Desechar Objetos Punzocortantes',
  'report.seq.action.discard_noninfectious_waste':
    'Desechar Residuos No Infecciosos',
  'report.seq.action.discard_infectious_waste': 'Desechar Residuos Infecciosos',
  'report.seq.action.bed_chair_locked': 'Cama/Silla Bloqueada Confirmada',
  'report.seq.action.bed_chair_alarm':
    'Alarma de Cama/Silla Activada Confirmada',
  'report.seq.action.bed_lowest_position':
    'Cama en Posición Más Baja Confirmada',
  'report.seq.action.call_light_in_reach':
    'Timbre de Llamada al Alcance Confirmado',
  'report.seq.action.equipment_checked': 'Equipo Verificado Confirmado',
  'report.seq.action.lines_tubes_drains_checked':
    'Líneas/Tubos/Drenajes Verificados Confirmados',
  'report.seq.action.personal_items_in_reach':
    'Artículos Personales al Alcance Confirmados',
  'report.seq.action.team_communication': 'Comunicación en Equipo',
  'report.seq.action_prefix.obtain_vital_signs': 'Obtener signos vitales',
  'report.seq.common.and_x_more': 'y {count} más',
  'report.seq.common.immediate_management': 'Manejo Inmediato',
  'report.seq.category.order': 'Orden',
  'report.seq.category.medication': 'Medicación',
  'report.seq.patient.patient_name': 'Nombre del Paciente',
  'report.seq.patient.dob': 'Fecha de Nacimiento',
  'report.seq.patient.age': 'Edad',
  'report.seq.patient.gender': 'Género',
  'report.seq.patient.race': 'Raza',
  'report.seq.patient.height': 'Altura',
  'report.seq.patient.weight': 'Peso',
  'report.seq.patient.chief_complaint': 'Motivo de Consulta Principal',
  'report.seq.patient.history_present_illness':
    'Historia de Enfermedad Actual (HPI)',
  'report.seq.patient.medical_history': 'Historia Médica Pasada',
  'report.seq.patient.surgical_history': 'Historia Quirúrgica Pasada',
  'report.seq.patient.allergies': 'Alergias',
  'report.seq.patient.current_medications':
    'Medicamentos Actuales en Casa e Indicaciones',
  'report.seq.patient.immunizations': 'Inmunizaciones',
  'report.seq.patient.family_history': 'Historia Médica Familiar',
  'report.seq.patient.primary_care_provider': 'Proveedor de Atención Primaria',
  'report.seq.patient.social_tobacco': 'Historia Social: Uso de Tabaco',
  'report.seq.patient.social_alcohol': 'Historia Social: Uso de Alcohol',
  'report.seq.patient.social_drugs': 'Historia Social: Uso de Drogas',
  'report.seq.patient_short.social_tobacco': 'Historia Social: Tabaco',
  'report.seq.patient_short.social_alcohol': 'Historia Social: Alcohol',
  'report.seq.patient_short.social_drugs': 'Historia Social: Drogas',
  'report.seq.patient_short.medical_history': 'Historia Médica',
  'report.seq.patient_short.surgical_history': 'Historia Quirúrgica',
  'report.seq.patient_short.history_present_illness':
    'Historia de Enfermedad Actual',
  'report.seq.patient_short.social_history': 'Historia Social',
  'report.seq.patient.lifestyle_occupation': 'Estilo de Vida: Ocupación',
  'report.seq.patient.lifestyle_housing': 'Estilo de Vida: Vivienda',
  'report.seq.patient.lifestyle_transportation': 'Estilo de Vida: Transporte',
  'report.seq.patient.lifestyle_diet': 'Estilo de Vida: Dieta',
  'report.seq.patient.lifestyle_exercise': 'Estilo de Vida: Ejercicio',
  'report.seq.patient.lifestyle_stress': 'Estilo de Vida: Estrés',
  'report.seq.patient.lifestyle_sleep': 'Estilo de Vida: Sueño',
  'report.seq.vital.heart_rate': 'Frecuencia Cardíaca',
  'report.seq.vital.blood_pressure': 'Presión Arterial',
  'report.seq.vital.respiratory_rate': 'Frecuencia Respiratoria',
  'report.seq.vital.spo2': 'SpO₂',
  'report.seq.vital.temperature': 'Temperatura',
};

type Tt = (key: string) => string;

/** Build a translator from the map. English: returns key (triggers fallback). */
function makeT(language: 'en' | 'es'): Tt {
  if (language !== 'es') return (k) => k;
  return (k) => ES[k] ?? k;
}

// ─── Exact-match phrase → i18n key ───────────────────────────────────────────
const EXACT_KEYS: Record<string, string> = {
  'Overall Sequencing: Grouped items were performed in appropriate sequence':
    'report.seq.point.overall_appropriate',
  'Overall Sequencing: Groups not completed in correct order':
    'report.seq.point.overall_not_in_order',
  'Correctly sequenced': 'report.seq.point.correctly_sequenced',
  'was not completed.': 'report.seq.example.was_not_completed',
  'No items were completed.': 'report.seq.example.no_items_completed',
  'All items were performed in the correct sequence.':
    'report.seq.example.all_correct_sequence',
  'All required items were completed.': 'report.seq.example.all_completed',
  'Items were performed within the required timeframe.':
    'report.seq.example.within_timeframe',
  'Items were not performed within the required timeframe.':
    'report.seq.example.not_within_timeframe',
  'Issues:': 'report.seq.example.issues',
  'Specific issues:': 'report.seq.example.specific_issues',
  'Missing:': 'report.seq.example.missing',
  Completed: 'report.seq.example.completed',
  'Cannot validate timing — required item not completed.':
    'report.seq.example.cannot_validate_timing',
  'Flexible sequence requirements in group were followed.':
    'report.seq.rationale.flexible_group_followed',
  'All STRICT sequence requirements in group were followed.':
    'report.seq.rationale.strict_group_followed',
  'Flexible sequence requirements in subgroup were followed.':
    'report.seq.rationale.flexible_subgroup_followed',
  'All STRICT sequence requirements in subgroup were followed.':
    'report.seq.rationale.strict_subgroup_followed',
  'Timing requirement met.': 'report.seq.rationale.timing_met',
  'Grouped items were performed in appropriate sequence.':
    'report.seq.rationale.grouped_appropriate',
  'No sequence groups configured for this scenario.':
    'report.seq.summary.no_groups_configured',
  'Ensure all steps are performed in the correct sequence.':
    'report.seq.rec.ensure_sequence',
  'Pay close attention to timing requirements.': 'report.seq.rec.timing',
  'Review the expected sequence of actions.': 'report.seq.rec.review_sequence',
  'Continue following the correct sequencing and timing.':
    'report.seq.rec.continue',
};

type RegexRule = { pattern: RegExp; key: string; placeholders: string[] };

const REGEX_RULES: RegexRule[] = [
  {
    pattern: /^Overall Sequencing:\s*(\d+)\s*issues? found$/,
    key: 'report.seq.point.overall_issues_found',
    placeholders: ['{count}'],
  },
  {
    pattern: /^Timing requirement met:\s*(.+)$/,
    key: 'report.seq.point.timing_met',
    placeholders: ['{label}'],
  },
  {
    pattern: /^Timing requirement not met:\s*(.+)$/,
    key: 'report.seq.point.timing_not_met',
    placeholders: ['{label}'],
  },
  {
    pattern: /^Correctly sequenced:\s*(.+)$/,
    key: 'report.seq.point.correctly_sequenced_with_label',
    placeholders: ['{label}'],
  },
  {
    pattern: /^(.+?)\s*\((\d+)\s*issues?\)$/,
    key: 'report.seq.point.group_with_issues',
    placeholders: ['{label}', '{count}'],
  },
  {
    pattern:
      /^You did not complete any items from the following groups?:\s*(.+?)\.\s*All groups must be attempted and completed in order\.?$/,
    key: 'report.seq.example.not_completed_strict',
    placeholders: ['{groups}'],
  },
  {
    pattern:
      /^You did not complete any items from the following groups?:\s*(.+?)\.\s*All groups must be attempted\.?$/,
    key: 'report.seq.example.not_completed_flexible',
    placeholders: ['{groups}'],
  },
  {
    pattern:
      /^You successfully completed all sequence groups in the expected order:\s*(.+?)\.\s*(.*)$/,
    key: 'report.seq.example.success_strict',
    placeholders: ['{groups}', '{rationale}'],
  },
  {
    pattern:
      /^You completed all groups without interrupting one group with items from another\.\s*Groups completed:\s*(.+?)\.?$/,
    key: 'report.seq.example.success_flexible',
    placeholders: ['{groups}'],
  },
  {
    pattern:
      /^You need to complete all items in one group before starting the next\.\s*Expected order:\s*(.+?)\.?$/,
    key: 'report.seq.example.need_complete_before_next',
    placeholders: ['{groups}'],
  },
  {
    pattern:
      /^Groups should be completed in this order:\s*(.+?)\.\s*Make sure to finish all items in one group before starting the next\.?$/,
    key: 'report.seq.example.groups_should_be_completed',
    placeholders: ['{groups}'],
  },
  {
    pattern: /^This group includes:\s*(.+?)\.?$/,
    key: 'report.seq.example.this_group_includes',
    placeholders: ['{items}'],
  },
  {
    pattern: /^This subgroup includes:\s*(.+?)\.?$/,
    key: 'report.seq.example.this_subgroup_includes',
    placeholders: ['{items}'],
  },
  {
    pattern: /^This group has (\d+) required items?\.?$/,
    key: 'report.seq.example.this_group_has_items',
    placeholders: ['{count}'],
  },
  {
    pattern: /^This subgroup has (\d+) required items?\.?$/,
    key: 'report.seq.example.this_subgroup_has_items',
    placeholders: ['{count}'],
  },
  {
    pattern: /^This group includes (\d+) items?:?\.?$/,
    key: 'report.seq.example.this_group_includes_x_items',
    placeholders: ['{count}'],
  },
  {
    pattern: /^This subgroup includes (\d+) items?:?\.?$/,
    key: 'report.seq.example.this_subgroup_includes_x_items',
    placeholders: ['{count}'],
  },
  {
    pattern: /^(.+)\s+-\s+Interrupted$/,
    key: 'report.seq.point.interrupted_suffix',
    placeholders: ['{label}'],
  },
  {
    pattern: /^(\d+)\s+of\s+(\d+)\s+sequencing criteria passed\.?$/,
    key: 'report.seq.summary.criteria_passed',
    placeholders: ['{passed}', '{total}'],
  },
  {
    pattern:
      /^The following (\d+) items? (?:was|were) not completed:\s*(.+?)\.?$/,
    key: 'report.seq.example.following_not_completed',
    placeholders: ['{count}', '{items}'],
  },
  {
    pattern: /^"([^"]+)" was started before "([^"]+)" was completed\.?$/,
    key: 'report.seq.example.started_before_completed',
    placeholders: ['{next}', '{current}'],
  },
  {
    pattern: /^"([^"]+)" was performed before "([^"]+)"\.?$/,
    key: 'report.seq.example.performed_before',
    placeholders: ['{next}', '{current}'],
  },
  {
    pattern:
      /^"([^"]+)" was performed BEFORE "([^"]+)"\.\s*It must be performed AFTER "([^"]+)" and within (.+?) minutes?\.?$/,
    key: 'report.seq.example.performed_before_must_after',
    placeholders: ['{current}', '{reference}', '{reference}', '{time}'],
  },
  {
    pattern:
      /^"([^"]+)" was performed (.+?) after "([^"]+)", exceeding the (.+?) window\.?$/,
    key: 'report.seq.example.performed_after_exceeding',
    placeholders: ['{current}', '{time}', '{reference}', '{threshold}'],
  },
  {
    pattern:
      /^Timing violation:\s*Item performed in wrong order \((.+?) before reference item\)\.?$/,
    key: 'report.seq.rationale.timing_wrong_order',
    placeholders: ['{time}'],
  },
  {
    pattern: /^Timing violation:\s*(.+?) exceeds (.+?) limit\.?$/,
    key: 'report.seq.rationale.timing_exceeds_limit',
    placeholders: ['{time}', '{threshold}'],
  },
  {
    pattern: /^Group "([^"]+)" has (\d+) issues?\.?$/,
    key: 'report.seq.rationale.group_has_issues',
    placeholders: ['{group}', '{count}'],
  },
  {
    pattern: /^Group "([^"]+)" \(STRICT\) has (\d+) issues?\.?$/,
    key: 'report.seq.rationale.group_strict_has_issues',
    placeholders: ['{group}', '{count}'],
  },
  {
    pattern: /^Subgroup "([^"]+)" has (\d+) issues?\.?$/,
    key: 'report.seq.rationale.subgroup_has_issues',
    placeholders: ['{subgroup}', '{count}'],
  },
  {
    pattern: /^Subgroup "([^"]+)" \(STRICT\) has (\d+) issues?\.?$/,
    key: 'report.seq.rationale.subgroup_strict_has_issues',
    placeholders: ['{subgroup}', '{count}'],
  },
  {
    pattern: /^This group was interrupted by\s*"(.+?)"\s*from\s*"(.+?)"\.?/,
    key: 'report.seq.example.group_interrupted_by',
    placeholders: ['{action}', '{group}'],
  },
  {
    pattern:
      /^Not all items in\s*"(.+?)"\s*were completed\.\s*Missing:\s*(.+?)\.?$/,
    key: 'report.seq.example.not_all_items_missing',
    placeholders: ['{group}', '{items}'],
  },
  {
    pattern: /^You started\s*"(.+?)"\s*too early\./,
    key: 'report.seq.example.started_too_early',
    placeholders: ['{group}'],
  },
];

function applyPlaceholders(
  template: string,
  placeholders: string[],
  captured: string[]
): string {
  let out = template;
  placeholders.forEach((ph, idx) => {
    const val = captured[idx] ?? '';
    out = out.split(ph).join(val);
  });
  return out;
}

// ─── Default-label word swaps ─────────────────────────────────────────────────
function translateDefaultLabels(input: string, t: Tt): string {
  if (!input) return input;
  let out = input;

  const lk = (key: string, fallback: string) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };

  // PPE actions
  const don = lk('report.seq.action.don', 'Don');
  const doff = lk('report.seq.action.doff', 'Doff');
  const eyeP = lk('report.seq.action.eye_protection', 'Eye Protection');
  const stdGloves = lk('report.seq.action.standard_gloves', 'Standard Gloves');
  const isolGown = lk('report.seq.action.isolation_gown', 'Isolation Gown');
  const respMask = lk('report.seq.action.respirator_mask', 'Respirator Mask');
  const surgMask = lk('report.seq.action.surgical_mask', 'Surgical Mask');
  const sterGloves = lk('report.seq.action.sterile_gloves', 'Sterile Gloves');
  out = out.replace(/\bDon Eye Protection\b/g, `${don} ${eyeP}`);
  out = out.replace(/\bDoff Eye Protection\b/g, `${doff} ${eyeP}`);
  out = out.replace(/\bDon Standard Gloves\b/g, `${don} ${stdGloves}`);
  out = out.replace(/\bDoff Standard Gloves\b/g, `${doff} ${stdGloves}`);
  out = out.replace(/\bDon Isolation Gown\b/g, `${don} ${isolGown}`);
  out = out.replace(/\bDoff Isolation Gown\b/g, `${doff} ${isolGown}`);
  out = out.replace(/\bDon Respirator Mask\b/g, `${don} ${respMask}`);
  out = out.replace(/\bDoff Respirator Mask\b/g, `${doff} ${respMask}`);
  out = out.replace(/\bDon Surgical Mask\b/g, `${don} ${surgMask}`);
  out = out.replace(/\bDoff Surgical Mask\b/g, `${doff} ${surgMask}`);
  out = out.replace(/\bDon Sterile Gloves\b/g, `${don} ${sterGloves}`);
  out = out.replace(/\bDoff Sterile Gloves\b/g, `${doff} ${sterGloves}`);

  const knock = lk('report.seq.action.knock', 'Knock');
  const openDoor = lk('report.seq.action.open_door', 'Open Door');
  const closeDoor = lk('report.seq.action.close_door', 'Close Door');
  const openCurtain = lk('report.seq.action.open_curtain', 'Open Curtain');
  const closeCurtain = lk('report.seq.action.close_curtain', 'Close Curtain');
  const handHygiene = lk('report.seq.action.hand_hygiene', 'Hand Hygiene');
  const discardSharps = lk(
    'report.seq.action.discard_sharps',
    'Discard Sharps'
  );
  const discardNonInf = lk(
    'report.seq.action.discard_noninfectious_waste',
    'Discard Non-Infectious Waste'
  );
  const discardInf = lk(
    'report.seq.action.discard_infectious_waste',
    'Discard Infectious Waste'
  );
  const bedLocked = lk(
    'report.seq.action.bed_chair_locked',
    'Bed/Chair Locked Confirmed'
  );
  const bedAlarm = lk(
    'report.seq.action.bed_chair_alarm',
    'Bed/Chair Alarm Activated Confirmed'
  );
  const bedLowest = lk(
    'report.seq.action.bed_lowest_position',
    'Bed Lowest Position Confirmed'
  );
  const callLight = lk(
    'report.seq.action.call_light_in_reach',
    'Call Light in Reach Confirmed'
  );
  const equipCheck = lk(
    'report.seq.action.equipment_checked',
    'Equipment Checked Confirmed'
  );
  const linesTubes = lk(
    'report.seq.action.lines_tubes_drains_checked',
    'Lines / Tubes / Drains Checked Confirmed'
  );
  const personalItems = lk(
    'report.seq.action.personal_items_in_reach',
    'Personal Items Within Reach Confirmed'
  );
  out = out.replace(/\bKnock\b/g, knock);
  out = out.replace(/\bOpen Door\b/g, openDoor);
  out = out.replace(/\bClose Door\b/g, closeDoor);
  out = out.replace(/\bOpen Curtain\b/g, openCurtain);
  out = out.replace(/\bClose Curtain\b/g, closeCurtain);
  out = out.replace(/\bHand Hygiene\b/g, handHygiene);
  out = out.replace(/\bDiscard Sharps\b/g, discardSharps);
  out = out.replace(/\bDiscard Non-Infectious Waste\b/g, discardNonInf);
  out = out.replace(/\bDiscard Infectious Waste\b/g, discardInf);
  out = out.replace(/\bBed\/Chair Locked Confirmed\b/g, bedLocked);
  out = out.replace(/\bBed\/Chair Alarm Activated Confirmed\b/g, bedAlarm);
  out = out.replace(/\bBed Lowest Position Confirmed\b/g, bedLowest);
  out = out.replace(/\bCall Light in Reach Confirmed\b/g, callLight);
  out = out.replace(/\bEquipment Checked Confirmed\b/g, equipCheck);
  out = out.replace(
    /\bLines \/ Tubes \/ Drains Checked Confirmed\b/g,
    linesTubes
  );
  out = out.replace(
    /\bPersonal Items Within Reach Confirmed\b/g,
    personalItems
  );

  // Patient data fields
  const patientName = lk('report.seq.patient.patient_name', 'Patient Name');
  const dob = lk('report.seq.patient.dob', 'Date of Birth');
  const age = lk('report.seq.patient.age', 'Age');
  const gender = lk('report.seq.patient.gender', 'Gender');
  const race = lk('report.seq.patient.race', 'Race');
  const height = lk('report.seq.patient.height', 'Height');
  const weight = lk('report.seq.patient.weight', 'Weight');
  const chiefComplaint = lk(
    'report.seq.patient.chief_complaint',
    'Chief Complaint'
  );
  const hpi = lk(
    'report.seq.patient.history_present_illness',
    'History of Present Illness (HPI)'
  );
  const medHist = lk(
    'report.seq.patient.medical_history',
    'Past Medical History'
  );
  const surgHist = lk(
    'report.seq.patient.surgical_history',
    'Past Surgical History'
  );
  const allergies = lk('report.seq.patient.allergies', 'Allergies');
  const curMeds = lk(
    'report.seq.patient.current_medications',
    'Current Home Medications & Indications'
  );
  const immunizations = lk('report.seq.patient.immunizations', 'Immunizations');
  const famHist = lk(
    'report.seq.patient.family_history',
    'Family Medical History'
  );
  const pcp = lk(
    'report.seq.patient.primary_care_provider',
    'Primary Care Provider'
  );
  const socTobacco = lk(
    'report.seq.patient.social_tobacco',
    'Social History: Tobacco Use'
  );
  const socAlcohol = lk(
    'report.seq.patient.social_alcohol',
    'Social History: Alcohol Use'
  );
  const socDrugs = lk(
    'report.seq.patient.social_drugs',
    'Social History: Drug Use'
  );
  out = out.replace(/\bPatient Name\b/g, patientName);
  out = out.replace(/\bDate of Birth\b/g, dob);
  out = out.replace(/\bAge\b/g, age);
  out = out.replace(/\bGender\b/g, gender);
  out = out.replace(/\bRace\b/g, race);
  out = out.replace(/\bHeight\b/g, height);
  out = out.replace(/\bWeight\b/g, weight);
  out = out.replace(/\bChief Complaint\b/g, chiefComplaint);
  out = out.replace(/\bHistory of Present Illness \(HPI\)\b/g, hpi);
  out = out.replace(/\bPast Medical History\b/g, medHist);
  out = out.replace(/\bPast Surgical History\b/g, surgHist);
  out = out.replace(/\bAllergies\b/g, allergies);
  out = out.replace(/\bCurrent Home Medications & Indications\b/g, curMeds);
  out = out.replace(/\bImmunizations\b/g, immunizations);
  out = out.replace(/\bFamily Medical History\b/g, famHist);
  out = out.replace(/\bPrimary Care Provider\b/g, pcp);
  out = out.replace(/\bSocial History: Tobacco Use\b/g, socTobacco);
  out = out.replace(/\bSocial History: Alcohol Use\b/g, socAlcohol);
  out = out.replace(/\bSocial History: Drug Use\b/g, socDrugs);

  // Short forms
  const socTobShort = lk(
    'report.seq.patient_short.social_tobacco',
    'Social History: Tobacco'
  );
  const socAlcShort = lk(
    'report.seq.patient_short.social_alcohol',
    'Social History: Alcohol'
  );
  const socDrugShort = lk(
    'report.seq.patient_short.social_drugs',
    'Social History: Drugs'
  );
  const medHistShort = lk(
    'report.seq.patient_short.medical_history',
    'Medical History'
  );
  const surgHistShort = lk(
    'report.seq.patient_short.surgical_history',
    'Surgical History'
  );
  const hpiShort = lk(
    'report.seq.patient_short.history_present_illness',
    'History of Present Illness'
  );
  const lsOccupation = lk(
    'report.seq.patient.lifestyle_occupation',
    'Lifestyle: Occupation'
  );
  const lsHousing = lk(
    'report.seq.patient.lifestyle_housing',
    'Lifestyle: Housing'
  );
  const lsTransport = lk(
    'report.seq.patient.lifestyle_transportation',
    'Lifestyle: Transportation'
  );
  const lsDiet = lk('report.seq.patient.lifestyle_diet', 'Lifestyle: Diet');
  const lsExercise = lk(
    'report.seq.patient.lifestyle_exercise',
    'Lifestyle: Exercise'
  );
  const lsStress = lk(
    'report.seq.patient.lifestyle_stress',
    'Lifestyle: Stress'
  );
  const lsSleep = lk('report.seq.patient.lifestyle_sleep', 'Lifestyle: Sleep');
  out = out.replace(/\bSocial History: Tobacco\b/g, socTobShort);
  out = out.replace(/\bSocial History: Alcohol\b/g, socAlcShort);
  out = out.replace(/\bSocial History: Drugs\b/g, socDrugShort);
  out = out.replace(/\bHistory of Present Illness\b/g, hpiShort);
  out = out.replace(/\bMedical History\b/g, medHistShort);
  out = out.replace(/\bSurgical History\b/g, surgHistShort);
  out = out.replace(/\bLifestyle: Occupation\b/g, lsOccupation);
  out = out.replace(/\bLifestyle: Housing\b/g, lsHousing);
  out = out.replace(/\bLifestyle: Transportation\b/g, lsTransport);
  out = out.replace(/\bLifestyle: Diet\b/g, lsDiet);
  out = out.replace(/\bLifestyle: Exercise\b/g, lsExercise);
  out = out.replace(/\bLifestyle: Stress\b/g, lsStress);
  out = out.replace(/\bLifestyle: Sleep\b/g, lsSleep);

  // Vital signs
  const heartRate = lk('report.seq.vital.heart_rate', 'Heart Rate');
  const bp = lk('report.seq.vital.blood_pressure', 'Blood Pressure');
  const rr = lk('report.seq.vital.respiratory_rate', 'Respiratory Rate');
  const spo2 = lk('report.seq.vital.spo2', 'SpO₂');
  const temp = lk('report.seq.vital.temperature', 'Temperature');
  out = out.replace(/\bHeart Rate\b/g, heartRate);
  out = out.replace(/\bBlood Pressure\b/g, bp);
  out = out.replace(/\bRespiratory Rate\b/g, rr);
  out = out.replace(/\bSpO[₂2]\b/g, spo2);
  out = out.replace(/\bTemperature\b/g, temp);

  // Team Communication
  const tc = lk('report.seq.action.team_communication', 'Team Communication');
  out = out.replace(/\bTeam Communication\b/g, tc);

  // Obtain vital signs prefix
  const obtainVS = lk(
    'report.seq.action_prefix.obtain_vital_signs',
    'Obtain vital signs'
  );
  out = out.replace(/\bObtain vital signs:/gi, `${obtainVS}:`);
  out = out.replace(/\bObtener signos vitales:/gi, `${obtainVS}:`);

  // Immediate Management
  const immMgt = lk(
    'report.seq.common.immediate_management',
    'Immediate Management'
  );
  out = out.replace(/\bImmediate Management\b/g, immMgt);

  // "and X more"
  out = out.replace(/\band (\d+) more\b/gi, (_m, num: string) => {
    const tpl = t('report.seq.common.and_x_more');
    return tpl && tpl !== 'report.seq.common.and_x_more'
      ? tpl.replace('{count}', num)
      : _m;
  });

  // Inline "This group includes X items"
  out = out.replace(
    /\bThis group includes (\d+) items?:?\b/gi,
    (_m, num: string) => {
      const tpl = t('report.seq.example.this_group_includes_x_items');
      if (tpl && tpl !== 'report.seq.example.this_group_includes_x_items') {
        return _m.endsWith(':')
          ? `${tpl.replace('{count}', num)}:`
          : tpl.replace('{count}', num);
      }
      return _m;
    }
  );
  out = out.replace(
    /\bThis subgroup includes (\d+) items?:?\b/gi,
    (_m, num: string) => {
      const tpl = t('report.seq.example.this_subgroup_includes_x_items');
      if (tpl && tpl !== 'report.seq.example.this_subgroup_includes_x_items') {
        return _m.endsWith(':')
          ? `${tpl.replace('{count}', num)}:`
          : tpl.replace('{count}', num);
      }
      return _m;
    }
  );

  // Category labels in parentheses
  const orderLbl = lk('report.seq.category.order', 'Order');
  const medLbl = lk('report.seq.category.medication', 'Medication');
  out = out.replace(/\(Order\)/g, `(${orderLbl})`);
  out = out.replace(/\(Medication\)/g, `(${medLbl})`);

  // Group / Subgroup / Mode labels
  const allGroupsOverall = lk(
    'report.seq.label.all_groups_overall',
    'All Groups Overall'
  );
  const groupWord = lk('report.seq.label.group', 'Group');
  const subgroupWord = lk('report.seq.label.subgroup', 'Subgroup');
  const strictWord = lk('report.seq.label.mode_strict', 'Strict');
  const flexibleWord = lk('report.seq.label.mode_flexible', 'Flexible');

  const noItemsCompleted = t('report.seq.example.no_items_completed');
  if (
    noItemsCompleted &&
    noItemsCompleted !== 'report.seq.example.no_items_completed'
  ) {
    out = out.replace(/\bNo items were completed\./g, noItemsCompleted);
  }
  const wasNotCompleted = t('report.seq.example.was_not_completed');
  if (
    wasNotCompleted &&
    wasNotCompleted !== 'report.seq.example.was_not_completed'
  ) {
    out = out.replace(/\bwas not completed\./g, wasNotCompleted);
  }

  // Inline "The following X items were/was not completed:"
  const followingPrefix = t(
    'report.seq.example.following_not_completed_prefix'
  );
  if (
    followingPrefix &&
    followingPrefix !== 'report.seq.example.following_not_completed_prefix'
  ) {
    out = out.replace(
      /\bThe following (\d+) items? (?:was|were) not completed:\s*/g,
      (_m, num: string) => followingPrefix.replace('{count}', num) + ' '
    );
  }

  // (Order) / (Medication) inline
  out = out.replace(
    /\s*\(Order\)/g,
    () => ` (${lk('report.seq.category.order', 'Order')})`
  );
  out = out.replace(
    /\s*\(Medication\)/g,
    () => ` (${lk('report.seq.category.medication', 'Medication')})`
  );

  // "within X min of" pattern
  out = out.replace(
    /\bwithin (\d+)\s*(min|minute|minutes|hour|hours|sec|second|seconds)\s+of\b/gi,
    (_m, num: string, unit: string) => {
      const withinTpl = t('report.seq.example.within_time_of');
      if (withinTpl && withinTpl !== 'report.seq.example.within_time_of') {
        const unitKey = `report.seq.time_unit.${unit.toLowerCase().replace(/s$/, '')}`;
        const unitTrans = t(unitKey);
        const finalUnit = unitTrans && unitTrans !== unitKey ? unitTrans : unit;
        return withinTpl.replace('{count}', num).replace('{unit}', finalUnit);
      }
      return _m;
    }
  );

  if (allGroupsOverall !== 'All Groups Overall')
    out = out.replace(/All Groups Overall/g, allGroupsOverall);
  if (subgroupWord !== 'Subgroup')
    out = out.replace(/\bSubgroup(\s+)/g, `${subgroupWord}$1`);
  if (groupWord !== 'Group')
    out = out.replace(/\bGroup(\s+)/g, `${groupWord}$1`);
  if (strictWord !== 'Strict')
    out = out.replace(/\(Strict\)/g, `(${strictWord})`);
  if (flexibleWord !== 'Flexible')
    out = out.replace(/\(Flexible\)/g, `(${flexibleWord})`);

  // Embedded phrase replacements in multi-sentence strings
  const phraseMap: Array<[RegExp, string | ((...args: string[]) => string)]> = [
    [
      /\bSpecific issues:\s*/g,
      (() => {
        const tpl = t('report.seq.example.specific_issues');
        return tpl !== 'report.seq.example.specific_issues'
          ? tpl + ' '
          : 'Specific issues: ';
      })(),
    ],
    [
      /\bIssues:\s*/g,
      (() => {
        const tpl = t('report.seq.example.issues');
        return tpl !== 'report.seq.example.issues' ? tpl + ' ' : 'Issues: ';
      })(),
    ],
    [
      /\bMissing:\s*/g,
      (() => {
        const tpl = t('report.seq.example.missing');
        return tpl !== 'report.seq.example.missing' ? tpl + ' ' : 'Missing: ';
      })(),
    ],
    [
      /\bCannot validate timing — required item not completed\./g,
      (() => {
        const tpl = t('report.seq.example.cannot_validate_timing');
        return tpl !== 'report.seq.example.cannot_validate_timing'
          ? tpl
          : 'Cannot validate timing — required item not completed.';
      })(),
    ],
    [
      /\bAll items in a group must be completed before starting items from the next group\.?/g,
      (() => {
        const tpl = t('report.seq.example.must_complete_before_next');
        return tpl !== 'report.seq.example.must_complete_before_next'
          ? tpl + '.'
          : 'All items in a group must be completed before starting items from the next group.';
      })(),
    ],
    [
      /\bNo items were completed\.?/g,
      (() => {
        const tpl = t('report.seq.example.no_items_completed');
        return tpl !== 'report.seq.example.no_items_completed'
          ? tpl
          : 'No items were completed.';
      })(),
    ],
    [
      /\bFlexible sequence requirements in group were followed\.?/g,
      (() => {
        const tpl = t('report.seq.rationale.flexible_group_followed');
        return tpl !== 'report.seq.rationale.flexible_group_followed'
          ? tpl
          : 'Flexible sequence requirements in group were followed.';
      })(),
    ],
    [
      /\bAll STRICT sequence requirements in group were followed\.?/g,
      (() => {
        const tpl = t('report.seq.rationale.strict_group_followed');
        return tpl !== 'report.seq.rationale.strict_group_followed'
          ? tpl
          : 'All STRICT sequence requirements in group were followed.';
      })(),
    ],
    [
      /\bFlexible sequence requirements in subgroup were followed\.?/g,
      (() => {
        const tpl = t('report.seq.rationale.flexible_subgroup_followed');
        return tpl !== 'report.seq.rationale.flexible_subgroup_followed'
          ? tpl
          : 'Flexible sequence requirements in subgroup were followed.';
      })(),
    ],
    [
      /\bAll STRICT sequence requirements in subgroup were followed\.?/g,
      (() => {
        const tpl = t('report.seq.rationale.strict_subgroup_followed');
        return tpl !== 'report.seq.rationale.strict_subgroup_followed'
          ? tpl
          : 'All STRICT sequence requirements in subgroup were followed.';
      })(),
    ],
    [
      /\bTiming requirement met\.?/g,
      (() => {
        const tpl = t('report.seq.rationale.timing_met');
        return tpl !== 'report.seq.rationale.timing_met'
          ? tpl
          : 'Timing requirement met.';
      })(),
    ],
  ];

  for (const [pattern, replacement] of phraseMap) {
    if (typeof replacement === 'string') {
      out = out.replace(pattern, replacement);
    } else {
      out = out.replace(pattern, replacement);
    }
  }

  return out;
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Translates a sequencing rubric string (strength point, weakness example,
 * recommendation, etc.) into the given language.
 *
 * @param raw      The English string stored in the report record.
 * @param language "en" | "es" — when "en" the input is returned unchanged.
 * @param seqLabelMap  Optional educator-label map (English → localized).
 */
export function translateSequencingPhrase(
  raw: string | undefined | null,
  language: 'en' | 'es',
  seqLabelMap?: Record<string, string>
): string {
  if (!raw || language !== 'es') return raw ?? '';

  const t = makeT(language);
  let working = raw;

  // Pass 1: apply educator-provided sequenceLabelMap (custom scenario labels)
  if (seqLabelMap && Object.keys(seqLabelMap).length > 0) {
    const trimmed = working.trim();
    if (seqLabelMap[trimmed]) {
      working = seqLabelMap[trimmed];
    } else {
      const keys = Object.keys(seqLabelMap).sort((a, b) => b.length - a.length);
      for (const en of keys) {
        const loc = seqLabelMap[en];
        if (!loc || working.indexOf(en) === -1) continue;
        const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        working = working.replace(new RegExp(escaped, 'g'), loc);
      }
    }
  }

  const trimmed = working.trim();

  // Exact match
  const exactKey = EXACT_KEYS[trimmed];
  if (exactKey) {
    const translated = t(exactKey);
    if (translated && translated !== exactKey) {
      return translateDefaultLabels(translated, t);
    }
  }

  // Regex template match
  for (const rule of REGEX_RULES) {
    const m = trimmed.match(rule.pattern);
    if (!m) continue;
    const template = t(rule.key);
    if (!template || template === rule.key) continue;
    const captured = m.slice(1);
    const filled = applyPlaceholders(template, rule.placeholders, captured);
    return translateDefaultLabels(filled, t);
  }

  // Fallback: apply default label swaps to the full string
  return translateDefaultLabels(working, t);
}
