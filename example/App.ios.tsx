import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Button, Alert } from 'react-native';
import { Switch, TextInput } from '@expo/ui/swift-ui';
import * as ExpoIdentity from 'expo-identity';
import type {
  IdentityDocument,
  IdentityDocumentRequest,
  CommonElements,
  DriversLicenseRequestableElements,
  PhotoIDRequestableElements,
  AgeAtLeastElement,
  IntentToStore
} from 'expo-identity';

type DocumentType = IdentityDocument;

interface SelectedElements {
  driversLicense: Set<string>;
  nationalIDCard: Set<string>;
  photoID: Set<string>;
}

const DRIVERS_LICENSE_ELEMENTS = [
  { id: 'givenName', label: 'Given Name' },
  { id: 'familyName', label: 'Family Name' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'address', label: 'Address' },
  { id: 'issuingAuthority', label: 'Issuing Authority' },
  { id: 'documentExpirationDate', label: 'Document Expiration Date' },
  { id: 'documentIssueDate', label: 'Document Issue Date' },
  { id: 'documentNumber', label: 'Document Number' },
  { id: 'drivingPrivilege', label: 'Driving Privilege' },
  { id: 'age', label: 'Age' },
  { id: 'dateOfBirth', label: 'Date of Birth' },
  { id: 'ageAtLeast', label: 'Age At Least' },
];

const NATIONAL_ID_ELEMENTS = [
  { id: 'givenName', label: 'Given Name' },
  { id: 'familyName', label: 'Family Name' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'address', label: 'Address' },
  { id: 'documentNumber', label: 'Document Number' },
  { id: 'sex', label: 'Sex' },
  { id: 'age', label: 'Age' },
  { id: 'dateOfBirth', label: 'Date of Birth' },
  { id: 'ageAtLeast', label: 'Age At Least' },
];

const PHOTO_ID_ELEMENTS = [
  { id: 'familyName', label: 'Family Name' },
  { id: 'givenName', label: 'Given Name' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'address', label: 'Address' },
  { id: 'issuingAuthority', label: 'Issuing Authority' },
  { id: 'documentIssueDate', label: 'Document Issue Date' },
  { id: 'documentExpirationDate', label: 'Document Expiration Date' },
  { id: 'documentNumber', label: 'Document Number' },
  { id: 'sex', label: 'Sex' },
  { id: 'dateOfBirth', label: 'Date of Birth' },
  { id: 'age', label: 'Age' },
  { id: 'ageAtLeast', label: 'Age At Least' },
];

export default function App() {
  const [selectedDocuments, setSelectedDocuments] = useState<Set<DocumentType>>(new Set());
  const [selectedElements, setSelectedElements] = useState<SelectedElements>({
    driversLicense: new Set(),
    nationalIDCard: new Set(),
    photoID: new Set(),
  });
  const [ageThreshold, setAgeThreshold] = useState('18');

  const toggleDocument = (docType: DocumentType) => {
    setSelectedDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(docType)) {
        newSet.delete(docType);
        // Clear elements when document type is deselected
        setSelectedElements(prev => ({
          ...prev,
          [docType]: new Set(),
        }));
      } else {
        newSet.add(docType);
      }
      return newSet;
    });
  };

  const toggleElement = (docType: DocumentType, elementId: string) => {
    setSelectedElements(prev => ({
      ...prev,
      [docType]: new Set(
        prev[docType].has(elementId)
          ? [...prev[docType]].filter(id => id !== elementId)
          : [...prev[docType], elementId]
      ),
    }));
  };

  const getElementsForDocument = (docType: DocumentType) => {
    switch (docType) {
      case 'driversLicense':
        return DRIVERS_LICENSE_ELEMENTS;
      case 'nationalIDCard':
        return NATIONAL_ID_ELEMENTS;
      case 'photoID':
        return PHOTO_ID_ELEMENTS;
    }
  };

  const requestIdentity = async () => {
    try {
      const request: IdentityDocumentRequest = {};

      selectedDocuments.forEach(docType => {
        const rawSelected = Array.from(selectedElements[docType]);

        // Map every selected string element directly.
        let elements: (CommonElements | DriversLicenseRequestableElements | PhotoIDRequestableElements | AgeAtLeastElement)[] =
          rawSelected.filter(id => id !== 'ageAtLeast') as any;

        // If the user filled an Age-At-Least threshold and selected ageAtLeast, push the object element.
        const threshold = parseInt(ageThreshold, 10);
        if (rawSelected.includes('ageAtLeast') && !Number.isNaN(threshold) && threshold > 0) {
          elements.push({ type: 'ageAtLeast', threshold });
        }

        if (elements.length === 0) {
          return; // skip this docType – nothing requested
        }

        // Per-document intent – for now always "willNotStore".
        const intentToStore: IntentToStore = { intentToStore: 'willNotStore' };

        if (docType === 'driversLicense') {
          request.driversLicense = {
            elements: elements as any, // Type assertion needed due to UniqueArray constraint
            intentToStore
          };
        } else if (docType === 'nationalIDCard') {
          request.nationalIDCard = {
            elements: elements as any,
            intentToStore
          };
        } else if (docType === 'photoID') {
          request.photoID = {
            elements: elements as any,
            intentToStore
          };
        }
      });

      if (Object.keys(request).length === 0) {
        Alert.alert('Error', 'Please select at least one document type and element');
        return;
      }

      // Send the request to the native module
      await ExpoIdentity.requestIdentityDocument(request);
      Alert.alert('Success', 'Identity document received');
    } catch (error) {
      console.error(error)
      Alert.alert('Error', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Identity Document Request</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Document Types</Text>

        <View style={styles.documentType}>
          <Text style={styles.label}>Driver's License</Text>
          <Switch
            value={selectedDocuments.has('driversLicense')}
            onValueChange={() => toggleDocument('driversLicense')}
          />
        </View>

        <View style={styles.documentType}>
          <Text style={styles.label}>National ID Card</Text>
          <Switch
            value={selectedDocuments.has('nationalIDCard')}
            onValueChange={() => toggleDocument('nationalIDCard')}
          />
        </View>

        <View style={styles.documentType}>
          <Text style={styles.label}>Photo ID</Text>
          <Switch
            value={selectedDocuments.has('photoID')}
            onValueChange={() => toggleDocument('photoID')}
          />
        </View>
      </View>

      {Array.from(selectedDocuments).map(docType => (
        <View key={docType} style={styles.section}>
          <Text style={styles.sectionTitle}>
            {docType === 'driversLicense' && "Driver's License Elements"}
            {docType === 'nationalIDCard' && 'National ID Elements'}
            {docType === 'photoID' && 'Photo ID Elements'}
          </Text>

          {getElementsForDocument(docType).map(element => (
            <View key={element.id} style={styles.element}>
              <Text style={styles.elementLabel}>{element.label}</Text>
              {element.id === 'ageAtLeast' ? (
                <TextInput
                  defaultValue={ageThreshold}
                  onChangeText={setAgeThreshold}
                  keyboardType="numeric"
                  style={styles.ageInput}
                />
              ) : (
                <Switch
                  variant="checkbox"
                  value={selectedElements[docType].has(element.id)}
                  onValueChange={() => toggleElement(docType, element.id)}
                />
              )}
            </View>
          ))}
        </View>
      ))}

      <View style={styles.buttonContainer}>
        <Button title="Request Identity Document" onPress={requestIdentity} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 60,
    marginBottom: 20,
  },
  section: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  documentType: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  label: {
    fontSize: 16,
  },
  element: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  elementLabel: {
    fontSize: 14,
    flex: 1,
  },
  ageInput: {
    width: 60,
    height: 30,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  buttonContainer: {
    margin: 16,
    marginBottom: 40,
  },
});
