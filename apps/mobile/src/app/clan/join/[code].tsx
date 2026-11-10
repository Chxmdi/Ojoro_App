import { JoinClanScreen } from '@/features/clans/JoinClanScreen';

/** `/clan/join/[code]` (`ojoro://clan/join/<code>`, the clan INVITE link): JOIN THE CLAN with the code. */
export default function JoinClanRoute() {
  return <JoinClanScreen />;
}
