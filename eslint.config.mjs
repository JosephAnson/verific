import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['openspec/**'],
  yaml: true,
  json: true,
}, {
  files: ['pnpm-workspace.yaml'],
  rules: {
    'pnpm/yaml-enforce-settings': 'off',
  },
})
