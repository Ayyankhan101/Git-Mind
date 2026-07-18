module.exports = function override(config) {
  // Walk through all webpack rules to find every postcss-loader instance
  function walkRules(rules) {
    for (const rule of rules) {
      if (rule.oneOf) {
        walkRules(rule.oneOf);
      } else if (rule.use) {
        for (const loader of rule.use) {
          if (loader.loader && loader.loader.includes("postcss-loader")) {
            const plugins = loader.options.postcssOptions.plugins;
            // Remove the old 'tailwindcss' v3 string plugin if CRA added it
            const filtered = plugins.filter((p) => {
              if (typeof p === "string") return p !== "tailwindcss";
              return true;
            });
            // Prepend Tailwind v4 PostCSS plugin
            filtered.unshift(require("@tailwindcss/postcss"));
            loader.options.postcssOptions.plugins = filtered;
          }
        }
      }
    }
  }

  walkRules(config.module.rules);
  return config;
};
