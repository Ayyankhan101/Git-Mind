import "@testing-library/jest-dom";

// Mock crypto.randomUUID used in App.js for session IDs
if (!global.crypto?.randomUUID) {
  Object.defineProperty(global, "crypto", {
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

// Stub HTMLCanvasElement.getContext (jsdom defines it but throws
// "Not implemented" without the canvas npm package)
HTMLCanvasElement.prototype.getContext = function () {
  return null;
};

// Mock window.matchMedia - use plain function (jest.fn mockImplementation seems unreliable here)
window.matchMedia = function (query) {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: function () {},
    removeListener: function () {},
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () {},
  };
};
global.matchMedia = window.matchMedia;

// CRA's jsdom doesn't have AbortSignal.timeout
if (!AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

// ResizeObserver polyfill
class ResizeObserverMock {
  constructor(callback) {
    this._callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!global.ResizeObserver) global.ResizeObserver = ResizeObserverMock;

// scrollIntoView polyfill
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = jest.fn();
}

// IntersectionObserver polyfill
class IntersectionObserverMock {
  constructor(callback) {
    this._callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!global.IntersectionObserver)
  global.IntersectionObserver = IntersectionObserverMock;

if (!window.open) {
  window.open = jest.fn();
} else {
  jest.spyOn(window, "open").mockImplementation(() => null);
}

// TextEncoder/TextDecoder polyfill for pdfmake
const { TextEncoder, TextDecoder } = require("util");
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

// GSAP and Lenis mocks are in __mocks__/ directories
// (jest.mock() in setup files doesn't auto-hoist)
