import { initServerObservability } from '@/lib/observability';

export async function register() {
  initServerObservability();
}
