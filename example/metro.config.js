// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.projectRoot = __dirname;

const projectModules = path.resolve(__dirname, './node_modules');
const workspaceModules = path.resolve(__dirname, './node_modules');

config.resolver.nodeModulesPaths = [projectModules, workspaceModules];

config.resolver.extraNodeModules = {
  'expo-identity': path.resolve(__dirname, '../packages/expo-identity'),
  expo: path.join(workspaceModules, 'expo'),
  'expo-router': path.join(workspaceModules, 'expo-router'),
  react: path.join(workspaceModules, 'react'),
  'react-native': path.join(workspaceModules, 'react-native'),
};

config.watchFolders = [
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '../packages'),
];

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
