import React, { useCallback, useState } from "react";
import { ScrollView, Text, View, Button } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  requestIdentityCredential,
  isIdentityCredentialSupported,
} from "w3c-credential-browser";

const OPENID4VP_REQUEST = "eyJhbGciOiJub25lIn0.placeholder-openid4vp-request";

async function postVerification(response: unknown) {
  try {
    await fetch("/web-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });
  } catch (error) {
    console.error("Failed to post verification response", error);
  }
}

export default function App() {
  const [status, setStatus] = useState<string>("Ready to verify age via W3C credentials");
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  const handleVerify = useCallback(async () => {
    if (!isIdentityCredentialSupported()) {
      setStatus("Identity credentials are not supported in this browser");
      return;
    }

    setStatus("Requesting credential...");

    try {
      const credential = await requestIdentityCredential({
        providers: [
          {
            protocol: "openid4vp",
            request: OPENID4VP_REQUEST,
            format: "vc+sd-jwt",
          },
        ],
        mediation: "optional",
      });

      setLastResponse(credential);
      setStatus("Credential received; sending to server...");
      await postVerification(credential);
      setStatus("Credential sent to server (see console)");
    } catch (error: any) {
      console.error("Credential request failed", error);
      setStatus(`Failed to request credential: ${error?.message ?? String(error)}`);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24 }}>
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontWeight: "600", fontSize: 18 }}>W3C Age Verification Demo</Text>
            <Text>Requests an age credential using navigator.credentials.</Text>
          </View>

          <View style={{ marginBottom: 24 }}>
            <Button title="Verify Age" onPress={handleVerify} />
          </View>

          <View style={{ marginBottom: 24 }}>
            <Text>Status:</Text>
            <Text>{status}</Text>
          </View>

          {lastResponse && (
            <View>
              <Text>Last credential (JSON preview):</Text>
              <Text selectable>{JSON.stringify(lastResponse, null, 2)}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
