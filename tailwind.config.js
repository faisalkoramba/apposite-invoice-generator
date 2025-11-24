module.exports = {
  theme: {
    extend: {},
  },
  corePlugins: {
    preflight: true,
  },
  future: {
    disableColorFunctions: true, // ⚠️ disables oklch() and friends
  },
};
