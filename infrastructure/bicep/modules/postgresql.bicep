targetScope = 'resourceGroup'

param name string
param location string
param tags object
param tenantId string
param delegatedSubnetResourceId string
param privateDnsZoneResourceId string
@minValue(7)
@maxValue(35)
param backupRetentionDays int = 35

resource databaseServer 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard_D4ds_v5'
    tier: 'GeneralPurpose'
  }
  properties: {
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: tenantId
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: 'Enabled'
    }
    createMode: 'Default'
    highAvailability: {
      mode: 'ZoneRedundant'
    }
    network: {
      delegatedSubnetResourceId: delegatedSubnetResourceId
      privateDnsZoneArmResourceId: privateDnsZoneResourceId
      publicNetworkAccess: 'Disabled'
    }
    storage: {
      autoGrow: 'Enabled'
      storageSizeGB: 128
    }
    version: '18'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2025-08-01' = {
  parent: databaseServer
  name: 'eiep'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

output id string = databaseServer.id
output fqdn string = databaseServer.properties.fullyQualifiedDomainName
