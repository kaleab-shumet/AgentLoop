import { defineConfig } from 'tsup'

export default defineConfig([
  // Core library build
  {
    entry: ['core/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    minify: false,
    target: 'node16',
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.js' : '.mjs'
      }
    },
    esbuildOptions(options) {
      // Suppress eval warning - we intentionally use eval() in JSExecutionEngine for secure code execution
      options.logOverride = {
        'direct-eval': 'silent'
      }
    }
  },
  // Examples build (CommonJS only for Node.js execution)
  {
    entry: ['examples/**/*.ts'],
    format: ['cjs'],
    dts: false,
    sourcemap: true,
    clean: false,
    splitting: false,
    treeshake: false,
    minify: false,
    target: 'node16',
    outDir: 'dist',
    outExtension() {
      return {
        js: '.js'
      }
    },
    esbuildOptions(options) {
      // Suppress eval warning - we intentionally use eval() in JSExecutionEngine for secure code execution
      options.logOverride = {
        'direct-eval': 'silent'
      }
    }
  }
])