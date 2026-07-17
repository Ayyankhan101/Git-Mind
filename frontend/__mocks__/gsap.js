module.exports = {
  gsap: {
    context: () => ({ revert: () => {} }),
    registerPlugin: () => {},
    timeline: () => ({
      from: () => ({ to: () => ({}) }),
      to: () => ({ from: () => ({}) }),
    }),
    ticker: { add: () => {}, remove: () => {}, lagSmoothing: () => {} },
  },
  ScrollTrigger: {
    update: () => {},
    getAll: () => [],
    register: () => {},
  },
};
