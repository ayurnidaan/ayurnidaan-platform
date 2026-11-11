import RazorpayCheckout from 'react-native-razorpay';
import type { RazorpayCheckoutOptions, RazorpayPaymentSuccess } from './razorpay.types';

export type { RazorpayCheckoutOptions, RazorpayPaymentSuccess } from './razorpay.types';

export async function openNativeRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<RazorpayPaymentSuccess> {
  return RazorpayCheckout.open(options);
}
