// Stats tab entry — a thin shell that delegates everything to the
// Phase 7 orchestrator in `src/features/stats/StatsScreen.tsx`.

import { SafeAreaView } from 'react-native-safe-area-context';
import { LIGHT } from '@nayanam/ui-tokens';
import { StatsScreen } from '../../src/features/stats/StatsScreen';

export default function StatsTab() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      <StatsScreen />
    </SafeAreaView>
  );
}
