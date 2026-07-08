import {
  canonicalizeApiMode,
  canonicalizeModelKey,
  canonicalizeModelKeyArray,
  canonicalizeSessionModelFields,
} from '../../config/model-key-migrations.mjs'

const conflictingKeyPairs = [
  ['claudeApiKey', 'anthropicApiKey'],
  ['customClaudeApiUrl', 'customAnthropicApiUrl'],
]

export function prepareImportData(data) {
  const normalizedData = { ...data }
  const keysToRemove = []

  for (const [legacyKey, anthropicKey] of conflictingKeyPairs) {
    const hasLegacyKey = Object.hasOwn(data, legacyKey)
    const hasAnthropicKey = Object.hasOwn(data, anthropicKey)

    if (hasLegacyKey && !hasAnthropicKey) {
      normalizedData[anthropicKey] = data[legacyKey]
      keysToRemove.push(legacyKey)
    } else if (hasAnthropicKey && !hasLegacyKey) {
      normalizedData[legacyKey] = data[anthropicKey]
      keysToRemove.push(legacyKey)
    }
  }

  if (Object.hasOwn(normalizedData, 'modelName')) {
    normalizedData.modelName = canonicalizeModelKey(normalizedData.modelName)
  }
  if (Object.hasOwn(normalizedData, 'apiMode')) {
    normalizedData.apiMode = canonicalizeApiMode(normalizedData.apiMode)
  }
  if (Array.isArray(normalizedData.customApiModes)) {
    normalizedData.customApiModes = normalizedData.customApiModes.map(canonicalizeApiMode)
  }
  if (Array.isArray(normalizedData.activeApiModes)) {
    normalizedData.activeApiModes = canonicalizeModelKeyArray(normalizedData.activeApiModes)
  }
  if (Array.isArray(normalizedData.sessions)) {
    normalizedData.sessions = normalizedData.sessions.map(canonicalizeSessionModelFields)
  }

  return { normalizedData, keysToRemove }
}

export async function importDataIntoStorage(storageArea, data) {
  const { normalizedData, keysToRemove } = prepareImportData(data)

  await storageArea.set(normalizedData)

  if (keysToRemove.length > 0) {
    await storageArea.remove(keysToRemove)
  }
}
