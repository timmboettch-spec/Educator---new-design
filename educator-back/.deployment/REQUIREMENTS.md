# Container Resource Requirements

This document explains the CPU and memory specifications for different deployment environments. The actual values are defined in `.deployment/container-spec.json` which is read by the deployment script.

## Specifications

| Environment | CPU | Memory | Min Replicas | Max Replicas | Justification |
|-------------|-----|--------|--------------|--------------|---------------|
| **dev** | 0.5 | 1Gi | 1 | 1 | Cost optimization for testing. Single instance sufficient. |
| **qa** | 1 | 2Gi | 1 | 2 | Realistic testing with controlled scaling for load tests. |
| **prod** | 2 | 4Gi | 2 | 5 | High availability with auto-scaling for traffic spikes. |

## Detailed Rationale

### Development (0.5 CPU, 1Gi RAM)
- **Use Case**: Developer testing, integration testing
- **Expected Load**: Single developer or single test runner
- **Scaling**: No scaling needed
- **Cost Impact**: Minimal. ~$10-15/month
- **Node.js Runtime**: ~200MB
- **TypeORM Pool**: ~200MB
- **Buffer**: ~300MB
- **Justification**: Sufficient for local development simulation

### QA (1 CPU, 2Gi RAM)
- **Use Case**: Integration testing, load testing, behavioral testing
- **Expected Load**: 10-50 concurrent users
- **Scaling**: Can scale to 2 replicas for load testing
- **Cost Impact**: ~$25-30/month
- **Node.js Runtime**: ~200MB
- **TypeORM Connection Pool**: ~300-400MB
- **Cache/Middleware**: ~500MB
- **Buffer**: ~800MB
- **Justification**: Realistic production-like environment. 1 CPU can handle ~500 req/sec. Scaling available for stress testing.

### Production (2 CPU, 4Gi RAM)
- **Use Case**: Live user traffic
- **Expected Load**: 50-200+ concurrent users
- **Scaling**: Auto-scales 2-5 replicas based on CPU/memory triggers
- **Cost Impact**: ~$80-100/month (single replica) + scaling costs
- **Node.js Runtime**: ~200MB per instance
- **TypeORM Connection Pool**: ~400MB per instance
- **Caching Layer**: ~500MB per instance
- **Buffer & Growth**: ~1.5GB per instance
- **High Availability**: 2 minimum replicas = 1 can be updated while other serves traffic
- **Justification**: Production-grade reliability and performance

## Performance Characteristics

### With 1 CPU
```
Approximate Throughput:
  - Simple API calls: ~500 req/sec
  - With database queries: ~100-200 req/sec
  - Under load (90% CPU): ~80-150 req/sec
```

### With 2 CPU
```
Approximate Throughput:
  - Simple API calls: ~1000 req/sec
  - With database queries: ~300-400 req/sec
  - Under load (90% CPU): ~250-350 req/sec
  - With 5 replicas: ~1200-1750 req/sec total
```

## Scaling Behavior

### QA Environment
- Starts with 1 replica (1 CPU, 2GB)
- Scales to 2 replicas when CPU exceeds 70% or memory exceeds 80%
- Maximum of 2 replicas for cost control

### Production Environment
- Starts with 2 replicas (4 CPU, 8GB total)
- Scales up to 5 replicas when CPU exceeds 70% or memory exceeds 80%
- Ensures service availability during updates and failures

## Modifying Specifications

To change container requirements:

1. Edit `.deployment/container-spec.json`
2. Update the relevant environment section
3. Add `reason` documenting the change
4. Create a PR with justification
5. Upon merge, next deployment will use new specs

### Example: Increasing Production CPU
```json
{
  "prod": {
    "cpu": "4",        // Changed from "2"
    "memory": "8Gi",   // Changed from "4Gi"
    "reason": "Increased due to peak load analysis showing 85% CPU utilization. Supporting 500+ concurrent users."
  }
}
```

## Cost Estimation

Azure Container Apps pricing (approximate, East US):
- **vCPU**: $0.05/hour per vCPU
- **Memory**: $0.0025/hour per GB
- **Request Volume**: Included (no per-request charge)

### Monthly Cost Examples (730 hours)
```
Dev:  (0.5 × $0.05 + 1 × $0.0025) × 730 = ~$22/month
QA:   (1 × $0.05 + 2 × $0.0025) × 730 = ~$40/month
Prod: (2 × $0.05 + 4 × $0.0025) × 2 × 730 = ~$75/month (base, before scaling)
```

## When to Update Specs

Update container specifications when:
- ✅ Load testing shows CPU/memory approaching limits (>80%)
- ✅ Performance monitoring shows response time degradation
- ✅ Database connection pool exhaustion occurs
- ✅ New features/modules require more memory
- ❌ Don't update without data (use `az containerapp metrics` first)

## Monitoring

View current resource usage:
```powershell
az monitor metrics list \
  --resource-group "ARG-prod1-rwai" \
  --resource-type "Microsoft.App/containerApps" \
  --resource-name "aca-prod1-rwai-eduback" \
  --metric "CpuUsagePercentage" \
  --start-time 2026-04-20T00:00:00Z \
  --end-time 2026-04-22T00:00:00Z
```

## Related Configuration

- Seeding strategy: See `.deployment/seeding-config.json`
- Deployment parameters: See `Deploy-Backend.ps1`
- Application configuration: See `src/config/`
