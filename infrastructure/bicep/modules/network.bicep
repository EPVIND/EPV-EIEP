targetScope = 'resourceGroup'

param name string
param location string
param tags object
param addressPrefix string = '10.40.0.0/16'
param containerAppsSubnetPrefix string = '10.40.0.0/23'
param postgresSubnetPrefix string = '10.40.2.0/24'
param privateEndpointSubnetPrefix string = '10.40.3.0/24'

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2025-05-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [addressPrefix]
    }
    enableDdosProtection: false
    subnets: [
      {
        name: 'container-apps'
        properties: {
          addressPrefix: containerAppsSubnetPrefix
          delegations: [
            {
              name: 'container-apps-delegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'postgresql'
        properties: {
          addressPrefix: postgresSubnetPrefix
          delegations: [
            {
              name: 'postgresql-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
      {
        name: 'private-endpoints'
        properties: {
          addressPrefix: privateEndpointSubnetPrefix
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

var privateDnsZoneNames = [
  'privatelink.postgres.database.azure.com'
  'privatelink.blob.${environment().suffixes.storage}'
  'privatelink.servicebus.windows.net'
  'privatelink.vaultcore.azure.net'
]

resource privateDnsZones 'Microsoft.Network/privateDnsZones@2024-06-01' = [for zoneName in privateDnsZoneNames: {
  name: zoneName
  location: 'global'
  tags: tags
}]

resource virtualNetworkLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = [for (zoneName, index) in privateDnsZoneNames: {
  parent: privateDnsZones[index]
  name: '${name}-link'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}]

output virtualNetworkId string = virtualNetwork.id
output containerAppsSubnetId string = virtualNetwork.properties.subnets[0].id
output postgresSubnetId string = virtualNetwork.properties.subnets[1].id
output privateEndpointSubnetId string = virtualNetwork.properties.subnets[2].id
output postgresPrivateDnsZoneId string = privateDnsZones[0].id
output blobPrivateDnsZoneId string = privateDnsZones[1].id
output serviceBusPrivateDnsZoneId string = privateDnsZones[2].id
output vaultPrivateDnsZoneId string = privateDnsZones[3].id
