---
paths:
  - 'src/database/repositories/**'
  - 'src/database/services/**'
  - 'src/database/tokens.ts'
  - 'src/database/database.module.ts'
---

# Rules: `src/database/` repository layer

Extends the Data layer bullet of root `CLAUDE.md`. Entity rules: `database-entities-rules.md`.

## Structure

- `entities/` — TypeORM entity classes, re-exported via `entities/index.ts`.
- `repositories/<entity>.repository.ts` — one concrete `@Injectable()` TypeORM adapter class per entity (e.g. `UserRepository`), exposing **specific, intent-named methods** (`findBySubscriptionCode`, `deactivate`, `acceptInvite`). Older repositories also carry generic pass-throughs (`find`, `findOne`, `findAndCount`, `update`, `delete`, …); those are legacy (rule 3).
- `services/database.service.ts` — thin `DataSource` wrapper exposing `pingCheck()`.
- `tokens.ts` — one DI `Symbol` per repository (e.g. `USER_REPOSITORY`).
- `database.module.ts` — the single `@Global()` module wiring which adapter backs each token. Swapping the ORM = a sibling adapter with the same public methods, repointed here.

This layer is additive: legacy per-domain entities/services (e.g. `UsersService` owning `src/users/entity/user.entity.ts`) stay as they are.

## Rules

1. **New entity support, in order:** entity in `entities/` → adapter class in `repositories/` → token in `tokens.ts` → wiring in `database.module.ts`.
2. **No `contracts/` / interface layer.** Repositories are concrete classes; consumers inject by token and type against the class (`@Inject(USER_REPOSITORY) private readonly userRepo: UserRepository`), never `Repository<T>`.
3. **Specific methods only — no new generic methods.** Every new repository method is named for one query or write the caller needs, and builds its own `where`/`select`/`relations`/`order` inside the method body.
   - **Never add** a generic pass-through that forwards TypeORM options from the caller (`find(options)`, `findOne(options)`, `findAndCount(options)`, `count(where)`, `exists(where)`, `update(where, data)`, `delete(where)`, `save(entity)`).
   - **Name by intent:** `findPendingByEmail(email)`, `findActiveBySchoolId(schoolId, pagination)`, `countStudentsInClass(classId)`, `markAccepted(inviteId)`, `softDeleteByClassId(classId)`.
   - **Legacy generic methods** already in a repository stay as they are. Don't delete them in unrelated changes, but don't add new call sites either: new service code needing a query adds a specific method instead of passing `FindOptions` from the service. A specific method may call the legacy generic one internally.
4. **No TypeORM types in public method signatures.** `FindOptionsWhere`, `FindOneOptions`, `FindManyOptions`, `FindOptionsSelect`, `FindOptionsOrder`, `DeepPartial`, `EntityManager`, `QueryRunner` and `UpdateResult`/`DeleteResult` stay inside the repository.
   - Parameters are plain values (ids, strings, enums) or, when there are more than about three, one params interface.
   - Create/update payloads use a params interface in `src/common/interfaces/` naming exactly the writable fields (it may be defined there as `Pick<Entity, ...>`).
   - Return the entity, an array of entities, a projection interface, or a plain value (`number` affected rows, `boolean`), never a raw TypeORM result object.
5. **No `interface`/`type` declared in a repository file**, not even a method-local params/result shape. Put it in `src/common/interfaces/<name>.interface.ts` (re-exported via `index.ts`) and import it, e.g. `AcceptInviteInput`.
6. **Multi-table writes** that must be atomic are one specific method that owns the transaction (`this.repo.manager.transaction(...)`), as `InviteRepository.acceptInvite` does. Never pass an `EntityManager` in from a service.
7. Repositories are the only place outside `src/users/` that import concrete TypeORM entities.
8. Don't leak driver-specific types (e.g. `QueryFailedError`) into repository signatures consumed by services; error mapping belongs in `HttpExceptionFilter`.
9. **Query style — first option that can express the query wins:**
   1. **Repository API** (`find*`, `count`, `exists`, `save`, `insert`, `update`, `upsert`, `delete`, `softDelete`, `increment`) with find options and operators (`In`, `IsNull`, `ILike`, `Raw`).
   2. **Query builder** (`createQueryBuilder`) for what find options can't express: aggregates/`GROUP BY`/`HAVING`, sub-queries, joins on non-relation columns, expression-based bulk updates.
   3. **Raw SQL** (`query()`) only when the query builder can't express it either; add a comment saying why, and map rows to a projection interface (rule 4).
   - Always bind parameters (`:name` / `$1`); never interpolate values into SQL.

## Example

```ts
// ❌ generic pass-through: the service builds TypeORM options, so the ORM leaks out
async findOne(options: FindOneOptions<Invite>): Promise<Invite | null> {
  return this.repo.findOne(options);
}
// service: this.inviteRepo.findOne({ where: { email, status: InviteStatus.PENDING } })

// ✅ specific method: the query lives in the repository, the signature is plain
async findPendingByEmail(email: string): Promise<Invite | null> {
  return this.repo.findOne({ where: { email, status: InviteStatus.PENDING } });
}
// service: this.inviteRepo.findPendingByEmail(dto.email)
```
