targetScope = 'resourceGroup'

@minLength(3)
@maxLength(24)
param name string
param location string
param tags object
param tenantId string

resource vault 'Microsoft.KeyVault/vaults@2025-05-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    createMode: 'default'
    enablePurgeProtection: true
    enableRbacAuthorization: true
    enableSoftDelete: true
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
    sku: {
      family: 'A'
      name: 'standard'
    }
    softDeleteRetentionInDays: 90
    tenantId: tenantId
  }
}

output id string = vault.id
output uri string = vault.properties.vaultUri
