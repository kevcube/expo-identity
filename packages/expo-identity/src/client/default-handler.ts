import type { IdentityHandler } from '../shared/protocol';
import { IdentityClientException } from './errors';

const unavailableHandler: IdentityHandler = {
  async capabilities() {
    throw new IdentityClientException(
      'UNAVAILABLE',
      'Digital identity presentation is unavailable on this platform.'
    );
  },
  async present() {
    throw new IdentityClientException(
      'UNAVAILABLE',
      'Digital identity presentation is unavailable on this platform.'
    );
  },
};

export default unavailableHandler;
