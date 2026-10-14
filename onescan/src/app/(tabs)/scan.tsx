import { Redirect } from 'expo-router';

// The Scan tab opens the camera modal (see AppTabBar); a direct link to this tab goes Home.
export default function ScanTabRoute() {
  return <Redirect href="/" />;
}
