import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Platform, ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Host, Picker } from '@expo/ui/swift-ui';
import { VerifyIdentityWithWalletButton } from 'expo-identity';
import type { IdentityDocumentRequest } from 'expo-identity';

// Document types we can request with the available entitlements
const documentTypes = [
  { label: "Driver's License / State ID", value: 'driversLicense' },
  { label: 'National ID Card', value: 'nationalIDCard' },
] as const;

// All VerifyIdentityWithWalletButtonLabel variants from Apple's documentation
const buttonLabels = [
  { label: 'Continue', value: 'continue' },
  { label: 'Verify', value: 'verify' },
  { label: 'Verify Age', value: 'verifyAge' },
  { label: 'Verify Identity', value: 'verifyIdentity' },
] as const;

const initialDocument = documentTypes[0];
const MERCHANT_IDENTIFIER = 'merchant.dog.icecube.identitytest';

export default function App() {
  const [selectedDocIndex, setSelectedDocIndex] = useState<number>(0);
  const [verificationStatus, setVerificationStatus] = useState<string>(
    'Fetching server nonce...'
  );
  const [nonce, setNonce] = useState<string>('');
  const [verificationDetails, setVerificationDetails] = useState<any | null>(null);

  const selectedDocument = documentTypes[selectedDocIndex] ?? documentTypes[0];
  const selectedDocumentKind = selectedDocument.value;
  const isNonceReady = nonce.length > 0;

  const fetchNonce = useCallback(async () => {
    try {
      const response = await fetch('/nonce');
      const payload = await response
        .json()
        .catch(() => ({ error: 'Malformed nonce response' }));

      if (!response.ok || !payload?.nonce) {
        const message = payload?.error ?? 'Nonce endpoint returned an error';
        throw new Error(message);
      }

      setNonce(payload.nonce);
      setVerificationDetails(null);
      const nextLabel = documentTypes[selectedDocIndex]?.label ?? initialDocument.label;
      setVerificationStatus(`Ready to verify ${nextLabel}`);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      setNonce('');
      setVerificationDetails(null);
      setVerificationStatus(`❌ Failed to fetch nonce: ${message}`);
    }
  }, [selectedDocIndex]);

  useEffect(() => {
    void fetchNonce();
  }, [fetchNonce]);

  const handleDocumentChange = useCallback((index: number) => {
    if (Number.isInteger(index)) {
      setSelectedDocIndex(index);
      setNonce('');
      setVerificationDetails(null);
      const nextDoc = documentTypes[index] ?? documentTypes[0];
      setVerificationStatus(`Fetching server nonce for ${nextDoc.label}...`);
    }
  }, []);

  const sendVerificationResult = useCallback(
    async (encryptedData: string) => {
      if (!nonce) {
        setVerificationStatus('❌ Cannot decrypt response: missing nonce.');
        setNonce('');
        void fetchNonce();
        return;
      }

      try {
        setVerificationStatus('🔐 Decrypting identity response...');

        const response = await fetch('/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            encryptedData,
            nonce,
            merchantIdentifier: MERCHANT_IDENTIFIER,
          }),
        });

        const payload = await response
          .json()
          .catch(() => ({ error: 'Malformed server response' }));

        if (!response.ok || payload?.error) {
          const message = payload?.error ?? 'Server rejected verification payload';
          setVerificationStatus(`❌ Verification failed: ${message}`);
          setVerificationDetails(null);
          return;
        }

        console.log('Decrypted identity payload', payload.identity);
        setVerificationStatus(
          `✅ Verification succeeded. Identity payload received for ${selectedDocument.label}.`
        );
        setVerificationDetails(payload.documents?.[0] ?? null);
      } catch (error: any) {
        const message = error?.message ?? String(error);
        setVerificationStatus(`❌ Verification failed: ${message}`);
        setVerificationDetails(null);
      } finally {
        setNonce('');
        void fetchNonce();
      }
    },
    [fetchNonce, nonce, selectedDocument.label]
  );

  const handleButtonPress = (label: string) => (e: any) => {
    console.log(`Button pressed - ${label}:`, e);
    setVerificationStatus(`🔄 Verification starting with ${label} button...`);
    setVerificationDetails(null);
  };

  const handleCompletion = (label: string) => (e: any) => {
    const { ok, error, code, encryptedData } = e.nativeEvent;
    console.log(`Verification completed - ${label}:`, e.nativeEvent);

    if (ok) {
      if (encryptedData) {
        void sendVerificationResult(encryptedData);
      } else {
        setVerificationStatus('⚠️ Verification succeeded but missing encrypted payload.');
        setNonce('');
        setVerificationDetails(null);
        void fetchNonce();
      }
    } else {
      setVerificationStatus(`❌ Verification failed with ${label}: ${error} (${code})`);
      setNonce('');
      setVerificationDetails(null);
      void fetchNonce();
    }
  };

  const identityRequest = useMemo<IdentityDocumentRequest>(() => {
    const baseConfig: IdentityDocumentRequest = {
      merchantIdentifier: MERCHANT_IDENTIFIER,
      ...(nonce ? { nonce } : {}),
    };

    switch (selectedDocumentKind) {
      case 'driversLicense':
        return {
          ...baseConfig,
          driversLicense: {
            elements: ['age'],
            intentToStore: { intentToStore: 'willNotStore' },
          },
        };
      case 'nationalIDCard':
        return {
          ...baseConfig,
          nationalIDCard: {
            elements: ['age'],
            intentToStore: { intentToStore: 'willNotStore' },
          },
        };
      default:
        return baseConfig;
    }
  }, [selectedDocumentKind, nonce]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>VerifyIdentityWithWallet Demo</Text>
            <Text style={styles.subtitle}>Test all button labels and document types</Text>
          </View>

          {/* Document Type Picker */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Document Type</Text>
            <Text style={styles.description}>Select which credential you want the wallet to share.</Text>
            <View style={styles.segmentedPickerContainer}>
              <Host matchContents style={styles.segmentedHost}>
                <Picker
                  options={documentTypes.map((type) => type.label)}
                  selectedIndex={selectedDocIndex}
                  onOptionSelected={({ nativeEvent: { index } }) => {
                    handleDocumentChange(index);
                  }}
                  variant="segmented"
                />
              </Host>
            </View>
            <Text style={styles.selectionLabel}>Currently selected: {selectedDocument.label}</Text>
            <Text style={styles.selectionNote}>
              Requests only the age element so it matches the available entitlements. Photo ID
              flows require additional Wallet entitlements and are not included in this demo.
            </Text>
          </View>

          {/* Status Display */}
          <View style={styles.statusContainer}>
            <Text style={styles.statusLabel}>Status:</Text>
            <Text style={styles.statusText}>{verificationStatus}</Text>
          </View>

          {verificationDetails && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Verification Details</Text>
              <Text style={styles.detailText}>
                Document Type: {verificationDetails.docType ?? 'Unknown'}
              </Text>
              {verificationDetails.fullName && (
                <Text style={styles.detailText}>Name: {verificationDetails.fullName}</Text>
              )}
              {verificationDetails.birthDate && (
                <Text style={styles.detailText}>Birth Date: {verificationDetails.birthDate}</Text>
              )}
              {typeof verificationDetails.ageInYears === 'number' && (
                <Text style={styles.detailText}>
                  Age: {verificationDetails.ageInYears} years
                </Text>
              )}
              {verificationDetails.ageThresholdMet != null && (
                <Text style={styles.detailText}>
                  Meets Age {verificationDetails.ageThreshold ?? 21}+ Requirement:{' '}
                  {verificationDetails.ageThresholdMet ? 'Yes' : 'No'}
                </Text>
              )}
            </View>
          )}

          {Platform.OS === 'ios' && (isNonceReady ? (
            <>
              {/* Button Label Variants */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Button Label Variants</Text>
                <Text style={styles.description}>
                  Testing all VerifyIdentityWithWalletButtonLabel options with {selectedDocument.label}
                </Text>

                {buttonLabels.map((labelConfig) => (
                  <View key={labelConfig.value} style={styles.buttonGroup}>
                    <Text style={styles.buttonGroupTitle}>{labelConfig.label} Label</Text>

                    {/* Black Style */}
                    <View style={styles.buttonContainer}>
                      <Text style={styles.buttonStyleLabel}>Black Style:</Text>
                      <VerifyIdentityWithWalletButton
                        documentKind={selectedDocumentKind}
                        label={labelConfig.value}
                        buttonStyle="black"
                        identityRequest={identityRequest}
                        onButtonPress={handleButtonPress(`${labelConfig.label} (Black)`)}
                        onCompletion={handleCompletion(`${labelConfig.label} (Black)`)}
                        style={styles.button}
                      />
                    </View>

                    {/* Black Outline Style */}
                    <View style={styles.buttonContainer}>
                      <Text style={styles.buttonStyleLabel}>Black Outline Style:</Text>
                      <VerifyIdentityWithWalletButton
                        documentKind={selectedDocumentKind}
                        label={labelConfig.value}
                        buttonStyle="blackOutline"
                        identityRequest={identityRequest}
                        onButtonPress={handleButtonPress(`${labelConfig.label} (Outline)`)}
                        onCompletion={handleCompletion(`${labelConfig.label} (Outline)`)}
                        style={styles.button}
                      />
                    </View>
                  </View>
                ))}
              </View>

              {/* Age Verification Example */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Age Verification (21+)</Text>
                <Text style={styles.description}>
                  Demonstrates age threshold verification without revealing exact age
                </Text>

              <VerifyIdentityWithWalletButton
                documentKind={selectedDocumentKind}
                label="verifyAge"
                buttonStyle="black"
                identityRequest={{
                  merchantIdentifier: MERCHANT_IDENTIFIER,
                  ...(nonce ? { nonce } : {}),
                  [selectedDocumentKind]: {
                    elements: [{ type: 'ageAtLeast', threshold: 21 }],
                    intentToStore: { intentToStore: 'willNotStore' },
                  },
                }}
                  onButtonPress={handleButtonPress('Age 21+ Verification')}
                  onCompletion={handleCompletion('Age 21+ Verification')}
                  style={styles.button}
                />
              </View>
            </>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Identity Verification</Text>
              <Text style={styles.description}>
                Waiting for a server-provided nonce before enabling verification buttons.
              </Text>
            </View>
          ))}

          {Platform.OS !== 'ios' && (
            <View style={styles.platformWarning}>
              <Text style={styles.warningText}>
                ⚠️ VerifyIdentityWithWallet is only available on iOS 18+
              </Text>
              <Text style={styles.warningSubtext}>
                This demo requires an iOS device or simulator
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  segmentedPickerContainer: {
    marginTop: 8,
  },
  segmentedHost: {
    width: '100%',
  },
  segmentedControl: {
    width: '100%',
  },
  selectionLabel: {
    marginTop: 12,
    fontSize: 13,
    color: '#444',
  },
  selectionNote: {
    marginTop: 6,
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  detailText: {
    fontSize: 14,
    color: '#444',
    marginTop: 4,
  },
  statusContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  buttonGroup: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  buttonGroupTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  buttonContainer: {
    marginBottom: 12,
  },
  buttonStyleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  button: {
    height: 50,
    marginBottom: 8,
  },
  platformWarning: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
  },
  warningText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#856404',
    textAlign: 'center',
    marginBottom: 8,
  },
  warningSubtext: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
});
