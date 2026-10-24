// Placeholder screen proving the Convex wiring. Track B replaces it.
import { useQuery } from 'convex/react';
import { Text, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';

export default function Home() {
  const patient = useQuery(api.patients.getDemo);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{patient === undefined ? 'Loading…' : (patient?.name ?? 'No patient seeded')}</Text>
    </View>
  );
}
