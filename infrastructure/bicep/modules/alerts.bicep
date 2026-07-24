targetScope = 'resourceGroup'

param namePrefix string
param tags object
param actionGroupResourceId string
param containerApps array
param apiContainerAppId string
param postgresqlServerId string
param storageAccountId string
@allowed([1, 5, 15, 30, 60])
param evaluationFrequencyMinutes int
@allowed([1, 5, 15, 30, 60, 360, 720, 1440])
param availabilityWindowMinutes int
@allowed([1, 5, 15, 30, 60, 360, 720, 1440])
param degradationWindowMinutes int
@minValue(1)
param apiRequestTimeoutCountThreshold int
@minValue(1)
param containerRestartCountThreshold int
@minValue(1)
@maxValue(99)
param postgresqlStoragePercentThreshold int
@minValue(1)
@maxValue(100)
param storageAvailabilityPercentThreshold int
@minValue(0)
@maxValue(4)
param pagingSeverity int
@minValue(0)
@maxValue(4)
param ticketSeverity int

var evaluationFrequency = 'PT${evaluationFrequencyMinutes}M'
var availabilityWindow = 'PT${availabilityWindowMinutes}M'
var degradationWindow = 'PT${degradationWindowMinutes}M'
var actions = [
  {
    actionGroupId: actionGroupResourceId
  }
]

resource containerUnavailable 'Microsoft.Insights/metricAlerts@2026-01-01' = [for app in containerApps: {
  name: '${namePrefix}-${app.code}-unavailable'
  location: 'global'
  tags: tags
  properties: {
    actions: actions
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          dimensions: []
          metricName: 'Replicas'
          metricNamespace: 'Microsoft.App/containerapps'
          name: 'NoActiveReplica'
          operator: 'LessThan'
          skipMetricValidation: false
          threshold: 1
          timeAggregation: 'Maximum'
        }
      ]
    }
    description: 'Page when the governed Container App has no active replica for the approved availability window.'
    enabled: true
    evaluationFrequency: evaluationFrequency
    scopes: [app.id]
    severity: pagingSeverity
    windowSize: availabilityWindow
  }
}]

resource containerRestarts 'Microsoft.Insights/metricAlerts@2026-01-01' = [for app in containerApps: {
  name: '${namePrefix}-${app.code}-restarts'
  location: 'global'
  tags: tags
  properties: {
    actions: actions
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          dimensions: []
          metricName: 'RestartCount'
          metricNamespace: 'Microsoft.App/containerapps'
          name: 'ReplicaRestartCount'
          operator: 'GreaterThanOrEqual'
          skipMetricValidation: false
          threshold: containerRestartCountThreshold
          timeAggregation: 'Maximum'
        }
      ]
    }
    description: 'Ticket when a governed Container App reaches the approved replica-restart threshold.'
    enabled: true
    evaluationFrequency: evaluationFrequency
    scopes: [app.id]
    severity: ticketSeverity
    windowSize: degradationWindow
  }
}]

resource apiRequestTimeouts 'Microsoft.Insights/metricAlerts@2026-01-01' = {
  name: '${namePrefix}-api-request-timeouts'
  location: 'global'
  tags: tags
  properties: {
    actions: actions
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          dimensions: []
          metricName: 'ResiliencyRequestTimeouts'
          metricNamespace: 'Microsoft.App/containerapps'
          name: 'RequestTimeoutCount'
          operator: 'GreaterThanOrEqual'
          skipMetricValidation: false
          threshold: apiRequestTimeoutCountThreshold
          timeAggregation: 'Total'
        }
      ]
    }
    description: 'Page when API request timeouts reach the approved count within the degradation window.'
    enabled: true
    evaluationFrequency: evaluationFrequency
    scopes: [apiContainerAppId]
    severity: pagingSeverity
    windowSize: degradationWindow
  }
}

resource postgresqlUnavailable 'Microsoft.Insights/metricAlerts@2026-01-01' = {
  name: '${namePrefix}-postgresql-unavailable'
  location: 'global'
  tags: tags
  properties: {
    actions: actions
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          dimensions: []
          metricName: 'is_db_alive'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          name: 'DatabaseUnavailable'
          operator: 'LessThan'
          skipMetricValidation: false
          threshold: 1
          timeAggregation: 'Maximum'
        }
      ]
    }
    description: 'Page when PostgreSQL reports no live sample for the approved availability window.'
    enabled: true
    evaluationFrequency: evaluationFrequency
    scopes: [postgresqlServerId]
    severity: pagingSeverity
    windowSize: availabilityWindow
  }
}

resource postgresqlStorage 'Microsoft.Insights/metricAlerts@2026-01-01' = {
  name: '${namePrefix}-postgresql-storage'
  location: 'global'
  tags: tags
  properties: {
    actions: actions
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          dimensions: []
          metricName: 'storage_percent'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          name: 'StoragePercent'
          operator: 'GreaterThanOrEqual'
          skipMetricValidation: false
          threshold: postgresqlStoragePercentThreshold
          timeAggregation: 'Maximum'
        }
      ]
    }
    description: 'Ticket when PostgreSQL storage reaches the approved saturation threshold.'
    enabled: true
    evaluationFrequency: evaluationFrequency
    scopes: [postgresqlServerId]
    severity: ticketSeverity
    windowSize: degradationWindow
  }
}

resource storageUnavailable 'Microsoft.Insights/metricAlerts@2026-01-01' = {
  name: '${namePrefix}-storage-availability'
  location: 'global'
  tags: tags
  properties: {
    actions: actions
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          dimensions: []
          metricName: 'Availability'
          metricNamespace: 'Microsoft.Storage/storageAccounts'
          name: 'StorageAvailability'
          operator: 'LessThan'
          skipMetricValidation: false
          threshold: storageAvailabilityPercentThreshold
          timeAggregation: 'Average'
        }
      ]
    }
    description: 'Page when managed storage falls below the approved availability percentage.'
    enabled: true
    evaluationFrequency: evaluationFrequency
    scopes: [storageAccountId]
    severity: pagingSeverity
    windowSize: availabilityWindow
  }
}

output alertRuleCount int = length(containerApps) * 2 + 4
