---
paths:
  - 'src/database/entities/**'
  - 'src/database/response-dto/**'
  - 'src/database/migrations/**/*.ts'
---

# Rules: `src/database/entities/`

Extends root `CLAUDE.md` (entities re-exported via `entities/index.ts`, each paired with a repository in `repositories/`, a token in `tokens.ts`, and wiring in `database.module.ts`).

## Naming

1. **Methods** (getters, `@BeforeInsert`/`@BeforeUpdate` hooks): `camelCase`.
2. **Columns:** every `@Column` and `@PrimaryGeneratedColumn` maps to `snake_case` via an explicit `name`.
   - Exempt: a property that is a single lowercase word (`name`, `description`), where `name` is optional.

```ts
@Column({ name: 'image_url', type: 'varchar', length: 2048, nullable: true })
imageUrl?: string;
```

## Required base columns (pattern: [unit.entity.ts](../../src/database/entities/unit.entity.ts))

3. Every entity defines all four:

```ts
@PrimaryGeneratedColumn('uuid', { name: '<entity>_id' })  // UUID, never an incrementing int
<entity>Id!: string;

@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
createdAt!: Date;

@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
updatedAt!: Date;

@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
deletedAt?: Date | null;
```

## Foreign keys: relation on both sides

4. Every FK column needs a real relation decorator, declared on **both** entities:
   - **Child (owning side):** a scalar FK `@Column` **plus** `@ManyToOne` and `@JoinColumn({ name: '<column>_id' })`, both on the same DB column.
   - **Parent (inverse side):** the matching `@OneToMany` (or `@OneToOne` for 1:1), even if nothing reads it yet.
5. **Never** hand-write join `ON` conditions (`'a.simulation_id = s.simulation_id'`). Joins go through relation metadata (`relations: [...]`, `leftJoinAndSelect('e.relation')`).
6. **Scope:** applies to new entities and new FK columns. Existing plain-column FKs (e.g. `OrderLinkedAction`, `ClassSimulation`/`EducatorSimulation` link fields) are upgraded incrementally, both sides at once, when a query needs it (per `service-rules.md`). No mass retrofits.

```ts
// child: simulation-action.entity.ts
@Column({ name: 'simulation_id', type: 'uuid' })
simulationId!: string;

@ManyToOne(() => Simulation, (simulation) => simulation.actions)
@JoinColumn({ name: 'simulation_id' })
simulation?: Simulation;

// parent: simulation.entity.ts
@OneToMany(() => SimulationAction, (action) => action.simulation)
actions?: SimulationAction[];
```

## Response DTO

7. **Location:** `src/database/response-dto/<entity>.dto.ts`, using the same filename stem as the entity.
8. **`implements` the entity, never `extends` it.** Redeclare **every** field, each with `@ApiProperty`/`@ApiPropertyOptional` and an example (`dto-rules.md`).
9. **Re-export** it from `src/database/response-dto/index.ts`. Feature DTOs import from this barrel via `PickType`.
10. **Services return this DTO** as `ResponseResult<T>.data` (`service-rules.md`). Never return a raw entity from a service or controller.

```ts
// src/database/response-dto/unit.dto.ts
export class UnitResponseDto implements Unit {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  unitId!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/units/cardiac-care.png' })
  imageUrl?: string;
  // ...every other Unit field
}
```
