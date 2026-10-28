import { Redirect } from 'expo-router';

/** The Coach tab opens the full-screen coach; this only catches a direct link to the tab. */
export default function CoachTab() {
  return <Redirect href="/ai-coach" />;
}
