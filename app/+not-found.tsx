import { Redirect } from 'expo-router';

/** Fallback when a web URL does not match a known screen. */
export default function NotFound() {
  return <Redirect href="/competition-hub" />;
}
