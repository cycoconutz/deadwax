import { SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api'
import { env } from '../env'

export const tracer = trace.getTracer('deadwax', '1.0.0')

const INVALID_TRACE_ID = '00000000000000000000000000000000'

/**
 * Returns a usable trace id, or null when no SDK is running. A no-op tracer
 * hands back an all-zero id, and a header full of zeros is worse than none.
 */
export function validTraceId(id: string | undefined): string | null {
  return id && id !== INVALID_TRACE_ID ? id : null
}

/**
 * Adds the active trace to a log line. Used as a pino formatter, so every log
 * emitted while a span is open can be joined to its trace.
 */
export function withTraceContext(object: Record<string, unknown>): Record<string, unknown> {
  const span = trace.getActiveSpan()
  if (!span) return object
  const { traceId, spanId } = span.spanContext()
  return validTraceId(traceId) ? { ...object, traceId, spanId } : object
}

/**
 * Starts the SDK only when an OTLP endpoint exists. A clone with no collector
 * pays nothing for tracing, and the test suite never opens a socket.
 *
 * Must run before Fastify is imported, which is why index.ts loads the app
 * dynamically after this.
 */
export async function startTracing(): Promise<() => Promise<void>> {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return async () => {}

  const [{ NodeSDK }, { OTLPTraceExporter }, { HttpInstrumentation }, { FastifyInstrumentation }] =
    await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/instrumentation-http'),
      import('@opentelemetry/instrumentation-fastify'),
    ])

  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [new HttpInstrumentation(), new FastifyInstrumentation()],
  })

  sdk.start()
  return () => sdk.shutdown()
}

/**
 * Runs work inside a span, records failures on it, and always ends it.
 * Attributes are set before the callback so a slow operation is identifiable
 * even if it never returns.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  run: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttributes(attributes)
    try {
      return await run(span)
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error))
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw error
    } finally {
      span.end()
    }
  })
}
