import {
  createMemoryTransactionStore,
  defineIdentityRequests,
  expoIdentity,
  type IdentityTransactionStore,
} from 'expo-identity/server';

export const requests = defineIdentityRequests({
  ageOver21: {
    document: {
      doctype: 'org.iso.18013.5.1.mDL',
      namespace: 'org.iso.18013.5.1',
      apple: 'driversLicense',
    },
    claims: {
      ageOver21: {
        type: 'ageAtLeast',
        age: 21,
        retain: false,
      },
    },
  },
});

type ExampleServerGlobal = typeof globalThis & {
  __expoIdentityExampleTransactionStore?: IdentityTransactionStore;
};

const exampleServerGlobal = globalThis as ExampleServerGlobal;
const transactionStore =
  exampleServerGlobal.__expoIdentityExampleTransactionStore ??
  (exampleServerGlobal.__expoIdentityExampleTransactionStore =
    createMemoryTransactionStore());

export const identity = expoIdentity({
  requests,
  apple: { mode: 'simulator' },
  transactionStore,
  onVerified({ identity: verified }) {
    return {
      request: verified.request,
      assurance: verified.assurance,
      ageOver21: verified.document.claims.ageOver21,
    };
  },
});
