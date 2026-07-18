module.exports = {
  gsap: {
    registerPlugin: jest.fn(),
    fromTo: jest.fn(),
    to: jest.fn(),
    from: jest.fn(),
    set: jest.fn(),
    timeline: jest.fn(function () {
      return this;
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
