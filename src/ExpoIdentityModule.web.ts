import { registerWebModule, NativeModule } from 'expo';

import { ExpoIdentityModuleEvents } from './ExpoIdentity.types';

class ExpoIdentityModule extends NativeModule<ExpoIdentityModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ExpoIdentityModule, 'ExpoIdentityModule');
