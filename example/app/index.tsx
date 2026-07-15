import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  createIdentityClient,
  type IdentityClientError,
  type Output,
  type PreparedIdentityRequest,
} from 'expo-identity';
import type { identity } from '../server/identity';

const identityClient = createIdentityClient<typeof identity>();

type PreparedAgeRequest = PreparedIdentityRequest<typeof identity, 'ageOver21'>;
type AgeResult = Output<typeof identity, 'ageOver21'>;

export default function App() {
  const [prepared, setPrepared] = useState<PreparedAgeRequest | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [error, setError] = useState<IdentityClientError | null>(null);
  const [result, setResult] = useState<AgeResult | null>(null);

  const prepareFreshRequest = useCallback(async (clearOutcome: boolean) => {
    setPrepared(null);
    setPreparing(true);
    if (clearOutcome) {
      setError(null);
      setResult(null);
    }
    const next = await identityClient.prepare({ request: 'ageOver21' });
    setPreparing(false);
    if (next.error) {
      setError(next.error);
      return;
    }
    setPrepared(next.data);
  }, []);

  useEffect(() => {
    void prepareFreshRequest(true);
  }, [prepareFreshRequest]);

  const verifyAge = useCallback(async () => {
    if (!prepared || presenting) {
      return;
    }
    const request = prepared;
    setPrepared(null);
    setPresenting(true);
    setError(null);
    setResult(null);

    const verification = await request.present();
    setPresenting(false);
    if (verification.error) {
      setError(verification.error);
    } else {
      setResult(verification.data);
    }
    await prepareFreshRequest(false);
  }, [prepared, prepareFreshRequest, presenting]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <Text style={styles.title}>Digital identity age check</Text>
            <Text>
              Request and verify only whether an identity document proves age 21 or
              older.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Status</Text>
            {preparing && <Text>Preparing a one-time identity request…</Text>}
            {presenting && <Text>Waiting for identity presentation…</Text>}
            {!preparing && !presenting && prepared && !error && !result && (
              <Text>Ready to verify.</Text>
            )}
            {error && (
              <Text selectable style={styles.error}>
                {error.code}: {error.message}
              </Text>
            )}
            {result && (
              <View style={styles.result}>
                <Text selectable>Request: {result.request}</Text>
                <Text selectable>Assurance: {result.assurance}</Text>
                <Text selectable>
                  Age 21 or older: {result.ageOver21 ? 'Yes' : 'No'}
                </Text>
              </View>
            )}
          </View>

          {prepared && !presenting && (
            <Button title="Verify age" onPress={() => void verifyAge()} />
          )}
          {!prepared && !preparing && !presenting && (
            <Button
              title="Prepare another request"
              onPress={() => void prepareFreshRequest(true)}
            />
          )}
          {(preparing || presenting) && <ActivityIndicator style={styles.progress} />}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 24,
  },
  section: {
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#b42318',
  },
  result: {
    gap: 4,
  },
  progress: {
    marginTop: 8,
  },
});
