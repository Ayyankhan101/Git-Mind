const React = require("react");

function SyntaxHighlighter({ children }) {
  return React.createElement(
    "pre",
    null,
    React.createElement("code", null, children),
  );
}

module.exports = { Prism: SyntaxHighlighter, default: SyntaxHighlighter };
