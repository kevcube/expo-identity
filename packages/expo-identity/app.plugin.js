const {
  createRunOncePlugin,
  withEntitlementsPlist,
  withInfoPlist,
} = require('@expo/config-plugins');
const packageJson = require('./package.json');

/**
 * @typedef {Object} ExpoIdentityIosOptions
 * @property {string} usageDescription
 * @property {string[]} merchantIdentifiers
 * @property {string[]} documentTypes
 * @property {string[]} elements
 */

/** @typedef {{ ios: ExpoIdentityIosOptions }} ExpoIdentityPluginOptions */

function requiredString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`expo-identity: ${path} must be a nonempty string`);
  }
  return value.trim();
}

function requiredStringList(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`expo-identity: ${path} must be a nonempty string array`);
  }
  const result = [];
  const seen = new Set();
  value.forEach((item, index) => {
    const normalized = requiredString(item, `${path}[${index}]`);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  });
  return result;
}

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @param {ExpoIdentityPluginOptions} options
 */
function withExpoIdentity(config, options) {
  if (!options || typeof options !== 'object' || !options.ios) {
    throw new TypeError('expo-identity: ios options are required');
  }
  const usageDescription = requiredString(
    options.ios.usageDescription,
    'ios.usageDescription'
  );
  const merchantIdentifiers = requiredStringList(
    options.ios.merchantIdentifiers,
    'ios.merchantIdentifiers'
  );
  const documentTypes = requiredStringList(
    options.ios.documentTypes,
    'ios.documentTypes'
  );
  const elements = requiredStringList(options.ios.elements, 'ios.elements');

  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSIdentityUsageDescription = usageDescription;
    return mod;
  });
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.in-app-identity-presentment'] = {
      'document-types': documentTypes,
      elements,
    };
    mod.modResults[
      'com.apple.developer.in-app-identity-presentment.merchant-identifiers'
    ] = merchantIdentifiers;
    return mod;
  });
}

module.exports = createRunOncePlugin(
  withExpoIdentity,
  packageJson.name,
  packageJson.version
);
