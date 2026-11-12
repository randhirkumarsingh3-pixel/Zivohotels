module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  overrides: [
    {
      // Backend mocha tests use describe/it globals
      files: ['backend/tests/**/*.js'],
      env: { mocha: true },
    },
    {
      // Context modules intentionally export a Provider component together with its hook
      files: ['src/context/**/*.jsx', 'src/extranet/context/**/*.jsx'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
  ],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'react/prop-types': 'off',
    // Intentional: useEffect dependency warnings for infinite-loop prevention
    // are suppressed with eslint-disable-next-line in specific hooks.
    // See project guidelines: do NOT add dependencies that cause infinite loops.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
}
