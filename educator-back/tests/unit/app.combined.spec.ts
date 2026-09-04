import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';

//  Unit

describe('AppService (unit)', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();
    service = module.get(AppService);
  });

  it('AppService returns expected string', () => {
    expect(service.AppService()).toBe('getFunction is working!');
  });

  it('AppService returns a string type', () => {
    expect(typeof service.AppService()).toBe('string');
  });
});

describe('AppController (unit)', () => {
  let controller: AppController;

  const mockAppService = { AppService: jest.fn().mockReturnValue('getFunction is working!') };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();
    controller = module.get(AppController);
  });

  afterEach(() => jest.clearAllMocks());

  it('Appcontroller delegates to AppService', () => {
    const result = controller.Appcontroller();
    expect(mockAppService.AppService).toHaveBeenCalledTimes(1);
    expect(result).toBe('getFunction is working!');
  });

  it('health returns status ok', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('health response has exactly one key', () => {
    expect(Object.keys(controller.health())).toEqual(['status']);
  });
});

//  Regression

describe('AppController + AppService (regression)', () => {
  let controller: AppController;
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    controller = module.get(AppController);
    service = module.get(AppService);
  });

  it('Appcontroller returns the real service value end-to-end', () => {
    expect(controller.Appcontroller()).toBe('getFunction is working!');
  });

  it('health always returns "ok" across repeated calls', () => {
    for (let i = 0; i < 5; i++) {
      expect(controller.health().status).toBe('ok');
    }
  });

  it('AppService output is stable — same value on every call', () => {
    const first = service.AppService();
    const second = service.AppService();
    expect(first).toBe(second);
  });
});

//Integration

describe('AppController + AppService (integration)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    controller = module.get(AppController);
  });

  it('module compiles and controller is resolvable', () => {
    expect(controller).toBeDefined();
  });

  it('GET / — returns service string through controller', () => {
    expect(controller.Appcontroller()).toBe('getFunction is working!');
  });

  it('GET /health — returns correct shape', () => {
    expect(controller.health()).toMatchObject({ status: 'ok' });
  });
});
