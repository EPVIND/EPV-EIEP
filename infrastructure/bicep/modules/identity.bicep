targetScope = 'resourceGroup'

param name string
param location string
param tags object

resource workloadIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: name
  location: location
  tags: tags
}

output id string = workloadIdentity.id
output name string = workloadIdentity.name
output clientId string = workloadIdentity.properties.clientId
output principalId string = workloadIdentity.properties.principalId
