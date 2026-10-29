import { useLocalSearchParams } from 'expo-router';

import { PosterScreen } from '@/features/events/PosterScreen';

/** `/event/[id]/poster`: the 4:5 share poster for an accepted Call-Out (Poster.png). */
export default function EventPosterRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PosterScreen eventId={id} />;
}
