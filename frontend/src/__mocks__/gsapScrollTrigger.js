module.exports = {
  ScrollTrigger: {
    getScroll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
    refresh: jest.fn(),
    getAll: jest.fn(() => []),
  },
};
