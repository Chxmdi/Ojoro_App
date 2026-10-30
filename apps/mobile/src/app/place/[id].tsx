import { useLocalSearchParams } from 'expo-router';

import { PlaceScreen } from '@/features/places/PlaceScreen';

/** `/place/[id]`: Place (Place.png). */
export default function PlaceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceScreen key={id} id={id} />;
}
