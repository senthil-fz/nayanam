import { Tabs } from 'expo-router';
import { LIGHT, ACCENTS } from '@nayanam/ui-tokens';
import { HomeIcon, StatsIcon, BillsIcon, CardIcon } from '../../src/features/cards/icons';

// Bottom-tab shell matching the prototype: Home · Stats · Bills · Cards · Settings.
// The central scan FAB is deferred to a later phase; the scan action lives on Home.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENTS.indigo.hex,
        tabBarInactiveTintColor: LIGHT.textFaint,
        tabBarStyle: {
          backgroundColor: LIGHT.surface,
          borderTopColor: LIGHT.border,
          borderTopWidth: 0.5,
          height: 84,
          paddingBottom: 28,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <HomeIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color }) => <StatsIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => <StatsIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: 'Bills',
          tabBarIcon: ({ color }) => <BillsIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          title: 'Cards',
          tabBarIcon: ({ color }) => <CardIcon color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
