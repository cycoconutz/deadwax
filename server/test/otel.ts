import { context, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'

/**
 * One provider per test process, shared by every test file. The OpenTelemetry
 * API caches the first tracer it resolves, so the provider has to exist before
 * any application module asks for one.
 */
const registry = globalThis as typeof globalThis & {
  __deadwaxTracing?: { exporter: InMemorySpanExporter }
}

if (!registry.__deadwaxTracing) {
  const exporter = new InMemorySpanExporter()
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })
  // Without this, the API's default context manager is a no-op and nested
  // spans lose their parent across awaits.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  trace.setGlobalTracerProvider(provider)
  registry.__deadwaxTracing = { exporter }
}

export const spanExporter = registry.__deadwaxTracing.exporter
