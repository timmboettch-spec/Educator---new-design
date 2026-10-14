import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates a brand-new `simulations_v2` table plus its child tables
 * (`simulation_actions`, `simulation_orders`, `simulation_order_linked_
 * actions`, `simulation_grading_rubric_items`, `simulation_grading_rubric_
 * item_history`) in their final shape, directly — no ALTER of the original
 * `simulations` table (left untouched) and no incremental rename/rebuild
 * history like the migration this replaces.
 *
 * `simulations_v2.simulation_id` is the UUID surrogate PK; `id` is the
 * legacy external business identifier, kept unique only among non-deleted
 * rows via a partial index.
 */
export class CreateSimulationV2Schema1791200000000 implements MigrationInterface {
  name = 'CreateSimulationV2Schema1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===================================================================
    // simulations_v2
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "simulations_v2" (
        "simulation_id"                uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "id"                           varchar(255) NOT NULL,
        "unit_id"                      varchar,
        "title"                        varchar     NOT NULL,
        "difficulty"                   varchar,
        "department"                   varchar,
        "class"                        varchar,
        "learner_level"                varchar,
        "description"                  text,
        "learning_objective"           jsonb,
        "learning_objective_card"      text,
        "status"                       varchar,
        "parent_scenario_id"           varchar,
        "version_number"               integer,
        "avatar_enabled"               boolean     NOT NULL DEFAULT false,
        "avatar_id"                    varchar,
        "context_id"                   varchar,
        "language"                     varchar,
        "voice"                        varchar,
        "action_group_name"            varchar,
        "action_group_description"     text,
        "requires_product_setup"       boolean     NOT NULL DEFAULT false,
        "scenario_image"               varchar(2048),
        "patient_chart_mode"           varchar,
        "enable_student_briefing"      boolean     NOT NULL DEFAULT false,
        "simulation_start_time"        varchar,
        "estimated_duration"           varchar,
        "additional_equipment"         text,
        "optional_equipment"           text,
        "setup_notes"                  text,
        "topics_addressed"             text,
        "prebrief_script_pdf"          varchar(2048),
        "debrief_points_pdf"           varchar(2048),
        "setup_notes_pdf"              varchar(2048),
        "facilitation_notes_pdf"       varchar(2048),
        "printable_sbar_pdf"           varchar(2048),
        "printable_patient_chart_pdf"  varchar(2048),
        "sequence_groups_order_mode"   varchar,
        "conversation_responses"       jsonb,
        "patient_data"                 jsonb,
        "ai_patient_data"              jsonb,
        "expected_actions"             jsonb,
        "phases"                       jsonb,
        "available_medications"        jsonb,
        "student_briefing"             jsonb,
        "sbar"                         jsonb,
        "grading"                      jsonb,
        "metadata"                     jsonb,
        "product_setup"                jsonb,
        "orthopedic_worksheet"         jsonb,
        "timeline"                     jsonb,
        "sequences"                    jsonb,
        "sequence_groups"              jsonb,
        "team_communication"           jsonb,
        "created_at"                   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"                   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"                   TIMESTAMPTZ,
        CONSTRAINT "simulations_v2_pkey" PRIMARY KEY ("simulation_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_simulations_v2_deleted_at" ON "simulations_v2" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "simulations_v2_id_unique_active" ON "simulations_v2" ("id") WHERE "deleted_at" IS NULL`,
    );

    // ===================================================================
    // simulation_actions
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "simulation_actions" (
        "action_id"        uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "id"               text        NOT NULL,
        "simulation_id"    uuid        NOT NULL,
        "action_order"     integer     NOT NULL,
        "title"            text        NOT NULL,
        "action_type"      varchar     NOT NULL,
        "type_requirement" varchar,
        "is_distractor"    boolean     NOT NULL DEFAULT false,
        "is_excluded"      boolean     NOT NULL DEFAULT false,
        "is_optional"      boolean     NOT NULL DEFAULT false,
        "max_attempts"     integer,
        "prompt"                    text,
        "items"                     jsonb,
        "concepts"                  jsonb,
        "correct"                   jsonb,
        "category_id"               varchar,
        "vitals"                    jsonb,
        "vital_requirements"        jsonb,
        "vital_requirement_entries" jsonb,
        "result_media_type"         varchar,
        "result_name"               varchar,
        "result_content"            text,
        "result_media_url"          text,
        "result_media_name"         varchar,
        "limit_type"                varchar,
        "description"               text,
        "ideal_response"            text,
        "created_by"       uuid,
        "updated_by"       uuid,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ,
        CONSTRAINT "simulation_actions_pkey" PRIMARY KEY ("action_id"),
        CONSTRAINT "simulation_actions_action_type_check" CHECK ("action_type" IN ('single', 'ordering', 'vital', 'question')),
        CONSTRAINT "simulation_actions_type_requirement_check" CHECK ("type_requirement" IS NULL OR "type_requirement" IN ('Mandatory', 'Optional', 'Distractor')),
        CONSTRAINT "simulation_actions_max_attempts_check" CHECK ("max_attempts" IS NULL OR "max_attempts" > 0),
        CONSTRAINT "simulation_actions_result_media_type_check" CHECK ("result_media_type" IS NULL OR "result_media_type" IN ('text', 'image', 'pdf', 'mixed')),
        CONSTRAINT "simulation_actions_limit_type_check" CHECK ("limit_type" IS NULL OR "limit_type" IN ('unlimited', 'limited')),
        CONSTRAINT "FK_simulation_actions_simulation" FOREIGN KEY ("simulation_id") REFERENCES "simulations_v2" ("simulation_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_actions_simulation_id" ON "simulation_actions" ("simulation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_actions_simulation_type" ON "simulation_actions" ("simulation_id", "action_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_actions_deleted_at" ON "simulation_actions" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "simulation_actions_id_simulation_id_unique_active" ON "simulation_actions" ("id", "simulation_id") WHERE "deleted_at" IS NULL`,
    );

    // ===================================================================
    // simulation_orders
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "simulation_orders" (
        "order_id"           uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "id"                 text        NOT NULL,
        "simulation_id"      uuid        NOT NULL,
        "title"              text        NOT NULL,
        "category"           text        NOT NULL,
        "priority"           text        NOT NULL,
        "order_status"       text        NOT NULL,
        "start_day"          text,
        "due_time"           text,
        "expiration_offset"  text,
        "due_date"           text,
        "medication_config"  jsonb,
        "scenario_id"        text,
        "system_visibility"  text,
        "description"        text,
        "instructions"        text,
        "linked_action_ids"   jsonb,
        "linked_actions"      jsonb,
        "unlock_conditions"   jsonb,
        "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "simulation_orders_pkey" PRIMARY KEY ("order_id"),
        CONSTRAINT "FK_simulation_orders_simulation" FOREIGN KEY ("simulation_id") REFERENCES "simulations_v2" ("simulation_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_orders_simulation_id" ON "simulation_orders" ("simulation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_orders_simulation_category_status" ON "simulation_orders" ("simulation_id", "category", "order_status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "simulation_orders_id_simulation_id_unique" ON "simulation_orders" ("id", "simulation_id")`,
    );

    // ===================================================================
    // simulation_order_linked_actions
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "simulation_order_linked_actions" (
        "order_id"  uuid NOT NULL,
        "action_id" uuid NOT NULL,
        CONSTRAINT "simulation_order_linked_actions_pkey" PRIMARY KEY ("order_id", "action_id"),
        CONSTRAINT "FK_simulation_order_linked_actions_order" FOREIGN KEY ("order_id") REFERENCES "simulation_orders" ("order_id") ON DELETE CASCADE,
        CONSTRAINT "FK_simulation_order_linked_actions_action" FOREIGN KEY ("action_id") REFERENCES "simulation_actions" ("action_id") ON DELETE CASCADE
      )
    `);
    // The composite PK above already indexes ("order_id", "action_id") leading
    // with order_id — add the reverse-lookup index explicitly for action_id.
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_order_linked_actions_action_id" ON "simulation_order_linked_actions" ("action_id")`,
    );

    // ===================================================================
    // simulation_grading_rubric_items
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "simulation_grading_rubric_items" (
        "rubric_id"         uuid           NOT NULL DEFAULT uuid_generate_v4(),
        "id"                text           NOT NULL,
        "simulation_id"     uuid           NOT NULL,
        "name"              text           NOT NULL,
        "category_type"     text,
        "sub_category"      text           NOT NULL,
        "weight"            numeric(5,2),
        "scoring_model"     text,
        "required"          boolean        NOT NULL DEFAULT false,
        "evaluation_source" text,
        "description"       text,
        "checklist_items"   jsonb,
        "ai_mapping"                    jsonb,
        "communication_criteria"        jsonb,
        "learning_objective_id"         text,
        "patient_data_fields"           jsonb,
        "vitals_fields"                 jsonb,
        "expected_actions"              jsonb,
        "medications"                   jsonb,
        "communication_summary_prompt"  text,
        "created_by"        uuid,
        "updated_by"        uuid,
        "created_at"        TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ    NOT NULL DEFAULT now(),
        CONSTRAINT "simulation_grading_rubric_items_pkey" PRIMARY KEY ("rubric_id"),
        CONSTRAINT "simulation_grading_rubric_items_weight_check" CHECK ("weight" IS NULL OR "weight" >= 0),
        CONSTRAINT "simulation_grading_rubric_items_scoring_model_check" CHECK ("scoring_model" IS NULL OR "scoring_model" IN ('Graded', 'Binary')),
        CONSTRAINT "simulation_grading_rubric_items_evaluation_source_check" CHECK ("evaluation_source" IS NULL OR "evaluation_source" IN ('AI', 'System Check')),
        CONSTRAINT "FK_simulation_grading_rubric_items_simulation" FOREIGN KEY ("simulation_id") REFERENCES "simulations_v2" ("simulation_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_grading_rubric_items_simulation_id" ON "simulation_grading_rubric_items" ("simulation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_grading_rubric_items_simulation_subcategory" ON "simulation_grading_rubric_items" ("simulation_id", "sub_category")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_grading_rubric_items_sub_category" ON "simulation_grading_rubric_items" ("sub_category")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "simulation_grading_rubric_items_id_simulation_id_unique" ON "simulation_grading_rubric_items" ("id", "simulation_id")`,
    );

    // ===================================================================
    // simulation_grading_rubric_item_history — populated only by the trigger
    // below. No FK on simulation_id: it must survive whole-simulation deletes
    // (ON DELETE CASCADE into simulation_grading_rubric_items fires as an
    // AFTER DELETE trigger on simulations_v2, so the parent row is already
    // gone by the time this table's BEFORE UPDATE/DELETE history trigger
    // inserts a row referencing it). rubric_item_id is likewise not a FK, for
    // the same "must survive the row it describes being deleted" reason.
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "simulation_grading_rubric_item_history" (
        "history_id"     uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "rubric_item_id" uuid        NOT NULL,
        "simulation_id"  uuid        NOT NULL,
        "snapshot"       jsonb       NOT NULL,
        "operation"      text        NOT NULL,
        "changed_by"     uuid,
        "changed_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "simulation_grading_rubric_item_history_pkey" PRIMARY KEY ("history_id"),
        CONSTRAINT "simulation_grading_rubric_item_history_operation_check" CHECK ("operation" IN ('UPDATE', 'DELETE'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_grading_rubric_item_history_rubric_item_id" ON "simulation_grading_rubric_item_history" ("rubric_item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_simulation_grading_rubric_item_history_simulation_id" ON "simulation_grading_rubric_item_history" ("simulation_id")`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION snapshot_simulation_grading_rubric_item()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO simulation_grading_rubric_item_history (rubric_item_id, simulation_id, snapshot, operation, changed_by)
        VALUES (OLD.rubric_id, OLD.simulation_id, to_jsonb(OLD), TG_OP, OLD.updated_by);
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_simulation_grading_rubric_items_history
      BEFORE UPDATE OR DELETE ON simulation_grading_rubric_items
      FOR EACH ROW
      EXECUTE FUNCTION snapshot_simulation_grading_rubric_item();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_simulation_grading_rubric_items_history ON simulation_grading_rubric_items`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS snapshot_simulation_grading_rubric_item()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "simulation_grading_rubric_item_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "simulation_grading_rubric_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "simulation_order_linked_actions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "simulation_orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "simulation_actions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "simulations_v2"`);
  }
}
