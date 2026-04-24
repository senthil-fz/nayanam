import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '../components/AppShell';
import { HomeScreen } from '../features/home/HomeScreen';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <AppShell>
      <HomeScreen />
    </AppShell>
  );
}
