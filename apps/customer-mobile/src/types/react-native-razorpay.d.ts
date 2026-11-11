declare module 'react-native-razorpay' {
  type CheckoutSuccess = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  };

  type CheckoutError = { code?: number | string; description?: string };

  export default class RazorpayCheckout {
    static open(options: Record<string, unknown>): Promise<CheckoutSuccess>;
    static onExternalWalletSelection(callback: (data: unknown) => void): void;
  }
}
