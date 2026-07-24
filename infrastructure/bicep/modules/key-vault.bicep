targetScope = 'resourceGroup'

@minLength(3)
@maxLength(24)
param name string
param location string
param tags object
param tenantId string
param apiPrincipalId string
@secure()
@minLength(32)
@maxLength(256)
param metricsToken string

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

resource metricsSecret 'Microsoft.KeyVault/vaults/secrets@2025-05-01' = {
  parent: vault
  name: 'metrics-token'
  properties: {
    contentType: 'EIEP protected metrics bearer token'
    value: metricsToken
  }
}

var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource apiMetricsSecretUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(metricsSecret.id, apiPrincipalId, keyVaultSecretsUserRoleDefinitionId)
  scope: metricsSecret
  properties: {
    principalId: apiPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
  }
}

output id string = vault.id
output uri string = vault.properties.vaultUri
output metricsSecretUri string = metricsSecret.properties.secretUriWithVersion
output apiMetricsSecretRoleAssignmentId string = apiMetricsSecretUser.id
