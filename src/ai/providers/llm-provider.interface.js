export class LlmProviderInterface {
  async generateCustomerTurn(context) {
    throw new Error('generateCustomerTurn must be implemented by subclass');
  }
}

export default LlmProviderInterface;
