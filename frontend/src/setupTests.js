import "@testing-library/jest-dom";

// Mock crypto.randomUUID used in App.js for session IDs
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => "00000000-0000-0000-0000-000000000001" },
    writable: true,
  });
}

// Mock sessionStorage
const store = {};
Object.defineProperty(window, "sessionStorage", {
  value: {
    getItem: jest.fn((key) => store[key] ?? null),
    setItem: jest.fn((key, val) => {
      store[key] = String(val);
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
  },
  writable: true,
});

// Mock localStorage
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: jest.fn((key) => store[key] ?? null),
    setItem: jest.fn((key, val) => {
      store[key] = String(val);
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
  },
  writable: true,
});

// Mock navigator.userAgentData
Object.defineProperty(navigator, "userAgentData", {
  value: { platform: "MacIntel" },
  writable: true,
});

// CRA's jsdom doesn't have AbortSignal.timeout
if (!AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}
