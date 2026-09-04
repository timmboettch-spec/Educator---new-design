import '@testing-library/jest-dom';
import { vi } from 'vitest';
import axios from 'axios';

vi.stubEnv('VITE_API_URL', 'http://mock-api');

// Silence all axios requests in tests to prevent unhandled rejections
// from useEffect API calls when no server is running.
vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
vi.spyOn(axios, 'put').mockResolvedValue({ data: {} });
vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} });
vi.spyOn(axios, 'delete').mockResolvedValue({ data: {} });

// Prevent import.meta.env crash in jsdom for all test files
vi.mock('/src/redux/config.tsx', () => ({
  default: { baseURL: 'http://mock-api' },
  setServerConfig: () => ({ baseURL: 'http://mock-api' }),
}));

// Avoid loading lottie-web in jsdom tests.
vi.mock('lottie-react', () => ({
  default: () => null,
}));

// forceLogout.ts imports the entire Redux store (all reducers) and LoginRedux.
// Mocking it here prevents cascading "No default export" errors in every test
// that mocks individual Redux slices without providing a reducer default export.
vi.mock('/src/utils/forceLogout', () => ({
  forceLogout: vi.fn(),
  registerSocketDisconnect: vi.fn(),
  unregisterSocketDisconnect: vi.fn(),
  LOGOUT_MESSAGES: {
    SCHOOL_INACTIVE: '',
    SCHOOL_DEACTIVATED: '',
    ACCOUNT_DELETED: '',
    ACCOUNT_DEACTIVATED: '',
    SESSION_EXPIRED: '',
  },
}));

// jsdom does not implement canvas APIs used by chart/lottie dependencies.
// Polyfill DataTransfer for jsdom (not available by default)
if (typeof DataTransfer === 'undefined') {
  Object.defineProperty(globalThis, 'DataTransfer', {
    value: class DataTransfer {
    private _data: Record<string, string> = {};
    setData(type: string, data: string): void { this._data[type] = data; }
    getData(type: string): string { return this._data[type] ?? ''; }
    clearData(type?: string): void { if (type !== undefined) { delete this._data[type]; } else { this._data = {}; } }
    get types(): string[] { return Object.keys(this._data); }
  },
    writable: true,
    configurable: true,
  });
}

// Polyfill ClipboardEvent for jsdom (not available by default)
if (typeof ClipboardEvent === 'undefined') {
  Object.defineProperty(globalThis, 'ClipboardEvent', {
    value: class ClipboardEvent extends Event {
    clipboardData: DataTransfer | null;
    constructor(type: string, options: { clipboardData?: DataTransfer; bubbles?: boolean; cancelable?: boolean } = {}) {
      super(type, options);
      this.clipboardData = options.clipboardData ?? null;
    }
  },
    writable: true,
    configurable: true,
  });
}

// Polyfill DragEvent for jsdom (not available by default)
if (typeof DragEvent === 'undefined') {
  Object.defineProperty(globalThis, 'DragEvent', {
    value: class DragEvent extends Event {
    dataTransfer: DataTransfer | null;
    constructor(type: string, options: { dataTransfer?: DataTransfer; bubbles?: boolean; cancelable?: boolean } = {}) {
      super(type, options);
      this.dataTransfer = options.dataTransfer ?? null;
    }
  },
    writable: true,
    configurable: true,
  });
}

if (!HTMLCanvasElement.prototype.getContext) {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      transform: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    }),
  });
}
