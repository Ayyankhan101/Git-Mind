class Lenis {
  constructor() {
    this._handlers = {};
  }
  on() {
    return this;
  }
  off() {
    return this;
  }
  start() {}
  stop() {}
  destroy() {}
  raf() {}
}
module.exports = Lenis;
module.exports.default = Lenis;
