import type { IdentityProtocol, ProtocolRequest } from "../shared/protocol";
import type {
  IdentityRequestDefinition,
  IdentityRequestDefinitions,
  VerifiedIdentity,
} from "../shared/requests";

export type IdentityPlatform = "ios" | "android" | "web";

export type TrustAnchorSet = {
  issuance: string[];
  status: string[];
};

export type AppleIdentityConfiguration =
  | { mode: "simulator" }
  | {
      mode: "production";
      merchantIdentifier: string;
      teamIdentifier: string;
      encryptionCertificate: string;
      encryptionPrivateKey: string;
    };

export type OpenId4VpConfiguration = {
  clientMetadata?: Record<string, unknown>;
  requestSigning?: {
    certificateChain: string[];
    privateKey: string;
  };
};

export type ReaderAuthenticationConfiguration = {
  certificateChain: string[];
  privateKey: string;
};

export type TrustedOriginPredicate = (
  origin: string,
  request: Request,
) => boolean | Promise<boolean>;

export type IdentityTransaction = {
  id: string;
  requestKey: string;
  request: IdentityRequestDefinition;
  platform: IdentityPlatform;
  protocol: IdentityProtocol;
  expectedOrigin?: string;
  nonce: string;
  expiresAt: number;
  protocolRequest: ProtocolRequest;
  privateData: Record<string, unknown>;
};

export interface IdentityTransactionStore {
  set(transaction: IdentityTransaction): Promise<void>;
  take(id: string): Promise<IdentityTransaction | null>;
}

export type VerifiedContext<TRequests extends IdentityRequestDefinitions> = {
  [TKey in Extract<keyof TRequests, string>]: {
    identity: VerifiedIdentity<TKey, TRequests[TKey]>;
    request: TKey;
  };
}[Extract<keyof TRequests, string>];

export type ExpoIdentityOptions<
  TRequests extends IdentityRequestDefinitions,
  TCallbackOutput = never,
> = {
  basePath?: string;
  requests: TRequests;
  trustedOrigins?: string[] | TrustedOriginPredicate;
  transactionStore: IdentityTransactionStore;
  transactionTTLSeconds?: number;
  trustAnchors?: TrustAnchorSet[];
  apple?: AppleIdentityConfiguration;
  openid4vp?: OpenId4VpConfiguration;
  readerAuthentication?: ReaderAuthenticationConfiguration;
  onVerified?: (
    context: VerifiedContext<TRequests>,
    request: Request,
  ) => TCallbackOutput | Promise<TCallbackOutput>;
};

export type DefaultServerOutputs<TRequests extends IdentityRequestDefinitions> =
  {
    [TKey in Extract<keyof TRequests, string>]: VerifiedIdentity<
      TKey,
      TRequests[TKey]
    >;
  };

export type CallbackServerOutputs<
  TRequests extends IdentityRequestDefinitions,
  TCallbackOutput,
> = {
  [TKey in Extract<keyof TRequests, string>]: Awaited<TCallbackOutput>;
};

export interface ExpoIdentityServer<
  TRequests extends IdentityRequestDefinitions = IdentityRequestDefinitions,
  TOutputs extends Record<string, unknown> = DefaultServerOutputs<TRequests>,
> {
  readonly $types: {
    requests: TRequests;
    outputs: TOutputs;
  };
  readonly handler: (request: Request) => Promise<Response>;
  ready(): Promise<void>;
}
