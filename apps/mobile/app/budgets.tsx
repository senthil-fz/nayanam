// Stack route for the Budgets management screen — reached from Settings →
// Budgets or from the Home BudgetsWidget "See all" affordance. Matches the
// `settings.tsx` stack presentation (card, native header + back).

import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIGHT } from '@nayanam/ui-tokens';
import { BudgetsScreen } from '../src/features/budgets/BudgetsScreen';

export default function BudgetsRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Budgets',
          headerShown: true,
          presentation: 'card',
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView
        style={{ flex: 1, backgroundColor: LIGHT.bg }}
        edges={['bottom']}
      >
        <BudgetsScreen />
      </SafeAreaView>
    </>
  );
}
