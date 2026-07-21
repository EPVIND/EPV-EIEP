targetScope = 'resourceGroup'

@minLength(3)
@maxLength(24)
param name string
param location string
param tags object
param workerPrincipalId string
param apiPrincipalId string

resource account 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_ZRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    isHnsEnabled: true
    minimumTlsVersion: 'TLS1_2'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
    publicNetworkAccess: 'Disabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  parent: account
  name: 'default'
  properties: {
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 30
    }
    deleteRetentionPolicy: {
      enabled: true
      days: 30
      allowPermanentDelete: false
    }
    isVersioningEnabled: true
  }
}

var containerNames = [
  'staged'
  'quarantine'
  'released'
  'exports'
  'turnover'
  'recovery'
]

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = [for containerName in containerNames: {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}]

var storageBlobDataContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)

resource workerBlobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, workerPrincipalId, storageBlobDataContributorRoleDefinitionId)
  scope: account
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataContributorRoleDefinitionId
  }
}

// The API may create immutable objects only in the staged intake boundary.
resource apiStagedBlobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containers[0].id, apiPrincipalId, storageBlobDataContributorRoleDefinitionId)
  scope: containers[0]
  properties: {
    principalId: apiPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataContributorRoleDefinitionId
  }
}

output id string = account.id
output name string = account.name
output blobEndpoint string = account.properties.primaryEndpoints.blob
output workerBlobRoleAssignmentId string = workerBlobDataContributor.id
output apiStagedBlobRoleAssignmentId string = apiStagedBlobDataContributor.id
