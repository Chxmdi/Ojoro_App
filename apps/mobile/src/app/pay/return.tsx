import { useLocalSearchParams } from 'expo-router';

import { PayReturnScreen } from '@/features/payments/PayReturnScreen';

/**
 * `/pay/return?checkout_id=…&result=success|cancel`: where Stripe Checkout's return link lands
 * (through `payments-return`, as `ojoro://pay/return…` on devices or the web origin on web).
 */
export default function PayReturnRoute() {
  const { checkout_id, result } = useLocalSearchParams<{ checkout_id?: string; result?: string }>();
  return <PayReturnScreen key={checkout_id ?? ''} checkoutId={checkout_id ?? ''} result={result} />;
}
