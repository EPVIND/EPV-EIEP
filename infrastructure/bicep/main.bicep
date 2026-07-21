targetScope = 'subscription'

@description('Controlled EIEP environment boundary.')
@allowed([
  'development'
  'test'
  'training'
  'production'
])
param environmentName string

@description('Azure region selected only after the approvals listed in ADR-0009.')
param location string

@description('Immutable deployment/build identifier.')
param deploymentStamp string

var requiredTags = {
  application: 'eiep'
  environment: environmentName
  deploymentStamp: deploymentStamp
  managedBy: 'bicep'
  productionAuthorized: 'false'
}

// No resources are intentionally declared in the first scaffold. Add modules only
// after ADR-0009 approval and preserve environment-specific identity/data boundaries.

output proposedLocation string = location
output environmentBoundary string = environmentName
output tags object = requiredTags

