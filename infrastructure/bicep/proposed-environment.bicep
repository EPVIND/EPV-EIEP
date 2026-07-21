targetScope = 'resourceGroup'

@allowed(['development', 'test', 'training', 'production'])
param environmentName string
param location string
param deploymentStamp string
param registryServer string
param apiImage string
param webImage string
param portalImage string
param jobWorkerImage string
param databaseSecretUri string
param metricsSecretUri string
param oidcIssuer string
param oidcAudience string
param corsAllowedOrigins string
param workerUserId string
param workerOrganizationId string
@minLength(1)
param malwareScannerHost string
param productionAuthorized bool = false
param productionAuthorizationReference string = ''

var suffix = take(uniqueString(resourceGroup().id, environmentName), 8)
var prefix = 'eiep-${environmentName}-${suffix}'
var imageReferencesAreImmutable = contains(apiImage, '@sha256:') && contains(webImage, '@sha256:') && contains(portalImage, '@sha256:') && contains(jobWorkerImage, '@sha256:')
var deploymentEnabled = imageReferencesAreImmutable && (environmentName != 'production' || (productionAuthorized && !empty(productionAuthorizationReference)))
var tags = {
  application: 'eiep'
  environment: environmentName
  deploymentStamp: deploymentStamp
  managedBy: 'bicep'
  productionAuthorized: string(productionAuthorized)
  productionAuthorizationReference: productionAuthorizationReference
}

module network 'modules/network.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-network'
  params: {
    name: '${prefix}-vnet'
    location: location
    tags: tags
  }
}

module identity 'modules/identity.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-identity'
  params: {
    name: '${prefix}-workload'
    location: location
    tags: tags
  }
}

module apiIdentity 'modules/identity.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-api-identity'
  params: {
    name: '${prefix}-api'
    location: location
    tags: tags
  }
}

module jobWorkerIdentity 'modules/identity.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-job-worker-identity'
  params: {
    name: '${prefix}-job-worker'
    location: location
    tags: tags
  }
}

module observability 'modules/observability.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-observability'
  params: {
    name: '${prefix}-logs'
    location: location
    retentionInDays: environmentName == 'production' ? 365 : 30
    tags: tags
  }
}

module storage 'modules/storage.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-storage'
  params: {
    name: 'eiep${suffix}'
    location: location
    tags: tags
    workerPrincipalId: jobWorkerIdentity!.outputs.principalId
    apiPrincipalId: apiIdentity!.outputs.principalId
  }
}

module keyVault 'modules/key-vault.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-vault'
  params: {
    name: take('${prefix}-vault', 24)
    location: location
    tags: tags
    tenantId: tenant().tenantId
  }
}

module messaging 'modules/messaging.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-messaging'
  params: {
    name: '${prefix}-bus'
    location: location
    tags: tags
  }
}

module postgresql 'modules/postgresql.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-postgresql'
  params: {
    name: '${prefix}-pg'
    location: location
    tags: tags
    tenantId: tenant().tenantId
    delegatedSubnetResourceId: network!.outputs.postgresSubnetId
    privateDnsZoneResourceId: network!.outputs.postgresPrivateDnsZoneId
    backupRetentionDays: 35
  }
}

module privateEndpoints 'modules/private-endpoints.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-private-endpoints'
  params: {
    location: location
    tags: tags
    namePrefix: prefix
    subnetId: network!.outputs.privateEndpointSubnetId
    storageAccountId: storage!.outputs.id
    serviceBusNamespaceId: messaging!.outputs.id
    keyVaultId: keyVault!.outputs.id
    blobPrivateDnsZoneId: network!.outputs.blobPrivateDnsZoneId
    serviceBusPrivateDnsZoneId: network!.outputs.serviceBusPrivateDnsZoneId
    vaultPrivateDnsZoneId: network!.outputs.vaultPrivateDnsZoneId
  }
}

module runtime 'modules/app-runtime.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-runtime'
  params: {
    environmentName: environmentName
    location: location
    tags: tags
    managedEnvironmentName: '${prefix}-apps'
    infrastructureSubnetId: network!.outputs.containerAppsSubnetId
    workloadIdentityId: identity!.outputs.id
    apiIdentityId: apiIdentity!.outputs.id
    apiIdentityClientId: apiIdentity!.outputs.clientId
    jobWorkerIdentityId: jobWorkerIdentity!.outputs.id
    jobWorkerIdentityClientId: jobWorkerIdentity!.outputs.clientId
    storageAccountName: storage!.outputs.name
    malwareScannerHost: malwareScannerHost
    registryServer: registryServer
    apiImage: apiImage
    webImage: webImage
    portalImage: portalImage
    jobWorkerImage: jobWorkerImage
    databaseSecretUri: databaseSecretUri
    metricsSecretUri: metricsSecretUri
    oidcIssuer: oidcIssuer
    oidcAudience: oidcAudience
    corsAllowedOrigins: corsAllowedOrigins
    workerUserId: workerUserId
    workerOrganizationId: workerOrganizationId
  }
}

output environmentBoundary string = environmentName
output deploymentEnabled bool = deploymentEnabled
output imageReferencesAreImmutable bool = imageReferencesAreImmutable
output workloadIdentityClientId string = deploymentEnabled ? identity!.outputs.clientId : ''
output apiIdentityClientId string = deploymentEnabled ? apiIdentity!.outputs.clientId : ''
output jobWorkerIdentityClientId string = deploymentEnabled ? jobWorkerIdentity!.outputs.clientId : ''
output storageAccountName string = deploymentEnabled ? storage!.outputs.name : ''
output postgresqlFqdn string = deploymentEnabled ? postgresql!.outputs.fqdn : ''
output apiFqdn string = deploymentEnabled ? runtime!.outputs.apiFqdn : ''
output webFqdn string = deploymentEnabled ? runtime!.outputs.webFqdn : ''
output portalFqdn string = deploymentEnabled ? runtime!.outputs.portalFqdn : ''
output privateEndpointIds array = deploymentEnabled ? privateEndpoints!.outputs.privateEndpointIds : []
