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

// Mock IntersectionObserver for active nav indicator
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock scrollIntoView for refs (used by ChatTab, NodePanel, DiagramTab)
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Mock document.elementFromPoint (used by DiagramTab click handler)
if (!document.elementFromPoint) {
  document.elementFromPoint = vi.fn(() => null);
}

// Mock fullscreen API (used by DiagramTab)
if (!Element.prototype.requestFullscreen) {
  Element.prototype.requestFullscreen = vi.fn();
}
if (!document.exitFullscreen) {
  document.exitFullscreen = vi.fn();
}

// Mock GSAP (used by LandingPage animations)
vi.mock("gsap", () => ({
  gsap: {
    context: vi.fn(() => ({ revert: vi.fn() })),
    registerPlugin: vi.fn(),
    timeline: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      to: vi.fn().mockReturnThis(),
    })),
    ticker: {
      add: vi.fn(),
      remove: vi.fn(),
      lagSmoothing: vi.fn(),
    },
  },
  ScrollTrigger: {
    update: vi.fn(),
    getAll: vi.fn(() => []),
    register: vi.fn(),
  },
}));

// Mock gsap/ScrollTrigger (used by LandingPage)
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {
    update: vi.fn(),
    getAll: vi.fn(() => []),
    register: vi.fn(),
  },
}));

// Mock Lenis smooth scroll (used by LandingPage)
vi.mock("lenis", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      this.on = vi.fn();
      this.destroy = vi.fn();
      this.raf = vi.fn();
    }),
  };
});
