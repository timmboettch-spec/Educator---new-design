import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import * as fs from 'fs';

import * as path from 'path';

import { APIClient } from '../../utils/apiClient';

import { endpoints } from '../../utils/endpoints';

import { logStep } from '../../utils/logger';

import {
  validateStatusCode,
  validateFieldValue,
} from '../../utils/responseValidator';

import type {
  LoginResponseData,
  RegisterApiTestData,
} from '../../types/api.types';

/**
 * Reality Works - Simulation Module API Tests
 * @tag @simulation
 */

describe(
  'Simulation Module API Tests',

  () => {

    let apiClient: APIClient;

    let latestUserData:
      RegisterApiTestData;

    let educatorEmail = '';

    beforeAll(() => {

      /**
       * LOAD REGISTER USER DATA
       */
      const registerApiPath =
        path.resolve(
          __dirname,
          '../../test-data/registerApi.json'
        );

      latestUserData = JSON.parse(
        fs.readFileSync(
          registerApiPath,
          'utf-8'
        )
      ) as RegisterApiTestData;

      /**
       * EDUCATOR EMAIL
       */
      educatorEmail =
        latestUserData
          .educatorcreate.email;

    });

    beforeEach(() => {

      /**
       * INITIALIZE API CLIENT
       */
      apiClient = new APIClient();

    });

    /**
     * GET SIMULATION DASHBOARD
     */
    it(
      'should get simulation dashboard with valid educator token @simulation',

      async () => {

        logStep(
          'Get simulation dashboard'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

              password:
                latestUserData
                  .educatorcreate.password,
            }
          );

        /**
         * LOGIN BODY
         */
        const loginBody =
          loginResponse.body;

        /**
         * LOGIN VALIDATIONS
         */
        validateStatusCode(
          loginResponse.status,
          201
        );

        validateFieldValue(
          loginBody,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          loginBody,
          'message',
          'Login successful'
        );

        /**
         * ACCESS TOKEN
         */
        const accessToken =
          loginBody.data.tokens
            .accessToken;

        expect(
          accessToken
        ).toBeTruthy();

        /**
         * SIMULATION DASHBOARD API
         */
        const simulationResponse =
          await apiClient.get(
            endpoints.auth.simulationcatalog,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        /**
         * RESPONSE BODY
         */
        const responseBody =
          simulationResponse.body as {
            status: string;
            message: string;
            data: unknown;
          };

        /**
         * VALIDATIONS
         */
        validateStatusCode(
          simulationResponse.status,
          200
        );

        validateFieldValue(
          responseBody,
          'status',
          'SUCCESS'
        );

      }
    );

    it(
      'should Pass get simulation dashboard without token @simulation',

      async () => {

        logStep(
          'Get simulation dashboard without token'
        );

        const simulationResponse =
          await apiClient.get(
            endpoints.auth.simulationcatalog,
            {
              includeAuth: false,
            }
          );

        validateStatusCode(
          simulationResponse.status,
          200
        );

        validateFieldValue(
          simulationResponse.body,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          simulationResponse.body,
          'message',
          'Simulation catalog dashboard fetched successfully'
        );

      }
    );
    it(
      'should get simulation scenarios with valid educator token @simulation',
        async () => {
            logStep(
                'Get simulation scenarios with valid educator token'
            );
            /**             * EDUCATOR LOGIN API
             */
            const loginResponse =
                await apiClient.post<LoginResponseData>(
                    endpoints.auth.login,
                    {
                        email: educatorEmail,
                        password: latestUserData.educatorcreate.password,
                    }
                );
            /**             * LOGIN BODY
             */
            const loginBody = loginResponse.body;
            /**             * LOGIN VALIDATIONS
             */
            validateStatusCode(loginResponse.status, 201);
            validateFieldValue(loginBody, 'status', 'SUCCESS');
            validateFieldValue(loginBody, 'message', 'Login successful');
            /**             * ACCESS TOKEN
             */
            const accessToken = loginBody.data.tokens.accessToken;
            expect(accessToken).toBeTruthy();
            /**             * SIMULATION SCENARIOS API
             */
            const scenariosResponse = await apiClient.get(
                endpoints.auth.simulationscenarios,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    includeAuth: false,
                }
            );
            
            validateStatusCode(scenariosResponse.status, 200);
            validateFieldValue(scenariosResponse.body, 'status', 'SUCCESS');

            validateFieldValue(scenariosResponse.body, 'message', 'Simulation catalog fetched successfully');
        }
    );

    it(
      'should fail get simulation scenarios without token @simulation',

      async () => {

        logStep(
          'Get simulation scenarios without token'
        );

        const scenariosResponse =
          await apiClient.get(
            endpoints.auth.simulationscenarios,
            {
              includeAuth: false,
            }
          );

        validateStatusCode(
          scenariosResponse.status,
          401
        );

        validateFieldValue(
          scenariosResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          scenariosResponse.body,
          'message',
          'Unauthorized'
        );

      }
    );

    it(
      'should fail get simulation scenarios with invalid token @simulation',

      async () => {

        logStep(
          'Get simulation scenarios with invalid token'
        );

        const scenariosResponse =
          await apiClient.get(
            endpoints.auth.simulationscenarios,
            {
              headers: {
                Authorization:
                  'Bearer invalidtoken',
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          scenariosResponse.status,
          401
        );

        validateFieldValue(
          scenariosResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          scenariosResponse.body,
          'message',
          'Unauthorized'
        );

      }
    );

    // https://dev.educatorbe.realityworksai.com/api/scenarios/unit/UAT-002 same get request
    // UAT-002 is the unitId for the first scenario in the catalog
    // educaor valid token
    // should return 200 and details of the scenario
    

it.skip(
  'should get simulation scenario details with valid educator token @simulation',

  async () => {

    logStep(
      'Get simulation scenario details with valid educator token'
    );

    /**
     * EDUCATOR LOGIN API
     */
    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

          password:
            latestUserData
              .educatorcreate.password,
        }
      );

    /**
     * LOGIN BODY
     */
    const loginBody =
      loginResponse.body;

    /**
     * LOGIN VALIDATIONS
     */
    validateStatusCode(
      loginResponse.status,
      201
    );

    validateFieldValue(
      loginBody,
      'status',
      'SUCCESS'
    );

    validateFieldValue(
      loginBody,
      'message',
      'Login successful'
    );

    /**
     * ACCESS TOKEN
     */
    const accessToken =
      loginBody.data.tokens
        .accessToken;

    expect(
      accessToken
    ).toBeTruthy();

    /**
     * GET SIMULATION CATALOG
     */
    const catalogResponse =
      await apiClient.get(
        endpoints.auth.simulationcatalog,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    const catalogBody =
      catalogResponse.body as {
        status: string;
        message: string;
        data: {
          browseBy?: {
            items?: Array<{
              unit: string;
              title: string;
            }>;
          };
        };
      };

    
    /**
     * CATALOG VALIDATIONS
     */
    // wait for 5mins to load the API
    await new Promise(resolve => setTimeout(resolve, 300000));
    validateStatusCode(
      catalogResponse.status,
      200
    );

    validateFieldValue(
      catalogBody,
      'status',
      'SUCCESS'
    );

    /**
     * GET UNIT ID
     */
    if (
      !catalogBody.data?.browseBy?.items ||
      catalogBody.data
        .browseBy.items.length === 0
    ) {

      throw new Error(
        `No units found in catalog response: ${JSON.stringify(catalogBody)}`
      );

    }

    const unitId =
      catalogBody.data
        .browseBy.items[1]
        .unit;

    /**
     * GET SCENARIO DETAILS
     */
    const scenarioDetailsResponse =
      await apiClient.get(
        `${endpoints.auth.simulationdetails}${unitId}`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    const responseBody =
      scenarioDetailsResponse.body as {
        status: string;
        message: string;
        data: unknown;
      };
      // wait for 2mins to load the API
    await new Promise(resolve => setTimeout(resolve, 120000));
    /**
     * VALIDATIONS
     */
    validateStatusCode(
      scenarioDetailsResponse.status,
      200
    );

    validateFieldValue(
      responseBody,
      'status',
      'SUCCESS'
    );
    validateFieldValue(
        responseBody,
        'message',
        'All simulations fetched successfully'
      );

  },
  480000
);



it(
  'should add simulation to library with valid educator token @simulation',

  async () => {

    logStep(
      'Add simulation to library with valid educator token'
    );

    /**
     * EDUCATOR LOGIN API
     */
    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

          password:
            latestUserData
              .educatorcreate.password,
        }
      );

    const loginBody =
      loginResponse.body;

    validateStatusCode(
      loginResponse.status,
      201
    );

    validateFieldValue(
      loginBody,
      'status',
      'SUCCESS'
    );

    /**
     * ACCESS TOKEN
     */
    const accessToken =
      loginBody.data.tokens
        .accessToken;

    expect(
      accessToken
    ).toBeTruthy();

    /**
     * GET SIMULATION CATALOG
     */
    const catalogResponse =
      await apiClient.get(
        endpoints.auth.simulationcatalog,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    const catalogBody =
      catalogResponse.body as {
        status: string;
        message: string;
        data: {
          sections: Array<{
            items: Array<{
              id: string | number;
            }>;
          }>;
        };
      };
      

    /**
     * GET FIRST SCENARIO ID
     */

    
    const scenarioId =
      catalogBody.data
        .sections[0]
        .items[0]
        .id;


    /**
     * ADD TO LIBRARY PAYLOAD
     */
    const payload = {
      scenario_id:
        scenarioId,
    };

    /**
     * ADD TO LIBRARY API
     */
    const response =
      await apiClient.post(
        endpoints.auth
          .simulationlibraryadd,
        payload,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    const responseBody =
      response.body as {
        status: string;
        message: string;
        data: unknown;
      };

    /**
     * VALIDATIONS
     */
    validateStatusCode(
      response.status,
      201
    );

    validateFieldValue(
      responseBody,
      'status',
      'SUCCESS'
    );
    validateFieldValue(
        responseBody,
        'message',
        'Simulation added to library successfully'
      );

  }
);

it(
  'should fail add simulation to library without token @simulation',

  async () => {

    logStep(
      'Add simulation to library without token'
    );

    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

          password:
            latestUserData
              .educatorcreate.password,
        }
      );

    const loginBody =
      loginResponse.body;

    validateStatusCode(
      loginResponse.status,
      201
    );

    const accessToken =
      loginBody.data.tokens.accessToken;

    expect(
      accessToken
    ).toBeTruthy();

    const catalogResponse =
      await apiClient.get(
        endpoints.auth.simulationcatalog,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );
      const catalogBody =
  catalogResponse.body as {
    data: {
      sections: Array<{
        items: Array<{
          id: string | number;
        }>;
      }>;
    };
  };
    const scenarioId =
      catalogBody.data
        .sections[0]
        .items[0]
        .id;

    const payload = {
      scenario_id:
        scenarioId,
    };

    const response =
      await apiClient.post(
        endpoints.auth
          .simulationlibraryadd,
        payload,
        {
          includeAuth: false,
        }
      );

    validateStatusCode(
      response.status,
      401
    );

    validateFieldValue(
      response.body,
      'status',
      'FAILED'
    );

    validateFieldValue(
      response.body,
      'message',
      'Unauthorized'
    );

  }
);


it(
  'should fail add simulation to library with invalid token @simulation',

  async () => {

    logStep(
      'Add simulation to library with invalid token'
    );

    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

          password:
            latestUserData
              .educatorcreate.password,
        }
      );

    const loginBody =
      loginResponse.body;

    validateStatusCode(
      loginResponse.status,
      201
    );

    const accessToken =
      loginBody.data.tokens.accessToken;

    expect(
      accessToken
    ).toBeTruthy();

    const catalogResponse =
      await apiClient.get(
        endpoints.auth.simulationcatalog,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

      const catalogBody =
  catalogResponse.body as {
    data: {
      sections: Array<{
        items: Array<{
          id: string | number;
        }>;
      }>;
    };
  };
    const scenarioId =
      catalogBody.data
        .sections[0]
        .items[0]
        .id;

    const payload = {
      scenario_id:
        scenarioId,
    };

    const response =
      await apiClient.post(
        endpoints.auth
          .simulationlibraryadd,
        payload,
        {
          headers: {
            Authorization:
              'Bearer invalidtoken',
          },

          includeAuth: false,
        }
      );

    validateStatusCode(
      response.status,
      401
    );

    validateFieldValue(
      response.body,
      'status',
      'FAILED'
    );

    validateFieldValue(
      response.body,
      'message',
      'Unauthorized'
    );

  }
);


it(
  'should fail add simulation to library with invalid scenario id @simulation',

  async () => {

    logStep(
      'Add simulation to library with invalid scenario id'
    );

    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

          password:
            latestUserData
              .educatorcreate.password,
        }
      );

    const loginBody =
      loginResponse.body;

    validateStatusCode(
      loginResponse.status,
      201
    );

    validateFieldValue(
      loginBody,
      'status',
      'SUCCESS'
    );

    const accessToken =
      loginBody.data.tokens.accessToken;

    expect(
      accessToken
    ).toBeTruthy();

    const payload = {
      scenario_id: 'invalid-scenario-id',
    };

    const response =
      await apiClient.post(
        endpoints.auth
          .simulationlibraryadd,
        payload,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    validateStatusCode(
      response.status,
      404
    );

    validateFieldValue(
      response.body,
      'status',
      'FAILED'
    );
    validateFieldValue(
      response.body,
      'message',
      'Simulation not found in library'
    );

  }
);


it(
  'should fail add simulation to library with empty payload @simulation',

  async () => {

    logStep(
      'Add simulation to library with empty payload'
    );

    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

          password:
            latestUserData
              .educatorcreate.password,
        }
      );

    const loginBody =
      loginResponse.body;

    validateStatusCode(
      loginResponse.status,
      201
    );

    validateFieldValue(
      loginBody,
      'status',
      'SUCCESS'
    );

    const accessToken =
      loginBody.data.tokens.accessToken;

    expect(
      accessToken
    ).toBeTruthy();

    const response =
      await apiClient.post(
        endpoints.auth
          .simulationlibraryadd,
        {},
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    validateStatusCode(
      response.status,
      400
    );

    validateFieldValue(
      response.body,
      'status',
      'FAILED'
    );
    validateFieldValue(
      response.body,
      'message',
      'Scenario ID is required'
    );

  }
);


it(
  'should fail add duplicate simulation to library @simulation',

  async () => {

    logStep(
      'Add duplicate simulation to library'
    );

    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

          password:
            latestUserData
              .educatorcreate.password,
        }
      );

    const loginBody =
      loginResponse.body;

    validateStatusCode(
      loginResponse.status,
      201
    );

    validateFieldValue(
      loginBody,
      'status',
      'SUCCESS'
    );

    const accessToken =
      loginBody.data.tokens.accessToken;

    expect(
      accessToken
    ).toBeTruthy();

    const catalogResponse =
      await apiClient.get(
        endpoints.auth.simulationcatalog,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );
const catalogBody =
  catalogResponse.body as {
    data: {
      sections: Array<{
        items: Array<{
          id: string | number;
        }>;
      }>;
    };
  };
    const scenarioId =
      catalogBody.data
        .sections[0]
        .items[0]
        .id;

    const payload = {
      scenario_id:
        scenarioId,
    };

    await apiClient.post(
      endpoints.auth
        .simulationlibraryadd,
      payload,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },

        includeAuth: false,
      }
    );

    const duplicateResponse =
      await apiClient.post(
        endpoints.auth
          .simulationlibraryadd,
        payload,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    validateStatusCode(
      duplicateResponse.status,
      400
    );

    validateFieldValue(
      duplicateResponse.body,
      'status',
      'FAILED'
    );
    validateFieldValue(
      duplicateResponse.body,
      'message',
      'Simulation already exists in library'
    );
  }
);

  /**
   * SIMULATION CATALOG RESPONSE TIME
   */
  it.skip(
    'should fetch simulation catalog within acceptable time @simulation',

    async () => {

      logStep(
        'Verify simulation catalog response time'
      );

      const loginResponse =
        await apiClient.post<
          LoginResponseData
        >(
          endpoints.auth.login,
          {
            email:
              educatorEmail,

            password:
              latestUserData
                .educatorcreate.password,
          }
        );

      const accessToken =
        loginResponse.body.data.tokens.accessToken;

      const startTime = Date.now();

      const catalogResponse =
        await apiClient.get(
          endpoints.auth.simulationcatalog,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },

            includeAuth: false,
          }
        );

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      validateStatusCode(
        catalogResponse.status,
        200
      );

      expect(responseTime).toBeLessThan(5000);

    }
  );

  /**
   * SIMULATION RESPONSE STRUCTURE VALIDATION
   */
  it(
    'should return correct simulation response structure @simulation',

    async () => {

      logStep(
        'Verify simulation response structure'
      );

      const loginResponse =
        await apiClient.post<
          LoginResponseData
        >(
          endpoints.auth.login,
          {
            email:
              educatorEmail,

            password:
              latestUserData
                .educatorcreate.password,
          }
        );

      const accessToken =
        loginResponse.body.data.tokens.accessToken;

      const catalogResponse =
        await apiClient.get(
          endpoints.auth.simulationcatalog,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },

            includeAuth: false,
          }
        );

      const body = catalogResponse.body as Record<string, unknown>;

      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('data');

    }
  );

  /**
   * GET SIMULATION SCENARIOS WITHOUT TOKEN
   */
  it(
    'should fail get simulation scenarios without token @simulation',

    async () => {

      logStep(
        'Get simulation scenarios without token'
      );

      const scenariosResponse =
        await apiClient.get(
          endpoints.auth.simulationscenarios,
          {
            includeAuth: false,
          }
        );

      validateStatusCode(
        scenariosResponse.status,
        401
      );

      validateFieldValue(
        scenariosResponse.body,
        'status',
        'FAILED'
      );

    }
  );
  /**
   * GET SIMULATION LIBRARY
   */
  it(
    'should get simulation library with valid token @simulation',

    async () => {

      logStep(
        'Get simulation library'
      );

      const loginResponse =
        await apiClient.post<
          LoginResponseData
        >(
          endpoints.auth.login,
          {
            email:
              educatorEmail,

            password:
              latestUserData
                .educatorcreate.password,
          }
        );

      const accessToken =
        loginResponse.body.data.tokens.accessToken;

      const libraryResponse =
        await apiClient.get(
          endpoints.auth.simulationlibrary,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },

            includeAuth: false,
          }
        );

      validateStatusCode(
        libraryResponse.status,
        200
      );

      expect(libraryResponse.body).toHaveProperty('status');
      expect(libraryResponse.body).toHaveProperty('data');

    }
  );

  /**
   * GET SIMULATION LIBRARY WITHOUT TOKEN
   */
  it(
    'should fail get simulation library without token @simulation',

    async () => {

      logStep(
        'Get simulation library without token'
      );

      const libraryResponse =
        await apiClient.get(
          endpoints.auth.simulationlibrary,
          {
            includeAuth: false,
          }
        );

      validateStatusCode(
        libraryResponse.status,
        401
      );

      validateFieldValue(
        libraryResponse.body,
        'status',
        'FAILED'
      );

    }
  );

  /**
   * GET SIMULATION SCENARIOS
   */
  it(
    'should get simulation scenarios with valid token @simulation',

    async () => {

      logStep(
        'Get simulation scenarios'
      );

      const loginResponse =
        await apiClient.post<
          LoginResponseData
        >(
          endpoints.auth.login,
          {
            email:
              educatorEmail,

            password:
              latestUserData
                .educatorcreate.password,
          }
        );

      const accessToken =
        loginResponse.body.data.tokens.accessToken;

      const scenariosResponse =
        await apiClient.get(
          endpoints.auth.simulationscenarios,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },

            includeAuth: false,
          }
        );

      validateStatusCode(
        scenariosResponse.status,
        200
      );

      validateFieldValue(
        scenariosResponse.body,
        'status',
        'SUCCESS'
      );

    }
  );

  // ─── GET /simulation-catalog/dashboard/:id ────────────────────────────────

  it(
    'should get simulation detail by valid scenario id @simulation',
    async () => {
      logStep('GET simulation-catalog/dashboard/:id — valid id');

      // Step 1: get catalog to extract a real scenario id
      const catalogResponse = await apiClient.get(
        endpoints.auth.simulationcatalog,
        { includeAuth: false },
      );

      validateStatusCode(catalogResponse.status, 200);

      const catalogBody = catalogResponse.body as {
        data: { sections?: Array<{ items?: Array<{ id: string }> }> };
      };

      const scenarioId =
        catalogBody.data?.sections?.[0]?.items?.[0]?.id ?? '';

      if (!scenarioId) {
        logStep('Skipping: no scenario id found in catalog');
        return;
      }

      // Step 2: fetch the detail
      const response = await apiClient.get(
        `${endpoints.auth.simulationcatalog}/${scenarioId}`,
        { includeAuth: false },
      );

      validateStatusCode(response.status, 200);
      validateFieldValue(response.body, 'status', 'SUCCESS');
      validateFieldValue(
        response.body,
        'message',
        'Simulation detail fetched successfully',
      );
    },
  );

  it(
    'should return 404 for non-existing scenario id @simulation',
    async () => {
      logStep('GET simulation-catalog/dashboard/:id — non-existing id');

      const response = await apiClient.get(
        `${endpoints.auth.simulationcatalog}/INVALID-SCENARIO-ID-999`,
        { includeAuth: false },
      );

      validateStatusCode(response.status, 404);
      validateFieldValue(response.body, 'status', 'FAILED');
      validateFieldValue(response.body, 'data', null);
    },
  );

  it(
    'should accept optional ls query param without breaking @simulation',
    async () => {
      logStep('GET simulation-catalog/dashboard/:id — with ls query param');

      const response = await apiClient.get(
        `${endpoints.auth.simulationcatalog}/INVALID-SCENARIO-ID-999?ls=en`,
        { includeAuth: false },
      );

      // Still 404 for non-existing id regardless of ls param
      validateStatusCode(response.status, 404);
      validateFieldValue(response.body, 'status', 'FAILED');
    },
  );

  });



