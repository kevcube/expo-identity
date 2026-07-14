import type {
  IdentityTransaction,
  IdentityTransactionStore,
} from './types';

export function createMemoryTransactionStore(): IdentityTransactionStore {
  const transactions = new Map<string, IdentityTransaction>();

  return {
    async set(transaction) {
      const now = Date.now();
      for (const [id, existing] of transactions) {
        if (existing.expiresAt <= now) {
          transactions.delete(id);
        }
      }
      transactions.set(transaction.id, transaction);
    },
    async take(id) {
      const transaction = transactions.get(id) ?? null;
      transactions.delete(id);
      return transaction;
    },
  };
}
