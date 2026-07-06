import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock pdfmake (uses Node.js built-ins not available in jsdom)
vi.mock("pdfmake/build/pdfmake", () => ({
  default: {
    vfs: {},
    createPdf: vi.fn(() => ({ download: vi.fn() })),
  },
}));
vi.mock("pdfmake/build/vfs_fonts", () => ({
  default: { pdfMake: { vfs: {} } },
}));

// Mock crypto.randomUUID used in App.js for session IDs
/* global globalThis */
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
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => {
      store[key] = String(val);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
  },
  writable: true,
});

// Mock localStorage
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => {
      store[key] = String(val);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
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

// AbortSignal.timeout polyfill for jsdom
if (!AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

// Mock window.matchMedia for GSAP ScrollTrigger
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Mock ResizeObserver for Lenis smooth scroll
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
