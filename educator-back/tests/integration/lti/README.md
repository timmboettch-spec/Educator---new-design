# LTI Integration Tests

This directory contains integration tests for the LTI 1.3 launch flow.

## Test Structure

### 1. Token Factory Tests (`tests/unit/lti/lti-token.factory.spec.ts`)
Unit tests for the JWT token helper used by integration tests:
- Educator and student token generation
- Required LTI 1.3 claims validation
- JWT structure and encoding
- Custom claim support

### 2. HTTP Endpoint Tests (`lti-http-endpoints.integration.spec.ts`)
Tests the full HTTP flow for LTI endpoints:
- `/api/lti/callback` - OIDC callback handling
- `/api/lti/launch` - Complete educator launch flow
- `/api/lti/studentcallback` - OIDC callback for student launch
- `/api/lti/studentlaunch` - Complete student launch flow
- `/api/lti/session/exchange` - Session code exchange

### 3. NRPS Roster Sync Tests (`lti-nrps-sync.integration.spec.ts`)
Tests roster synchronization from LTI 1.3 NRPS endpoints:
- Roster fetch with valid responses
- Empty and large roster handling
- Multiple roles per student
- Missing data (email, etc.)
- Authentication and API failures
- Duplicate student handling
- Course ID extraction from NRPS URLs

## What's Tested

### HTTP Endpoints (29 passing tests)
- **OIDC Callback (Educator)**: HTML form generation with id_token
- **OIDC Callback (Student)**: HTML form generation for student launch
- **Launch Flow (Educator)**: Complete educator launch with JWT verification, state validation, session creation
- **Launch Flow (Student)**: Complete student launch with student code lookup, login validation, session creation
- **Session Exchange (Both)**: Session code to JWT token exchange for educators and students
- **Error Scenarios**: Missing tokens, invalid school configs, JWT verification failures, role validation, student not found

### NRPS Roster Sync (12 passing tests)
- **Basic Roster Fetch**: Valid NRPS response with multiple students
- **Edge Cases**: Empty roster, large roster (100+ students), missing email data
- **Multiple Roles**: Students with multiple LTI roles (Learner + Mentor)
- **Error Handling**: Authentication failures, NRPS API failures, malformed URLs
- **Data Quality**: Duplicate students in roster, instructors mixed with students
- **URL Parsing**: Course ID extraction from NRPS membership URLs

### Token Factory (All tests passing)
- JWT claim structure for both educator and student tokens
- Role differentiation (Instructor vs Learner)
- NRPS claim inclusion
- Base64url encoding validation
- Unique nonce generation
- Expiration time validation

## How It Works

### Dedicated Test Module Approach
These tests use a **dedicated test module** with fully mocked services to avoid deep dependency issues:

```typescript
Test.createTestingModule({
  controllers: [LtiController],
  providers: [
    { provide: LtiJwtService, useValue: mockLtiJwtService },
    { provide: LtiStateService, useValue: mockLtiStateService },
    // ... all other dependencies mocked
  ],
})
```

**Benefits:**
- No real database or external service dependencies
- Fast execution (completes in ~2 seconds)
- Isolated testing of controller logic
- No complex module imports that pull in the entire dependency tree

**Mocked Services:**
- `LtiJwtService` - JWT verification and decoding
- `LtiStateService` - CSRF state validation
- `LtiSessionService` - Session code creation and exchange
- `LmsConfigService` - School configuration lookup
- `AuthService` - User authentication and creation
- All other supporting services

### Test Token Generation
The `LtiTokenFactory` generates unsigned fake JWTs with realistic LTI 1.3 claim structure:
- Standard JWT claims (iss, aud, sub, exp, iat, nonce)
- LTI-specific claims (roles, context, NRPS)
- Base64url encoding (not cryptographically signed)

## Running Tests

```bash
# Run all LTI integration tests
pnpm test:integration tests/integration/lti/

# Run specific test file
pnpm test:integration tests/integration/lti/lti-http-endpoints.integration.spec.ts

# Run with verbose output
node node_modules/jest/bin/jest.js --config ./tests/jest-integration.json tests/integration/lti/ --verbose
```

## CI Integration

These tests run automatically on every PR to `dev`:
- Part of the `test-integration` job in `.github/workflows/deploy-app.yml`
- Must pass before merging (hard gate)
- Runs in parallel with unit tests

## Current Coverage

### ✅ Covered
- OIDC callback endpoint (POST /api/lti/callback)
- Student OIDC callback (POST /api/lti/studentcallback)
- Educator launch flow (POST /api/lti/launch)
  - JWT decoding and verification
  - LMS config resolution
  - State validation
  - User authentication/creation
  - Session code generation
- Student launch flow (POST /api/lti/studentlaunch)
  - Student code lookup and mapping
  - Role validation
  - Login flow
- Session exchange (POST /api/lti/session/exchange) for both audiences
- NRPS roster synchronization
  - Roster fetch from NRPS endpoints
  - Authentication and error handling
  - Edge cases (empty, large, duplicate data)
- Error scenarios (missing tokens, invalid configs, JWT failures)
- JWT claim structure for both educator and student tokens


## Implementation Notes

### Why Dedicated Test Module?
Initial attempts to test with the full `LtiModule` encountered:
- Deep dependency chains (AuthModule → UsersModule → multer)
- External package resolution issues in Jest
- Private method mocking complexity

The dedicated test module approach provides:
- Comprehensive HTTP endpoint coverage
- Fast, reliable execution
- Clear test failures when controller logic changes
- Easy maintenance and debugging

### Complementary Testing Strategy
1. **Integration tests (this folder)**: HTTP endpoints, request/response flow
2. **Unit tests (src/lti/*.spec.ts)**: Individual service logic, JWT verification
3. **Manual QA**: End-to-end flow with real Moodle on dev environment

This combination provides thorough coverage without test fragility.

## Adding New Tests

When adding new LTI endpoints or modifying existing ones:

1. Add HTTP endpoint tests to `lti-http-endpoints.integration.spec.ts`
2. Mock all required services in the `beforeAll` setup
3. Test both success and error scenarios
4. Verify service interactions with `expect(service.method).toHaveBeenCalled()`

Example:
```typescript
it('INTEGRATION: should handle new endpoint', async () => {
  // Setup mocks
  jest.spyOn(someService, 'method').mockResolvedValue(mockData);

  // Make request
  const response = await request(httpServer())
    .post('/api/lti/new-endpoint')
    .send({ data: 'test' })
    .expect(200);

  // Assert response
  expect(response.body).toEqual(expectedData);
  
  // Verify service calls
  expect(someService.method).toHaveBeenCalledWith(expectedArgs);
});
```

