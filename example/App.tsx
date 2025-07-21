import { useEvent } from "expo";
import ExpoIdentity, {
  isIdentityDocumentSupported,
  requestIdentityDocument,
  IdentityDocumentData,
  IdentityElement,
} from "expo-identity";
import { useState, useEffect } from "react";
import {
  Button,
  SafeAreaView,
  ScrollView,
  Text,
  View,
  Alert,
  Image,
  Platform,
} from "react-native";

export default function App() {
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [identityData, setIdentityData] = useState<IdentityDocumentData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);

  const onIdentityReceived = useEvent(ExpoIdentity, "onIdentityReceived");
  const onError = useEvent(ExpoIdentity, "onError");

  useEffect(() => {
    checkSupport();
  }, []);

  useEffect(() => {
    if (onIdentityReceived) {
      setIdentityData(onIdentityReceived);
    }
  }, [onIdentityReceived]);

  useEffect(() => {
    if (onError) {
      Alert.alert("Error", `${onError.code}: ${onError.message}`);
    }
  }, [onError]);

  const checkSupport = async () => {
    try {
      const supported = await isIdentityDocumentSupported();
      setIsSupported(supported);
    } catch (error) {
      console.error("Error checking support:", error);
      setIsSupported(false);
    }
  };

  const requestBasicInfo = async () => {
    setIsLoading(true);
    try {
      const elements: IdentityElement[] = [
        "givenName",
        "familyName",
        "dateOfBirth",
        "age",
      ];
      const data = await requestIdentityDocument(elements);
      setIdentityData(data);
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.message || "Failed to request identity document",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const requestFullInfo = async () => {
    setIsLoading(true);
    try {
      const elements: IdentityElement[] = [
        "givenName",
        "familyName",
        "address",
        "dateOfBirth",
        "age",
        "documentNumber",
        "documentExpirationDate",
        "documentIssueDate",
        "issuingAuthority",
        "portrait",
      ];
      const data = await requestIdentityDocument(elements);
      setIdentityData(data);
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.message || "Failed to request identity document",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const requestAgeVerification = async () => {
    setIsLoading(true);
    try {
      const elements: IdentityElement[] = ["ageThreshold"];
      const data = await requestIdentityDocument(elements);
      setIdentityData(data);
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.message || "Failed to request age verification",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>Identity Document Example</Text>

        <Group name="Support Status">
          <Text style={styles.text}>
            Platform: {Platform.OS} {Platform.Version}
          </Text>
          <Text style={styles.text}>
            Identity Document Support:{" "}
            {isSupported === null
              ? "Checking..."
              : isSupported
                ? "Supported ✓"
                : "Not Supported ✗"}
          </Text>
        </Group>

        {isSupported && (
          <Group name="Request Identity Information">
            <Button
              title="Request Basic Info"
              onPress={requestBasicInfo}
              disabled={isLoading}
            />
            <View style={{ height: 10 }} />
            <Button
              title="Request Full Document"
              onPress={requestFullInfo}
              disabled={isLoading}
            />
            <View style={{ height: 10 }} />
            <Button
              title="Verify Age (18+)"
              onPress={requestAgeVerification}
              disabled={isLoading}
            />
          </Group>
        )}

        {identityData && (
          <Group name="Identity Information">
            {identityData.givenName && (
              <Text style={styles.text}>
                Given Name: {identityData.givenName}
              </Text>
            )}
            {identityData.familyName && (
              <Text style={styles.text}>
                Family Name: {identityData.familyName}
              </Text>
            )}
            {identityData.dateOfBirth && (
              <Text style={styles.text}>
                Date of Birth: {identityData.dateOfBirth}
              </Text>
            )}
            {identityData.age !== undefined && (
              <Text style={styles.text}>Age: {identityData.age}</Text>
            )}
            {identityData.meetsAgeThreshold !== undefined && (
              <Text style={styles.text}>
                Meets Age Threshold (18+):{" "}
                {identityData.meetsAgeThreshold ? "Yes" : "No"}
              </Text>
            )}
            {identityData.documentNumber && (
              <Text style={styles.text}>
                Document Number: {identityData.documentNumber}
              </Text>
            )}
            {identityData.documentExpirationDate && (
              <Text style={styles.text}>
                Expiration Date: {identityData.documentExpirationDate}
              </Text>
            )}
            {identityData.documentIssueDate && (
              <Text style={styles.text}>
                Issue Date: {identityData.documentIssueDate}
              </Text>
            )}
            {identityData.issuingAuthority && (
              <Text style={styles.text}>
                Issuing Authority: {identityData.issuingAuthority}
              </Text>
            )}
            {identityData.address && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.text}>Address:</Text>
                <Text style={styles.text}> {identityData.address.street}</Text>
                <Text style={styles.text}>
                  {" "}
                  {identityData.address.city},{" "}
                  {identityData.address.subdivision}{" "}
                  {identityData.address.postalCode}
                </Text>
                <Text style={styles.text}> {identityData.address.country}</Text>
              </View>
            )}
            {identityData.portraitBase64 && (
              <View style={{ marginTop: 10, alignItems: "center" }}>
                <Text style={styles.text}>Portrait:</Text>
                <Image
                  source={{
                    uri: `data:image/jpeg;base64,${identityData.portraitBase64}`,
                  }}
                  style={{
                    width: 150,
                    height: 150,
                    marginTop: 10,
                    borderRadius: 10,
                  }}
                />
              </View>
            )}
          </Group>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Group(props: { name: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeader}>{props.name}</Text>
      {props.children}
    </View>
  );
}

const styles = {
  header: {
    fontSize: 30,
    margin: 20,
  },
  groupHeader: {
    fontSize: 20,
    marginBottom: 20,
  },
  group: {
    margin: 20,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
  },
  container: {
    flex: 1,
    backgroundColor: "#eee",
  },
  text: {
    fontSize: 16,
    marginVertical: 4,
  },
};
