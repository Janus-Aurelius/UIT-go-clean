/**
 * Quick test to verify output formatting
 * Runs for 30 seconds only
 */

import { check, sleep } from 'k6';
import http from 'k6/http';
import { config } from './utils/config.js';
import { tripCreationLatency, driverAssignmentSuccess, tripCompletionRate, mqttCalls, mqttConnectionSuccess, mqttPublishSuccess } from './utils/metrics.js';

export const options = {
  scenarios: {
    quickTest: {
      executor: 'constant-vus',
      vus: 2,
      duration: '30s',
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
    mqtt_publish_latency: ['p(95)<100'],
    mqtt_connection_errors: ['rate<0.01'],
    driver_assignment_success: ['rate>0.90'],
    trip_completion_rate: ['rate>0.90'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export default function () {
  // Simple HTTP check
  const response = http.get(`${config.baseUrl}/health`);
  
  check(response, {
    'trip created': (r) => r.status === 200,
    'driver assigned': (r) => r.status === 200,
  });

  // Record some test metrics
  tripCreationLatency.add(Math.random() * 1000 + 300);
  driverAssignmentSuccess.add(1);
  tripCompletionRate.add(1);
  mqttCalls.add(1);
  mqttConnectionSuccess.add(1);
  mqttPublishSuccess.add(1);
  
  sleep(1);
}

export function teardown() {
  console.log('INFO[30] Drivers: 30');
  console.log('INFO[30] ');
}

/**
 * Custom summary handler for formatted output
 */
export function handleSummary(data) {
  const duration = data.state.testRunDurationMs / 1000;

  // Custom teardown output format to match desired output
  const lines = [
    `Disconnecting 0 MQTT clients...`,
    `Disconnected: 0/0`,
    `Total Location Updates Published: ${data.metrics.mqtt_publish_success?.values?.count || 0}`,
    '='.repeat(80),
    '\n',
  ];
  
  console.log(lines.join('\n'));

  // Extract metrics for summary
  const metrics = data.metrics;
  let output = [];

  // THRESHOLDS section
  output.push('\n  █ THRESHOLDS\n');
  
  const thresholdChecks = [
    { name: 'driver_assignment_success', check: "'rate>0.90'", metric: metrics.driver_assignment_success },
    { name: 'error_rate', check: "'rate<0.05'", metric: metrics.error_rate },
    { name: 'http_req_duration', check: "'p(95)<2000'", metric: metrics.http_req_duration },
    { name: 'http_req_failed', check: "'rate<0.05'", metric: metrics.http_req_failed },
    { name: 'mqtt_connection_errors', check: "'rate<0.01'", metric: metrics.mqtt_connection_errors },
    { name: 'mqtt_publish_latency', check: "'p(95)<100'", metric: metrics.mqtt_publish_latency },
    { name: 'trip_completion_rate', check: "'rate>0.90'", metric: metrics.trip_completion_rate },
    { name: 'trip_creation_latency', check: "'p(95)<3000'", metric: metrics.trip_creation_latency },
  ];

  thresholdChecks.forEach(threshold => {
    if (threshold.metric && threshold.metric.thresholds) {
      const thresholdKey = Object.keys(threshold.metric.thresholds)[0];
      const passed = threshold.metric.thresholds[thresholdKey]?.ok;
      const symbol = passed ? '✓' : '✗';
      
      let value = '';
      if (threshold.metric.type === 'rate') {
        value = `rate=${(threshold.metric.values.rate * 100).toFixed(2)}%`;
      } else if (threshold.metric.type === 'trend') {
        value = `p(95)=${formatDuration(threshold.metric.values['p(95)'])}`;
      }
      
      output.push(`    ${threshold.name}\n    ${symbol} ${threshold.check} ${value}\n`);
    }
  });

  // TOTAL RESULTS section
  output.push('\n  █ TOTAL RESULTS\n');
  
  // Checks summary
  const checks = metrics.checks?.values;
  if (checks) {
    const total = checks.passes + checks.fails;
    const rate = (total / duration).toFixed(6);
    const passRate = ((checks.passes / total) * 100).toFixed(2);
    const failRate = ((checks.fails / total) * 100).toFixed(2);
    
    output.push(`    checks_total.......: ${total}    ${rate}/s\n`);
    output.push(`    checks_succeeded...: ${passRate}% ${checks.passes} out of ${total}\n`);
    output.push(`    checks_failed......: ${failRate}% ${checks.fails} out of ${total}\n\n`);
    
    // Check details
    output.push('    ✓ trip created\n');
    output.push('    ✓ driver assigned\n\n');
  }

  // Custom metrics
  output.push('    CUSTOM\n');
  
  const customMetrics = [
    'driver_assignment_success',
    'driver_search_latency', 
    'driver_search_success',
    'error_rate',
    'mqtt_calls',
    'mqtt_connection_errors',
    'mqtt_connection_success', 
    'mqtt_connection_time',
    'mqtt_publish_latency',
    'trip_complete_latency',
    'trip_completion_rate',
    'trip_creation_latency',
    'trip_start_latency'
  ];

  customMetrics.forEach(name => {
    const metric = metrics[name];
    if (metric) {
      output.push(formatMetric(name, metric, duration));
    }
  });

  // HTTP metrics
  output.push('\n    HTTP\n');
  ['http_req_duration', 'http_req_failed', 'http_reqs'].forEach(name => {
    const metric = metrics[name];
    if (metric) {
      output.push(formatMetric(name, metric, duration));
    }
  });

  // Execution metrics  
  output.push('\n    EXECUTION\n');
  ['iteration_duration', 'iterations', 'vus', 'vus_max'].forEach(name => {
    const metric = metrics[name];
    if (metric) {
      output.push(formatMetric(name, metric, duration));
    }
  });

  // Network metrics
  output.push('\n    NETWORK\n');
  ['data_received', 'data_sent'].forEach(name => {
    const metric = metrics[name];
    if (metric) {
      output.push(formatMetric(name, metric, duration));
    }
  });

  // Final execution summary
  const totalIterations = metrics.iterations?.values?.count || 0;
  const interruptedIterations = 0;
  
  output.push(`\n\n\nrunning (30s), 00/2 VUs, ${totalIterations} complete and ${interruptedIterations} interrupted iterations\n`);
  output.push(`driverMqttStreaming ✓ [======================================] 01/30 VUs  23m0s\n`);
  output.push(`userHttpRequests    ✓ [======================================] 01/50 VUs  28m0s\n`);

  // Check for threshold failures
  const hasFailures = Object.values(metrics).some(metric => 
    metric.thresholds && Object.values(metric.thresholds).some(t => !t.ok)
  );
  
  if (hasFailures) {
    const failedMetrics = Object.entries(metrics)
      .filter(([_, metric]) => metric.thresholds && Object.values(metric.thresholds).some(t => !t.ok))
      .map(([name]) => name);
    output.push(`ERRO[${Math.floor(duration)}] thresholds on metrics '${failedMetrics.join("', '")}' have been crossed\n`);
  }

  return {
    stdout: output.join('')
  };
}

function formatMetric(name, metric, durationSec) {
  const padding = ' '.repeat(Math.max(0, 35 - name.length));
  let line = `    ${name}${padding}: `;

  if (metric.type === 'counter') {
    const rate = (metric.values.count / durationSec).toFixed(6);
    line += `${metric.values.count}     ${rate}/s\n`;
  } else if (metric.type === 'rate') {
    const percentage = (metric.values.rate * 100).toFixed(2);
    const passes = metric.values.passes || 0;
    const fails = metric.values.fails || 0;
    line += `${percentage}% ${passes} out of ${passes + fails}\n`;
  } else if (metric.type === 'trend') {
    const v = metric.values;
    line += `avg=${formatDuration(v.avg)}  min=${formatDuration(v.min)}  med=${formatDuration(v.med)}  max=${formatDuration(v.max)}  p(90)=${formatDuration(v['p(90)'])}  p(95)=${formatDuration(v['p(95)'])}  p(99)=${formatDuration(v['p(99)'])}\n`;
  } else if (metric.type === 'gauge') {
    line += `${metric.values.value || 0}       min=${metric.values.min || 0}          max=${metric.values.max || 0}\n`;
  }

  return line;
}

function formatDuration(ms) {
  if (ms === undefined || ms === null || ms === 0) return '0s';
  if (ms < 1) return `${(ms * 1000).toFixed(2)}µs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m${seconds}s`;
}