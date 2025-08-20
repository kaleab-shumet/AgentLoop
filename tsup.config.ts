import { defineConfig, type Options } from 'tsup'

const buildType = process.env.BUILD_TYPE ?? 'all'

const coreConfig: Options = {
  name: 'core',
  entry: ['core/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: false,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: true,
  target: 'node16',
  outDir: 'dist',
  outExtension({ format }: { format: string }) {
    return {
      js: format === 'cjs' ? '.js' : '.mjs'
    }
  },
  esbuildOptions(options: { logOverride?: Record<string, string> }) {
    // Suppress eval warning - we intentionally use eval() in JSExecutionEngine for secure code execution
    options.logOverride = {
      'direct-eval': 'silent'
    }
  }
}

const examplesConfig: Options = {
  name: 'examples',
  entry: ['examples/**/*.ts'],
  format: ['cjs'],
  dts: false,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: false,
  minify: true,
  target: 'node16',
  outDir: 'dist',
  outExtension() {
    return {
      js: '.js'
    }
  },
  esbuildOptions(options: { logOverride?: Record<string, string> }) {
    // Suppress eval warning - we intentionally use eval() in JSExecutionEngine for secure code execution
    options.logOverride = {
      'direct-eval': 'silent'
    }
  }
}

let configs: Options[] = [coreConfig, examplesConfig]

if (buildType === 'core') {
  configs = [coreConfig]
} else if (buildType === 'examples') {
  configs = [examplesConfig]
}

export default defineConfig(configs)