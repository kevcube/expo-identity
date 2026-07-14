import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  VerifyIdentityWithWalletButton,
  VerifyIdentityWithWalletButtonLabelEnum,
  VerifyIdentityWithWalletButtonStyleEnum,
} from "expo-identity";
import type { IdentityDocumentRequest } from "expo-identity";

const MERCHANT_IDENTIFIER = "merchant.dog.icecube.identitytest";
const HARD_CODED_NONCE = "MIGJAoGBALRANDOMNONCEHARDCODEDPLACEHOLDER";
const DOCUMENT_LABEL = "Photo ID";

export default function App() {
  const [status, setStatus] = useState("Ready to verify Photo ID");
  const [nonce, setNonce] = useState<string>(HARD_CODED_NONCE);
  const [nonceReady, setNonceReady] = useState(true);
  const [details, setDetails] = useState<any | null>(null);

  const fetchNonce = useCallback(async () => {
    setNonce(HARD_CODED_NONCE);
    setNonceReady(true);

    try {
      const response = await fetch("/nonce");
      const payload = await response
        .json()
        .catch(() => ({ error: "Malformed nonce response" }));

      if (!response.ok || !payload?.nonce) {
        const message = payload?.error ?? "Nonce endpoint returned an error";
        throw new Error(message);
      }

      setNonce(payload.nonce ?? HARD_CODED_NONCE);
      setNonceReady(true);
      setDetails(null);
      setStatus(`Ready to verify ${DOCUMENT_LABEL}`);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      setNonce(HARD_CODED_NONCE);
      setNonceReady(true);
      setDetails(null);
      setStatus(`❌ Failed to fetch nonce: ${message}`);
    }
  }, []);

  useEffect(() => {
    void fetchNonce();
  }, [fetchNonce]);

  const sendVerificationResult = useCallback(
    async (encryptedData: string) => {
      try {
        setStatus("🔐 Decrypting identity response...");

        const response = await fetch("/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            encryptedData,
            nonce,
            merchantIdentifier: MERCHANT_IDENTIFIER,
          }),
        });

        const payload = await response
          .json()
          .catch(() => ({ error: "Malformed server response" }));

        if (!response.ok || payload?.error) {
          const message =
            payload?.error ?? "Server rejected verification payload";
          setStatus(`❌ Verification failed: ${message}`);
          setDetails(null);
          return;
        }

        setStatus("✅ Verification succeeded. Age credential received.");
        setDetails(payload.documents?.[0] ?? null);
      } catch (error: any) {
        const message = error?.message ?? String(error);
        setStatus(`❌ Verification failed: ${message}`);
        setDetails(null);
      } finally {
        setNonce(HARD_CODED_NONCE);
        setNonceReady(true);
      }
    },
    [fetchNonce, nonce, nonceReady],
  );

  const handleButtonPress = useCallback(() => {
    setStatus("🔄 Verification starting...");
    setDetails(null);
  }, [fetchNonce, nonceReady]);

  const handleCompletion = useCallback(
    (event: any) => {
      const { ok, error, code, encryptedData } = event.nativeEvent;

      if (ok) {
        if (encryptedData) {
          void sendVerificationResult(encryptedData);
        } else {
          setStatus("⚠️ Verification succeeded but missing encrypted payload.");
          setNonce(HARD_CODED_NONCE);
          setNonceReady(true);
          setDetails(null);
          void fetchNonce();
        }
      } else {
        setStatus(`❌ Verification failed: ${error} (${code})`);
        setNonce(HARD_CODED_NONCE);
        setNonceReady(true);
        setDetails(null);
        void fetchNonce();
      }
    },
    [fetchNonce, sendVerificationResult],
  );

  const identityRequest = useMemo<IdentityDocumentRequest>(() => {
    const baseConfig: IdentityDocumentRequest = {
      merchantIdentifier: MERCHANT_IDENTIFIER,
      ...(nonceReady ? { nonce } : {}),
    };

    return {
      ...baseConfig,
      driversLicense: {
        elements: ["age"],
        intentToStore: { intentToStore: "willNotStore" },
      },
    };
  }, [nonce, nonceReady]);

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "bottom", "left", "right"]}>
        <ScrollView contentInsetAdjustmentBehavior="automatic">
          <View>
            <Text>VerifyIdentityWithWallet Demo</Text>
            <Text>Verify the age element from a Wallet credential</Text>
          </View>

          <View>
            <Text>Status:</Text>
            <Text>{status}</Text>
            {!nonceReady && (
              <Text>
                Fetching a fresh nonce. The button will re-enable shortly.
              </Text>
            )}
          </View>

          {details && (
            <View>
              <Text>Verification Details</Text>
              {details.docType && <Text>Document Type: {details.docType}</Text>}
              {typeof details.ageInYears === "number" && (
                <Text>Age: {details.ageInYears} years</Text>
              )}
              {details.ageThresholdMet != null && (
                <Text>
                  Meets Age {details.ageThreshold ?? 21}+ Requirement:{" "}
                  {details.ageThresholdMet ? "Yes" : "No"}
                </Text>
              )}
            </View>
          )}

          <View>
            <Text>{`Verify ${DOCUMENT_LABEL}`}</Text>
            <VerifyIdentityWithWalletButton
              documentKind="driversLicense"
              label={VerifyIdentityWithWalletButtonLabelEnum.VerifyAge}
              buttonStyle={VerifyIdentityWithWalletButtonStyleEnum.Black}
              identityRequest={identityRequest}
              onButtonPress={handleButtonPress}
              onCompletion={handleCompletion}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
