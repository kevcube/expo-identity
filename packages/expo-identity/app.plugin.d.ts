import type { ConfigPlugin } from '@expo/config-plugins';

export type AppleIdentityDocumentType =
  | 'us-drivers-license'
  | 'jp-national-id-card'
  | 'photo-id'
  | (string & {});

export type AppleIdentityElement =
  | 'address'
  | 'age'
  | 'date-of-birth'
  | 'document-dhs-compliance-status'
  | 'document-expiration-date'
  | 'document-issue-date'
  | 'document-number'
  | 'driving-privileges'
  | 'eye-color'
  | 'family-name'
  | 'given-name'
  | 'hair-color'
  | 'height'
  | 'issuing-authority'
  | 'jp-individual-number'
  | 'organ-donor-status'
  | 'portrait'
  | 'sex'
  | 'veteran-status'
  | 'weight'
  | (string & {});

export interface ExpoIdentityPluginOptions {
  ios: {
    usageDescription: string;
    merchantIdentifiers: string[];
    documentTypes: AppleIdentityDocumentType[];
    elements: AppleIdentityElement[];
  };
}

declare const withExpoIdentity: ConfigPlugin<ExpoIdentityPluginOptions>;
export default withExpoIdentity;
