targetScope = 'resourceGroup'

param environmentName string
param location string
param tags object
param managedEnvironmentName string
param infrastructureSubnetId string
param workloadIdentityId string
param apiIdentityId string
param apiIdentityClientId string
param jobWorkerIdentityId string
param jobWorkerIdentityClientId string
param storageAccountName string
param malwareScannerHost string
param registryServer string
param apiImage string
param webImage string
param portalImage string
param jobWorkerImage string
param databaseSecretUri string
param metricsSecretUri string
param oidcIssuer string
param oidcAudience string
param corsAllowedOrigins string
param workerUserId string
param workerOrganizationId string

resource managedEnvironment 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: managedEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
    zoneRedundant: true
  }
}

resource api 'Microsoft.App/containerApps@2026-01-01' = {
  name: 'eiep-${environmentName}-api'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${apiIdentityId}': {}
    }
  }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 3100
        transport: 'http'
      }
      registries: [
        {
          identity: apiIdentityId
          server: registryServer
        }
      ]
      secrets: [
        {
          identity: apiIdentityId
          keyVaultUrl: databaseSecretUri
          name: 'database-url'
        }
        {
          identity: apiIdentityId
          keyVaultUrl: metricsSecretUri
          name: 'metrics-token'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          env: [
            { name: 'EIEP_ENV', value: environmentName }
            { name: 'HOST', value: '0.0.0.0' }
            { name: 'PORT', value: '3100' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'DATABASE_RUNTIME_ROLE', value: 'eiep_runtime' }
            { name: 'METRICS_TOKEN', secretRef: 'metrics-token' }
            { name: 'OIDC_ISSUER', value: oidcIssuer }
            { name: 'OIDC_AUDIENCE', value: oidcAudience }
            { name: 'CORS_ALLOWED_ORIGINS', value: corsAllowedOrigins }
            { name: 'AZURE_STORAGE_ACCOUNT_NAME', value: storageAccountName }
            { name: 'AZURE_CLIENT_ID', value: apiIdentityClientId }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 3100, scheme: 'HTTP' }
              initialDelaySeconds: 15
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 3100, scheme: 'HTTP' }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 10
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

resource web 'Microsoft.App/containerApps@2026-01-01' = {
  name: 'eiep-${environmentName}-web'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${workloadIdentityId}': {}
    }
  }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { allowInsecure: false, external: true, targetPort: 8080, transport: 'http' }
      registries: [{ identity: workloadIdentityId, server: registryServer }]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          probes: [{ type: 'Liveness', httpGet: { path: '/', port: 8080, scheme: 'HTTP' } }]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
      scale: { minReplicas: 2, maxReplicas: 5 }
    }
  }
}

resource portal 'Microsoft.App/containerApps@2026-01-01' = {
  name: 'eiep-${environmentName}-portal'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${workloadIdentityId}': {}
    }
  }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { allowInsecure: false, external: true, targetPort: 8080, transport: 'http' }
      registries: [{ identity: workloadIdentityId, server: registryServer }]
    }
    template: {
      containers: [
        {
          name: 'portal'
          image: portalImage
          probes: [{ type: 'Liveness', httpGet: { path: '/', port: 8080, scheme: 'HTTP' } }]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
      scale: { minReplicas: 2, maxReplicas: 5 }
    }
  }
}

resource jobWorker 'Microsoft.App/containerApps@2026-01-01' = {
  name: 'eiep-${environmentName}-job-worker'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${jobWorkerIdentityId}': {}
    }
  }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [{ identity: jobWorkerIdentityId, server: registryServer }]
      secrets: [{ identity: jobWorkerIdentityId, keyVaultUrl: databaseSecretUri, name: 'database-url' }]
    }
    template: {
      containers: [
        {
          name: 'job-worker'
          image: jobWorkerImage
          env: [
            { name: 'EIEP_ENV', value: environmentName }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'DATABASE_RUNTIME_ROLE', value: 'eiep_job_worker' }
            { name: 'AZURE_STORAGE_ACCOUNT_NAME', value: storageAccountName }
            { name: 'AZURE_CLIENT_ID', value: jobWorkerIdentityClientId }
            { name: 'CLAMAV_HOST', value: malwareScannerHost }
            { name: 'CLAMAV_PORT', value: '3310' }
            { name: 'WORKER_USER_ID', value: workerUserId }
            { name: 'WORKER_ORGANIZATION_ID', value: workerOrganizationId }
            { name: 'WORKER_BATCH_SIZE', value: '25' }
            { name: 'WORKER_POLL_INTERVAL_MS', value: '5000' }
            { name: 'WORKER_LEASE_DURATION_MS', value: '60000' }
          ]
          resources: { cpu: json('1.0'), memory: '2Gi' }
        }
      ]
      // Atomic, expiring PostgreSQL leases make competing replicas safe.
      scale: { minReplicas: 1, maxReplicas: 5 }
    }
  }
}

output apiFqdn string = api.properties.configuration.ingress.fqdn
output webFqdn string = web.properties.configuration.ingress.fqdn
output portalFqdn string = portal.properties.configuration.ingress.fqdn
