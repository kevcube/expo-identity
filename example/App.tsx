import { useEvent } from "expo";
import ExpoIdentity, {
	isIdentityDocumentSupported,
	canRequestIdentityDocument,
	requestIdentityDocument,
	VerifyIdentityWithWalletButton,
	type IdentityDocumentRequest,
} from "expo-identity";
import { useState, useEffect } from "react";
import {
	Button,
	ScrollView,
	Text,
	View,
	Alert,
	Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context"

export default function App() {
	const [isSupported, setIsSupported] = useState<boolean | null>(null);
	const [supportByType, setSupportByType] = useState<{
		driversLicense?: boolean;
		nationalIDCard?: boolean;
		photoID?: boolean;
	}>({});
	const [lastRequestSuccess, setLastRequestSuccess] = useState<boolean | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(false);

	const onIdentityReceived = useEvent(ExpoIdentity, "onIdentityReceived");
	const onError = useEvent(ExpoIdentity, "onError");

	useEffect(() => {
		checkSupport();
	}, [checkSupport]);

	useEffect(() => {
		if (onIdentityReceived) {
			// Wire up when native emits detailed data
			// For now, just mark success
			setLastRequestSuccess(true);
		}
	}, [onIdentityReceived]);

	useEffect(() => {
		if (onError) {
			Alert.alert("Error", `${onError.code}: ${onError.message}`);
		}
	}, [onError]);

	const checkSupport = async () => {
		try {
			// Back-compat single flag (nationalIDCard)
			const supported = await isIdentityDocumentSupported();
			setIsSupported(supported);

			// Detailed per-document probe
			const [dl, nid, pid] = await Promise.all([
				canRequestIdentityDocument("driversLicense"),
				canRequestIdentityDocument("nationalIDCard"),
				canRequestIdentityDocument("photoID"),
			]);
			setSupportByType({
				driversLicense: dl,
				nationalIDCard: nid,
				photoID: pid,
			});
		} catch (error) {
			console.error("Error checking support:", error);
			setIsSupported(false);
		}
	};

	const requestBasicInfo = async () => {
		setIsLoading(true);
		try {
			const req: IdentityDocumentRequest = {
				driversLicense: {
					elements: ["givenName", "familyName", "dateOfBirth", "age"],
					intentToStore: { intentToStore: "willNotStore" },
				},
			};
			const ok = await requestIdentityDocument(req);
			setLastRequestSuccess(ok);
		} catch (error: any) {
			Alert.alert(
				"Error",
				error.message || "Failed to request identity document",
			);
		} finally {
			setIsLoading(false);
		}
	};

	const requestNationalIDBasicInfo = async () => {
		setIsLoading(true);
		try {
			const req: IdentityDocumentRequest = {
				nationalIDCard: {
					elements: ["givenName", "familyName", "dateOfBirth", "age"],
					intentToStore: { intentToStore: "willNotStore" },
				},
			};
			const ok = await requestIdentityDocument(req);
			setLastRequestSuccess(ok);
		} catch (error: any) {
			Alert.alert(
				"Error",
				error.message || "Failed to request national ID document",
			);
		} finally {
			setIsLoading(false);
		}
	};

	const requestPhotoIDBasicInfo = async () => {
		setIsLoading(true);
		try {
			const req: IdentityDocumentRequest = {
				photoID: {
					elements: ["givenName", "familyName", "dateOfBirth"],
					intentToStore: { intentToStore: "willNotStore" },
				},
			};
			const ok = await requestIdentityDocument(req);
			setLastRequestSuccess(ok);
		} catch (error: any) {
			Alert.alert(
				"Error",
				error.message || "Failed to request photo ID document",
			);
		} finally {
			setIsLoading(false);
		}
	};

	const requestFullInfo = async () => {
		setIsLoading(true);
		try {
			const req: IdentityDocumentRequest = {
				driversLicense: {
					elements: [
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
					],
					intentToStore: { intentToStore: "willNotStore" },
				},
			};
			const ok = await requestIdentityDocument(req);
			setLastRequestSuccess(ok);
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
			const req: IdentityDocumentRequest = {
				driversLicense: {
					elements: [{ type: "ageAtLeast", threshold: 18 }],
					intentToStore: { intentToStore: "willNotStore" },
				},
			};
			const ok = await requestIdentityDocument(req);
			setLastRequestSuccess(ok);
		} catch (error: any) {
			Alert.alert(
				"Error",
				error.message || "Failed to request age verification",
			);
		} finally {
			setIsLoading(false);
		}
	};

	const requestTryAll = async () => {
		setIsLoading(true);
		try {
			// Build default basic requests for each type
			const dlReq: IdentityDocumentRequest = {
				driversLicense: {
					elements: ["givenName", "familyName", "dateOfBirth", "age"],
					intentToStore: { intentToStore: "willNotStore" },
				},
			};
			const nidReq: IdentityDocumentRequest = {
				nationalIDCard: {
					elements: ["givenName", "familyName", "dateOfBirth", "age"],
					intentToStore: { intentToStore: "willNotStore" },
				},
			};
			const pidReq: IdentityDocumentRequest = {
				photoID: {
					elements: ["givenName", "familyName", "dateOfBirth"],
					intentToStore: { intentToStore: "willNotStore" },
				},
			};

			// Probe in an order; adjust as desired
			const order: Array<{
				kind: "driversLicense" | "nationalIDCard" | "photoID";
				req: IdentityDocumentRequest;
			}> = [
				{ kind: "driversLicense", req: dlReq },
				{ kind: "nationalIDCard", req: nidReq },
				{ kind: "photoID", req: pidReq },
			];

			for (const item of order) {
				const can = await canRequestIdentityDocument(item.kind);
				if (can) {
					const ok = await requestIdentityDocument(item.req);
					setLastRequestSuccess(ok);
					return;
				}
			}

			Alert.alert(
				"Unsupported",
				"No requestable identity document type is available.",
			);
			setLastRequestSuccess(false);
		} catch (error: any) {
			Alert.alert(
				"Error",
				error.message || "Failed to request identity document",
			);
			setLastRequestSuccess(false);
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
					<View style={{ height: 8 }} />
					<Text style={styles.text}>
						Drivers License: {supportByType.driversLicense ? "✓" : "✗"}
					</Text>
					<Text style={styles.text}>
						National ID Card: {supportByType.nationalIDCard ? "✓" : "✗"}
					</Text>
					<Text style={styles.text}>
						Photo ID: {supportByType.photoID ? "✓" : "✗"}
					</Text>
				</Group>

				<Group name="Verify with Wallet Button (Drivers License)">
									{Platform.OS === "ios" ? (
										<VerifyIdentityWithWalletButton
											documentKind="driversLicense"
											label="verifyIdentity"
											buttonStyle="black"
											onButtonPress={requestBasicInfo}
											style={{ height: 54 }}
										/>
									) : (
										<Text style={styles.text}>
											The Verify with Wallet button is only available on iOS.
										</Text>
									)}
								</Group>
				<Group name="Verify with Wallet Button (National ID)">
									{Platform.OS === "ios" ? (
										<VerifyIdentityWithWalletButton
											documentKind="nationalIDCard"
											label="verifyIdentity"
											buttonStyle="black"
											onButtonPress={requestNationalIDBasicInfo}
											style={{ height: 54 }}
										/>
									) : null}
								</Group>
				<Group name="Verify with Wallet Button (Photo ID)">
									{Platform.OS === "ios" ? (
										<VerifyIdentityWithWalletButton
											documentKind="photoID"
											label="verifyIdentity"
											buttonStyle="black"
											onButtonPress={requestPhotoIDBasicInfo}
											style={{ height: 54 }}
										/>
									) : null}
								</Group>

				{isSupported && (
					<>
						<Group name="Request Identity Information (Programmatic)">
							<Button
								title="Request Identity (Try All)"
								onPress={requestTryAll}
								disabled={isLoading}
							/>
							<View style={{ height: 10 }} />
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

						<Group name="Request National ID (Programmatic)">
							<Button
								title="Request Basic Info (National ID)"
								onPress={requestNationalIDBasicInfo}
								disabled={isLoading}
							/>
						</Group>

						<Group name="Request Photo ID (Programmatic)">
							<Button
								title="Request Basic Info (Photo ID)"
								onPress={requestPhotoIDBasicInfo}
								disabled={isLoading}
							/>
						</Group>
					</>
				)}

				{lastRequestSuccess !== null && (
					<Group name="Last Request Status">
						<Text style={styles.text}>
							{lastRequestSuccess ? "Request completed" : "Request failed"}
						</Text>
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
