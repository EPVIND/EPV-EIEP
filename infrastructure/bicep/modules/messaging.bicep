targetScope = 'resourceGroup'

param name string
param location string
param tags object

resource serviceBus 'Microsoft.ServiceBus/namespaces@2026-01-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Premium'
    tier: 'Premium'
    capacity: 1
  }
  properties: {
    disableLocalAuth: true
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
    zoneRedundant: true
  }
}

var queueNames = [
  'document-processing'
  'exports'
  'integrations'
  'notifications'
]

resource queues 'Microsoft.ServiceBus/namespaces/queues@2026-01-01' = [for queueName in queueNames: {
  parent: serviceBus
  name: queueName
  properties: {
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P14D'
    duplicateDetectionHistoryTimeWindow: 'PT1H'
    enableBatchedOperations: true
    enablePartitioning: false
    lockDuration: 'PT1M'
    maxDeliveryCount: 3
    requiresDuplicateDetection: true
    requiresSession: false
  }
}]

output id string = serviceBus.id
output name string = serviceBus.name
