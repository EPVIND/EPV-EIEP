targetScope = 'resourceGroup'

param name string
param location string
param tags object
@minValue(30)
@maxValue(730)
param retentionInDays int

resource workspace 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    features: {
      disableLocalAuth: true
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Disabled'
    publicNetworkAccessForQuery: 'Disabled'
    retentionInDays: retentionInDays
    sku: {
      name: 'PerGB2018'
    }
  }
}

output id string = workspace.id
output customerId string = workspace.properties.customerId
