const timelineInstance = {
  from: jest.fn().mockReturnThis(),
  to: jest.fn().mockReturnThis(),
  fromTo: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  add: jest.fn().mockReturnThis(),
};

module.exports = {
  gsap: {
    registerPlugin: jest.fn(),
    fromTo: jest.fn(),
    to: jest.fn(),
    from: jest.fn(),
    set: jest.fn(),
    timeline: jest.fn(() => timelineInstance),
    context: jest.fn((cb) => {
      if (typeof cb === "function") cb();
      return { revert: jest.fn() };
    }),
    ticker: {
      add: jest.fn(),
      remove: jest.fn(),
      lagSmoothing: jest.fn(),
    },
    matchMedia: jest.fn(() => ({
      add: jest.fn(),
    })),
  },
};
