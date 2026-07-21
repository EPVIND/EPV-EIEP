targetScope = 'resourceGroup'

param location string
param tags object
param namePrefix string
param subnetId string
param storageAccountId string
param keyVaultId string
param blobPrivateDnsZoneId string
param vaultPrivateDnsZoneId string

var endpoints = [
  {
    name: '${namePrefix}-blob-pe'
    targetId: storageAccountId
    groupId: 'blob'
    zoneId: blobPrivateDnsZoneId
  }
  {
    name: '${namePrefix}-vault-pe'
    targetId: keyVaultId
    groupId: 'vault'
    zoneId: vaultPrivateDnsZoneId
  }
]

resource privateEndpoints 'Microsoft.Network/privateEndpoints@2025-05-01' = [for endpoint in endpoints: {
  name: endpoint.name
  location: location
  tags: tags
  properties: {
    privateLinkServiceConnections: [
      {
        name: '${endpoint.name}-connection'
        properties: {
          groupIds: [endpoint.groupId]
          privateLinkServiceId: endpoint.targetId
        }
      }
    ]
    subnet: {
      id: subnetId
    }
  }
}]

resource privateDnsZoneGroups 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2025-05-01' = [for (endpoint, index) in endpoints: {
  parent: privateEndpoints[index]
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: endpoint.groupId
        properties: {
          privateDnsZoneId: endpoint.zoneId
        }
      }
    ]
  }
}]

output privateEndpointIds array = [for (endpoint, index) in endpoints: privateEndpoints[index].id]
