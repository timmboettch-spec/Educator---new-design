import { Counter, Histogram, Gauge } from 'prom-client';

export const timeoutCounter = new Counter({
  name: 'http_request_timeouts_total',
  help: 'Total HTTP requests that exceeded the configured timeout',
  labelNames: ['method', 'path'],
});

export const outboundHttpTimeoutCounter = new Counter({
  name: 'outbound_http_timeouts_total',
  help: 'Total outbound HTTP calls that exceeded the configured integration timeout',
  labelNames: ['integration'],
});

export const requestDurationHistogram = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000],
});

export const heapUsedGauge = new Gauge({
  name: 'nodejs_heap_used_bytes',
  help: 'Node.js heap memory currently in use (bytes)',
  collect() {
    this.set(process.memoryUsage().heapUsed);
  },
});

export const heapTotalGauge = new Gauge({
  name: 'nodejs_heap_total_bytes',
  help: 'Node.js total heap size allocated (bytes)',
  collect() {
    this.set(process.memoryUsage().heapTotal);
  },
});

export const rssGauge = new Gauge({
  name: 'nodejs_rss_bytes',
  help: 'Node.js resident set size (bytes)',
  collect() {
    this.set(process.memoryUsage().rss);
  },
});
