export type { RazorpayCheckoutOptions, RazorpayPaymentSuccess } from './razorpay.types';
import type { RazorpayCheckoutOptions, RazorpayPaymentSuccess } from './razorpay.types';

export async function openNativeRazorpayCheckout(_options: RazorpayCheckoutOptions): Promise<RazorpayPaymentSuccess> {
  throw new Error('Native Razorpay checkout is unavailable on this platform.');
}
