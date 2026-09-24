export default {
  // Flat config lookup from the file location, so each project's
  // eslint.config.mjs (e.g. React rules) applies, not only the root one.
  '*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}': [
    'eslint --flag v10_config_lookup_from_file --fix --max-warnings=0',
    'prettier --write',
  ],
  '*.{json,md,yml,yaml,css,html}': 'prettier --write',
};
