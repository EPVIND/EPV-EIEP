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
@secure()
@minLength(32)
@maxLength(256)
param metricsToken string
param oidcIssuer string
param oidcAudience string
param corsAllowedOrigins string
param postgresAdministratorObjectId string
param postgresAdministratorPrincipalName string
@allowed(['Group', 'ServicePrincipal', 'User'])
param postgresAdministratorPrincipalType string
param workerUserId string
param workerOrganizationId string
@minLength(1)
param malwareScannerHost string
param runtimeAuthorized bool = false
param runtimeAuthorizationReference string = ''
param productionAuthorized bool = false
param productionAuthorizationReference string = ''

var suffix = take(uniqueString(resourceGroup().id, environmentName), 8)
var prefix = 'eiep-${environmentName}-${suffix}'
var imageReferencesAreImmutable = contains(apiImage, '@sha256:') && contains(webImage, '@sha256:') && contains(portalImage, '@sha256:') && contains(jobWorkerImage, '@sha256:')
var deploymentEnabled = imageReferencesAreImmutable && (environmentName != 'production' || (productionAuthorized && !empty(productionAuthorizationReference)))
var runtimeEnabled = deploymentEnabled && runtimeAuthorized && !empty(runtimeAuthorizationReference)
var tags = {
  application: 'eiep'
  environment: environmentName
  deploymentStamp: deploymentStamp
  managedBy: 'bicep'
  runtimeAuthorized: string(runtimeAuthorized)
  runtimeAuthorizationReference: runtimeAuthorizationReference
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
    apiPrincipalId: apiIdentity!.outputs.principalId
    metricsToken: metricsToken
  }
}

module postgresql 'modules/postgresql.bicep' = if (deploymentEnabled) {
  name: '${deployment().name}-postgresql'
  params: {
    name: '${prefix}-pg'
    location: location
    tags: tags
    tenantId: tenant().tenantId
    administratorObjectId: postgresAdministratorObjectId
    administratorPrincipalName: postgresAdministratorPrincipalName
    administratorPrincipalType: postgresAdministratorPrincipalType
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
    keyVaultId: keyVault!.outputs.id
    blobPrivateDnsZoneId: network!.outputs.blobPrivateDnsZoneId
    vaultPrivateDnsZoneId: network!.outputs.vaultPrivateDnsZoneId
  }
}

module runtime 'modules/app-runtime.bicep' = if (runtimeEnabled) {
  name: '${deployment().name}-runtime'
  dependsOn: [
    privateEndpoints
  ]
  params: {
    environmentName: environmentName
    location: location
    tags: tags
    managedEnvironmentName: '${prefix}-apps'
    infrastructureSubnetId: network!.outputs.containerAppsSubnetId
    logAnalyticsWorkspaceId: observability!.outputs.id
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
    apiDatabaseUrl: 'postgresql://${uriComponent(apiIdentity!.outputs.name)}@${postgresql!.outputs.fqdn}:5432/eiep'
    jobWorkerDatabaseUrl: 'postgresql://${uriComponent(jobWorkerIdentity!.outputs.name)}@${postgresql!.outputs.fqdn}:5432/eiep'
    metricsSecretUri: keyVault!.outputs.metricsSecretUri
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
output apiIdentityName string = deploymentEnabled ? apiIdentity!.outputs.name : ''
output apiIdentityPrincipalId string = deploymentEnabled ? apiIdentity!.outputs.principalId : ''
output jobWorkerIdentityClientId string = deploymentEnabled ? jobWorkerIdentity!.outputs.clientId : ''
output jobWorkerIdentityName string = deploymentEnabled ? jobWorkerIdentity!.outputs.name : ''
output jobWorkerIdentityPrincipalId string = deploymentEnabled ? jobWorkerIdentity!.outputs.principalId : ''
output storageAccountName string = deploymentEnabled ? storage!.outputs.name : ''
output postgresqlFqdn string = deploymentEnabled ? postgresql!.outputs.fqdn : ''
output runtimeEnabled bool = runtimeEnabled
output apiFqdn string = runtimeEnabled ? runtime!.outputs.apiFqdn : ''
output webFqdn string = runtimeEnabled ? runtime!.outputs.webFqdn : ''
output portalFqdn string = runtimeEnabled ? runtime!.outputs.portalFqdn : ''
output privateEndpointIds array = deploymentEnabled ? privateEndpoints!.outputs.privateEndpointIds : []
