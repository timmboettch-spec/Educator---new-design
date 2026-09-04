// User-Assigned Managed Identity for the backend Container App.
// Created up-front so the AcrPull role assignment can be made BEFORE the
// Container App tries to pull its image (eliminates the race that occurs
// with system-assigned MI).

targetScope = 'resourceGroup'

param name string
param location string
param tags object = {}

resource uai 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
  tags: tags
}

output id string = uai.id
output name string = uai.name
output principalId string = uai.properties.principalId
output clientId string = uai.properties.clientId
