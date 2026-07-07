import { apiJson } from '@/lib/api';
import { BillingPanel } from '@/components/orchestra/billing-panel';
import type { Subscription } from '@/lib/types';

export default async function BillingPage() {
  const subscription = await apiJson<Subscription>('/api/billing/subscription');
  return <BillingPanel initialSubscription={subscription} />;
}
